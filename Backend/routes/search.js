const express = require('express');
const router = express.Router();
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');

// GET /api/search?q=...
router.get('/', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ projects: [], tasks: [] });

    const searchParam = `%${q}%`;

    // Search Projects
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      WHERE (pm.user_id IS NOT NULL OR p.owner_id = ?)
        AND (p.name LIKE ? OR p.description LIKE ?)
      LIMIT 10
    `).all(req.user.id, req.user.id, searchParam, searchParam);

    // Search Tasks
    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name, b.name as board_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN boards b ON b.id = t.board_id
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      WHERE (pm.user_id IS NOT NULL OR p.owner_id = ?)
        AND (t.title LIKE ? OR t.description LIKE ?)
      LIMIT 10
    `).all(req.user.id, req.user.id, searchParam, searchParam);

    res.json({ projects, tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
