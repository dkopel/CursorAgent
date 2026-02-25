import { useState } from 'react';
import { createDatapoint } from '../api';

const TYPES = {
  police: { emoji: '🚔', label: 'Police' },
  fbi: { emoji: '🕵️', label: 'FBI' },
  ice: { emoji: '🧊', label: 'ICE' },
  atf: { emoji: '🔫', label: 'ATF' },
  other: { emoji: '📍', label: 'Other' },
};

const EMOJI_PICKER = ['📍','🚨','🛑','⚠️','🚁','🏛️','📡','👮','🔍','🚧','💀','❗','🔒','👁️','📢','🐕','🚐','🏢'];

export default function ReportPanel({ position, onClose, onCreated }) {
  const [type, setType] = useState('');
  const [label, setLabel] = useState('');
  const [customEmoji, setCustomEmoji] = useState('📍');
  const [customName, setCustomName] = useState('');
  const [duration, setDuration] = useState('60');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isOther = type === 'other';

  async function handleSubmit() {
    if (!type) return;
    if (isOther && !customName.trim()) {
      setError('Give your custom report a name');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const dp = await createDatapoint({
        type,
        label: isOther ? customName.trim() : (label.trim() || null),
        lat: position.lat,
        lng: position.lng,
        duration: parseInt(duration),
        custom_emoji: isOther ? customEmoji : undefined,
      });
      onCreated(dp);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const submitEmoji = isOther ? customEmoji : (type ? TYPES[type].emoji : '');

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
            <span className="emoji">{key === 'other' && type === 'other' ? customEmoji : val.emoji}</span>
            {val.label}
          </button>
        ))}
      </div>

      {isOther && (
        <div className="other-config">
          <input
            className="note-input"
            type="text"
            placeholder="Name this report (required)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={50}
          />
          <div className="emoji-picker-label">Choose an emoji for the pin:</div>
          <div className="emoji-picker">
            {EMOJI_PICKER.map((em) => (
              <button
                key={em}
                className={`emoji-option ${customEmoji === em ? 'selected' : ''}`}
                onClick={() => setCustomEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isOther && (
        <input
          className="note-input"
          type="text"
          placeholder="Add a note (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={100}
        />
      )}

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
        {submitting ? 'Reporting...' : `Report ${submitEmoji}`}
      </button>
    </div>
  );
}
