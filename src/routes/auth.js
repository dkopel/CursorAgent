import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { validatePassword, hashPassword, verifyPassword } from '../utils/password.js';
import { validateEmail } from '../utils/email.js';
import { sendPasswordResetEmail, getSentEmails } from '../utils/mailer.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      return res.status(400).json({ error: emailResult.error });
    }

    const passwordResult = validatePassword(password);
    if (!passwordResult.valid) {
      return res.status(400).json({ error: 'Password does not meet requirements.', details: passwordResult.errors });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailResult.normalized);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const id = uuidv4();
    const passwordHash = await hashPassword(password);

    db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, emailResult.normalized, passwordHash);

    res.status(201).json({
      message: 'Account created successfully.',
      user: { id, email: emailResult.normalized },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalized = email.trim().toLowerCase();
    const db = getDb();
    const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(normalized);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      return res.status(400).json({ error: emailResult.error });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(emailResult.normalized);

    if (!user) {
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tokenId = uuidv4();

    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(tokenId, user.id, tokenHash, expiresAt);

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password.html?token=${resetToken}&id=${tokenId}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { tokenId, token, newPassword, confirmPassword } = req.body;

    if (!tokenId || !token) {
      return res.status(400).json({ error: 'Invalid reset link.' });
    }

    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.valid) {
      return res.status(400).json({ error: 'Password does not meet requirements.', details: passwordResult.errors });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const db = getDb();
    const resetRecord = db.prepare('SELECT * FROM password_reset_tokens WHERE id = ? AND token_hash = ? AND used = 0').get(tokenId, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(tokenId);
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const passwordHash = await hashPassword(newPassword);

    const updateUser = db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const markUsed = db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?');

    const transaction = db.transaction(() => {
      updateUser.run(passwordHash, resetRecord.user_id);
      markUsed.run(tokenId);
    });
    transaction();

    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required.' });
    }

    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.valid) {
      return res.status(400).json({ error: 'New password does not meet requirements.', details: passwordResult.errors });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newHash, user.id);

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/dev/sent-emails', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.json({ emails: getSentEmails() });
});

export default router;
