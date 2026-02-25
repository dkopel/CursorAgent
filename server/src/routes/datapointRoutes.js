import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../auth.js';

const router = Router();

const DATAPOINT_TYPES = {
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

router.post('/', authenticateToken, (req, res) => {
  const { type, label, lat, lng, duration = 60 } = req.body;

  if (!type || lat == null || lng == null) {
    return res.status(400).json({ error: 'type, lat, and lng are required' });
  }

  if (!DATAPOINT_TYPES[type]) {
    return res.status(400).json({ error: `Invalid type. Valid types: ${Object.keys(DATAPOINT_TYPES).join(', ')}` });
  }

  const durationMinutes = Math.min(Math.max(parseInt(duration) || 60, 5), 1440);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO datapoints (user_id, type, label, lat, lng, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, type, label || null, lat, lng, expiresAt);

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
