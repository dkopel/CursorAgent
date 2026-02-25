import { useState } from 'react';
import { createDatapoint } from '../api';

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

export default function ReportPanel({ position, onClose, onCreated }) {
  const [type, setType] = useState('');
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState('60');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!type) return;
    setSubmitting(true);
    setError('');

    try {
      const dp = await createDatapoint({
        type,
        label: label.trim() || null,
        lat: position.lat,
        lng: position.lng,
        duration: parseInt(duration),
      });
      onCreated(dp);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="report-panel">
      <h3>
        <span>Report Something</span>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </h3>

      {error && <div className="error-msg">{error}</div>}

      <div className="type-grid">
        {Object.entries(TYPES).map(([key, val]) => (
          <button
            key={key}
            className={`type-btn ${type === key ? 'selected' : ''}`}
            onClick={() => setType(key)}
          >
            <span className="emoji">{val.emoji}</span>
            {val.label}
          </button>
        ))}
      </div>

      <input
        className="note-input"
        type="text"
        placeholder="Add a note (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={100}
      />

      <div className="duration-row">
        <label>Expires in:</label>
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="480">8 hours</option>
          <option value="1440">24 hours</option>
        </select>
      </div>

      <button
        className="btn-submit-report"
        onClick={handleSubmit}
        disabled={!type || submitting}
      >
        {submitting ? 'Reporting...' : `Report ${type ? TYPES[type].emoji : ''}`}
      </button>
    </div>
  );
}
