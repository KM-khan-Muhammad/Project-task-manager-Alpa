const express = require('express');
const router = express.Router();
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');

// GET /api/my-tasks
router.get('/', authenticateToken, (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*, 
        p.name as project_name,
        b.name as board_name, b.color as board_color,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) as comment_count
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN boards b ON b.id = t.board_id
      WHERE t.assignee_id = ?
      ORDER BY t.due_date ASC, t.created_at DESC
    `).all(req.user.id);

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
