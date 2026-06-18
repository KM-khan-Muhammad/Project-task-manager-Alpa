const express = require('express');
const router = express.Router();
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');

// GET /api/users - Get all users
router.get('/', authenticateToken, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, email, avatar FROM users').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/search?q=email
router.get('/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ users: [] });
    const users = db.prepare(`
      SELECT id, username, email, avatar FROM users
      WHERE (email LIKE ? OR username LIKE ?) AND id != ?
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`, req.user.id);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
