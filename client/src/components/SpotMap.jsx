import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import ReportPanel from './ReportPanel';
import { getDatapoints, deleteDatapoint } from '../api';
import 'leaflet/dist/leaflet.css';

const TYPES = {
  cop: { emoji: '🚔', label: 'Police' },
  accident: { emoji: '💥', label: 'Accident' },
  hazard: { emoji: '⚠️', label: 'Hazard' },
  construction: { emoji: '🚧', label: 'Construction' },
  speed_trap: { emoji: '📸', label: 'Speed Trap' },
  traffic: { emoji: '🚗', label: 'Heavy Traffic' },
  closure: { emoji: '🚫', label: 'Road Closure' },
  event: { emoji: '🎉', label: 'Event' },
  other: { emoji: '📍', label: 'Other' },
};

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

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
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

export default function SpotMap({ user, onLogout }) {
  const DEFAULT_LAT = 40.7128;
  const DEFAULT_LNG = -74.006;
  const defaultPos = useRef({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [position, setPosition] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [datapoints, setDatapoints] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [reportPos, setReportPos] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [toast, setToast] = useState('');
  const geoInitialized = useRef(false);
  const toastTimer = useRef(null);
  const refreshTimer = useRef(null);

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
        (pos) => initLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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

  function startReport() {
    if (position) {
      setReportPos(position);
      setReporting(true);
    }
  }

  function handleMapClick(latlng) {
    if (reporting) {
      setReportPos({ lat: latlng.lat, lng: latlng.lng });
    }
  }

  function handleCreated(dp) {
    setDatapoints((prev) => [dp, ...prev]);
    setReporting(false);
    showToast(`${TYPES[dp.type]?.emoji || '📍'} Reported!`);
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

  const center = position || { lat: 40.7128, lng: -74.006 };

  return (
    <>
      <header className="app-header">
        <div className="brand">📍 SpotMap</div>
        <div className="user-info">
          <span>@{user.username}</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="map-container">
        <MapContainer center={[center.lat, center.lng]} zoom={14} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {flyTarget && <FlyTo center={[flyTarget.lat, flyTarget.lng]} />}

          {position && <Marker position={[position.lat, position.lng]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>}

          {datapoints.map((dp) => {
            const info = TYPES[dp.type] || TYPES.other;
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
                    {dp.label && <div className="popup-label">"{dp.label}"</div>}
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
              <Popup>Report location — tap map to move</Popup>
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
          <button className="report-btn" onClick={startReport}>
            ➕ Report
          </button>
        )}

        {reporting && reportPos && (
          <ReportPanel
            position={reportPos}
            onClose={() => setReporting(false)}
            onCreated={handleCreated}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
