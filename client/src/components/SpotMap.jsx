import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import ReportPanel from './ReportPanel';
import ClusterDetailPanel from './ClusterDetailPanel';
import { getDatapoints, deleteDatapoint } from '../api';
import 'leaflet/dist/leaflet.css';

const TYPES = {
  police: { emoji: '🚔', label: 'Police' },
  fbi: { emoji: '🕵️', label: 'FBI' },
  ice: { emoji: '🧊', label: 'ICE' },
  atf: { emoji: '🔫', label: 'ATF' },
  other: { emoji: '📍', label: 'Other' },
};

function getDatapointDisplay(dp) {
  if (dp.type === 'other') {
    return { emoji: dp.custom_emoji || '📍', label: dp.label || 'Other' };
  }
  return TYPES[dp.type] || { emoji: '📍', label: dp.type };
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CLUSTER_RADIUS_M = 150;

function clusterDatapoints(points) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const cluster = { points: [points[i]], lat: points[i].lat, lng: points[i].lng };
    used.add(i);

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      if (haversineMeters(cluster.lat, cluster.lng, points[j].lat, points[j].lng) <= CLUSTER_RADIUS_M) {
        cluster.points.push(points[j]);
        used.add(j);
      }
    }

    let sumLat = 0, sumLng = 0;
    for (const p of cluster.points) { sumLat += p.lat; sumLng += p.lng; }
    cluster.lat = sumLat / cluster.points.length;
    cluster.lng = sumLng / cluster.points.length;

    clusters.push(cluster);
  }
  return clusters;
}

