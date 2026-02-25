import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../auth.js';

const router = Router();

const DATAPOINT_TYPES = {
  police: { emoji: '🚔', label: 'Police' },
  fbi: { emoji: '🕵️', label: 'FBI' },
  ice: { emoji: '🧊', label: 'ICE' },
  atf: { emoji: '🔫', label: 'ATF' },
  other: { emoji: '📍', label: 'Other' },
};

router.get('/types', (_req, res) => {
  res.json(DATAPOINT_TYPES);
});

router.get('/', (req, res) => {
  const { lat, lng, radius = 50 } = req.query;

  db.prepare(`DELETE FROM datapoints WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`).run();

  let rows;
  if (lat && lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);
    const latDelta = radiusNum / 111.0;
    const lngDelta = radiusNum / (111.0 * Math.cos((latNum * Math.PI) / 180));

    rows = db.prepare(`
      SELECT d.*, u.username
      FROM datapoints d
      JOIN users u ON d.user_id = u.id
      WHERE d.lat BETWEEN ? AND ?
        AND d.lng BETWEEN ? AND ?
      ORDER BY d.created_at DESC
    `).all(
      latNum - latDelta, latNum + latDelta,
      lngNum - lngDelta, lngNum + lngDelta,
    );
  } else {
    rows = db.prepare(`
      SELECT d.*, u.username
      FROM datapoints d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
      LIMIT 200
    `).all();
  }

  res.json(rows);
});

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAX_DISTANCE_KM = 0.5;

router.post('/', authenticateToken, (req, res) => {
  const { type, label, lat, lng, duration = 60, custom_emoji, device_lat, device_lng } = req.body;

  if (!type || lat == null || lng == null) {
    return res.status(400).json({ error: 'type, lat, and lng are required' });
  }

  if (!DATAPOINT_TYPES[type]) {
    return res.status(400).json({ error: `Invalid type. Valid types: ${Object.keys(DATAPOINT_TYPES).join(', ')}` });
  }

  if (type === 'other' && !label) {
    return res.status(400).json({ error: 'A name is required for custom reports' });
  }

  const isTrusted = !!req.user.trusted;

  if (!isTrusted) {
    if (device_lat == null || device_lng == null) {
      return res.status(400).json({ error: 'Device location is required for reporting' });
    }
    const dist = haversineKm(device_lat, device_lng, lat, lng);
    if (dist > MAX_DISTANCE_KM) {
      return res.status(403).json({
        error: 'You can only report at your current location',
      });
    }
  }

  const durationMinutes = Math.min(Math.max(parseInt(duration) || 60, 5), 1440);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const emoji = type === 'other' && custom_emoji ? custom_emoji : null;

  const result = db.prepare(`
    INSERT INTO datapoints (user_id, type, label, custom_emoji, lat, lng, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, type, label || null, emoji, lat, lng, expiresAt);

  const datapoint = db.prepare(`
    SELECT d.*, u.username
    FROM datapoints d
    JOIN users u ON d.user_id = u.id
    WHERE d.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(datapoint);
});

router.delete('/:id', authenticateToken, (req, res) => {
  const datapoint = db.prepare('SELECT * FROM datapoints WHERE id = ?').get(req.params.id);

  if (!datapoint) {
    return res.status(404).json({ error: 'Datapoint not found' });
  }

  if (datapoint.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own datapoints' });
  }

  db.prepare('DELETE FROM datapoints WHERE id = ?').run(req.params.id);
  res.json({ message: 'Datapoint deleted' });
});

export default router;
