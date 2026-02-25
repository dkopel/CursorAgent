import { useState } from 'react';

const TYPES = {
  police: { emoji: '🚔', label: 'Police' },
  fbi: { emoji: '🕵️', label: 'FBI' },
  ice: { emoji: '🧊', label: 'ICE' },
  atf: { emoji: '🔫', label: 'ATF' },
  other: { emoji: '📍', label: 'Other' },
};

function getDisplay(dp) {
  if (dp.type === 'other') {
    return { emoji: dp.custom_emoji || '📍', label: dp.label || 'Other' };
  }
  return TYPES[dp.type] || { emoji: '📍', label: dp.type };
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ClusterDetailPanel({ cluster, userId, onClose, onDelete }) {
  const [expandedType, setExpandedType] = useState(null);

  const grouped = {};
  for (const dp of cluster.points) {
    const display = getDisplay(dp);
    const key = dp.type === 'other' ? `other:${display.label}` : dp.type;
    if (!grouped[key]) {
      grouped[key] = { display, points: [] };
    }
    grouped[key].points.push(dp);
  }

  const sortedGroups = Object.entries(grouped).sort((a, b) => b[1].points.length - a[1].points.length);

  return (
    <div className="cluster-panel">
      <div className="cluster-panel-header">
        <h3>
          <span className="cluster-panel-count">{cluster.points.length}</span>
          {' '}Reports at this location
        </h3>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      <div className="cluster-groups">
        {sortedGroups.map(([key, group]) => {
          const isExpanded = expandedType === key;
          return (
            <div key={key} className="cluster-group">
              <button
                className={`cluster-group-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedType(isExpanded ? null : key)}
              >
                <div className="cluster-group-left">
                  <span className="cluster-group-emoji">{group.display.emoji}</span>
                  <span className="cluster-group-label">{group.display.label}</span>
                </div>
                <div className="cluster-group-right">
                  <span className="cluster-group-count">{group.points.length} reported</span>
                  <span className="cluster-group-chevron">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="cluster-group-items">
                  {group.points.map((dp) => (
                    <div key={dp.id} className="cluster-item">
                      <div className="cluster-item-info">
                        {dp.type !== 'other' && dp.label && (
                          <div className="cluster-item-label">"{dp.label}"</div>
                        )}
                        <div className="cluster-item-meta">
                          by @{dp.username} &middot; {timeAgo(dp.created_at)}
                        </div>
                      </div>
                      {dp.user_id === userId && (
                        <button
                          className="cluster-item-delete"
                          onClick={() => onDelete(dp.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