function createEmojiIcon(emoji) {
  return L.divIcon({
    html: `<span style="font-size:2rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">${emoji}</span>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function createClusterIcon(count) {
  const size = count <= 3 ? 44 : count <= 7 ? 52 : count <= 15 ? 60 : count <= 30 ? 68 : 76;
  const fontSize = size * 0.4;
  const opacity = Math.min(0.5 + count * 0.04, 0.95);
  return L.divIcon({
    html: `<div class="cluster-marker" style="
      width:${size}px;height:${size}px;
      font-size:${fontSize}px;
      background:rgba(239,68,68,${opacity});
      box-shadow:0 0 ${size * 0.4}px rgba(239,68,68,${opacity * 0.7}), 0 2px 8px rgba(0,0,0,0.4);
    ">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const userIcon = L.divIcon({
  html: '<span style="font-size:1.6rem;filter:drop-shadow(0 2px 6px rgba(59,130,246,0.8))">🔵</span>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function MapClickHandler({ onMapClick, enabled }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng);
    },
  });
  return null;
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 1 });
  }, [center, map]);
  return null;
}

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function SpotMap({ user, onLogout }) {
  const DEFAULT_LAT = 40.7128;
  const DEFAULT_LNG = -74.006;
  const defaultPos = useRef({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [position, setPosition] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [hasGps, setHasGps] = useState(false);
  const [datapoints, setDatapoints] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [reportPos, setReportPos] = useState(null);
  const [deviceLoc, setDeviceLoc] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [toast, setToast] = useState('');
  const [locatingForReport, setLocatingForReport] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const geoInitialized = useRef(false);
  const toastTimer = useRef(null);
  const refreshTimer = useRef(null);

  const isTrusted = !!user.trusted;

  const clusters = useMemo(() => clusterDatapoints(datapoints), [datapoints]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  const fetchDatapoints = useCallback(async (lat, lng) => {
    try {
      const data = await getDatapoints(lat, lng);
      setDatapoints(data);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    if (geoInitialized.current) return;
    geoInitialized.current = true;

    const initLocation = (loc) => {
      setPosition(loc);
      setFlyTarget(loc);
      fetchDatapoints(loc.lat, loc.lng);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setHasGps(true);
          setDeviceLoc(loc);
          initLocation(loc);
        },
        () => initLocation(defaultPos.current),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      getDatapoints(defaultPos.current.lat, defaultPos.current.lng)
        .then(setDatapoints)
        .catch(() => {});
    }
  }, [fetchDatapoints]);

  useEffect(() => {
    if (!position) return;
    refreshTimer.current = setInterval(() => {
      fetchDatapoints(position.lat, position.lng);
    }, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [position, fetchDatapoints]);

  function handleLocate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(loc);
        setDeviceLoc(loc);
        setHasGps(true);
        setFlyTarget({ ...loc });
      },
      () => showToast('Could not get location')
    );
  }

  function handleRefresh() {
    if (position) {
      fetchDatapoints(position.lat, position.lng);
      showToast('Refreshed!');
    }
  }

  async function startReport() {
    setSelectedCluster(null);
    if (!isTrusted) {
      setLocatingForReport(true);
      try {
        const loc = await getDeviceLocation();
        setPosition(loc);
        setDeviceLoc(loc);
        setHasGps(true);
        setReportPos(loc);
        setReporting(true);
      } catch {
        showToast('Location required to report — please enable GPS');
      } finally {
        setLocatingForReport(false);
      }
    } else {
      setReportPos(position);
      setReporting(true);
    }
  }

  function handleMapClick(latlng) {
    if (reporting && isTrusted) {
      setReportPos({ lat: latlng.lat, lng: latlng.lng });
    }
    if (!reporting) {
      setSelectedCluster(null);
    }
  }

  function handleCreated(dp) {
    setDatapoints((prev) => [dp, ...prev]);
    setReporting(false);
    const display = getDatapointDisplay(dp);
    showToast(`${display.emoji} Reported!`);
  }

  async function handleDelete(id) {
    try {
      await deleteDatapoint(id);
      setDatapoints((prev) => prev.filter((d) => d.id !== id));
      if (selectedCluster) {
        const remaining = selectedCluster.points.filter((d) => d.id !== id);
        if (remaining.length === 0) {
          setSelectedCluster(null);
        } else {
          setSelectedCluster({ ...selectedCluster, points: remaining });
        }
      }
      showToast('Deleted!');
    } catch (err) {
      showToast(err.message);
    }
  }

  const center = position || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };

  return (
    <>
      <header className="app-header">
        <div className="brand">📍 SpotMap</div>
        <div className="user-info">
          <span>@{user.username}</span>
          {isTrusted && <span className="trusted-badge" title="Trusted user — can report anywhere">⭐</span>}
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="map-container">
        <MapContainer center={[center.lat, center.lng]} zoom={14} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} enabled={true} />
          {flyTarget && <FlyTo center={[flyTarget.lat, flyTarget.lng]} />}

          {position && <Marker position={[position.lat, position.lng]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>}

          {clusters.map((cluster, idx) => {
            if (cluster.points.length === 1) {
              const dp = cluster.points[0];
              const info = getDatapointDisplay(dp);
              return (
                <Marker
                  key={dp.id}
                  position={[dp.lat, dp.lng]}
                  icon={createEmojiIcon(info.emoji)}
                  eventHandlers={{
                    click: () => setSelectedCluster(cluster),
                  }}
                >
                  <Popup>
                    <div className="datapoint-popup">
                      <div className="popup-emoji">{info.emoji}</div>
                      <div className="popup-type">{info.label}</div>
                      {dp.type !== 'other' && dp.label && <div className="popup-label">"{dp.label}"</div>}
                      <div className="popup-meta">
                        by @{dp.username} &middot; {timeAgo(dp.created_at)}
                      </div>
                      {dp.user_id === user.id && (
                        <button className="popup-delete" onClick={() => handleDelete(dp.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            }

            return (
              <Marker
                key={`cluster-${idx}`}
                position={[cluster.lat, cluster.lng]}
                icon={createClusterIcon(cluster.points.length)}
                eventHandlers={{
                  click: (e) => {
                    e.originalEvent?.stopPropagation?.();
                    setSelectedCluster(cluster);
                  },
                }}
              />
            );
          })}

          {reporting && reportPos && (
            <Marker
              position={[reportPos.lat, reportPos.lng]}
              icon={createEmojiIcon('🎯')}
            >
              <Popup>{isTrusted ? 'Report location — tap map to move' : 'Reporting at your location'}</Popup>
            </Marker>
          )}
        </MapContainer>

        <button className="locate-btn" onClick={handleLocate} title="My location">
          🎯
        </button>
        <button className="refresh-btn" onClick={handleRefresh} title="Refresh">
          🔄
        </button>

        {!reporting && !selectedCluster && (
          <button className="report-btn" onClick={startReport} disabled={locatingForReport}>
            {locatingForReport ? '📡 Getting location...' : '➕ Report'}
          </button>
        )}

        {reporting && reportPos && (
          <ReportPanel
            position={reportPos}
            deviceLocation={deviceLoc}
            onClose={() => setReporting(false)}
            onCreated={handleCreated}
          />
        )}

        {selectedCluster && !reporting && (
          <ClusterDetailPanel
            cluster={selectedCluster}
            userId={user.id}
            onClose={() => setSelectedCluster(null)}
            onDelete={handleDelete}
          />
        )}
      </div>

      {!hasGps && !reporting && (
        <div className="toast">📡 Enable location services to report</div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
