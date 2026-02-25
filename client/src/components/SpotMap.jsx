import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import ReportPanel from './ReportPanel';
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
    return {
      emoji: dp.custom_emoji || '📍',
      label: dp.label || 'Other',
    };
  }
  return TYPES[dp.type] || { emoji: '📍', label: dp.type };
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
  const geoInitialized = useRef(false);
  const toastTimer = useRef(null);
  const refreshTimer = useRef(null);

  const isTrusted = !!user.trusted;

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
      // silent fail on fetch
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
          <MapClickHandler onMapClick={handleMapClick} enabled={reporting && isTrusted} />
          {flyTarget && <FlyTo center={[flyTarget.lat, flyTarget.lng]} />}

          {position && <Marker position={[position.lat, position.lng]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>}

          {datapoints.map((dp) => {
            const info = getDatapointDisplay(dp);
            return (
              <Marker
                key={dp.id}
                position={[dp.lat, dp.lng]}
                icon={createEmojiIcon(info.emoji)}
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

        {!reporting && (
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
      </div>

      {!hasGps && !reporting && (
        <div className="toast">📡 Enable location services to report</div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
