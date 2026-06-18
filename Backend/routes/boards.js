const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');
const { requireProjectAccess, requireProjectAdmin } = require('../middleware/projectAccess');
const { broadcastToProject } = require('../websocket');

// GET /api/projects/:projectId/boards
router.get('/', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const boards = db.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) as task_count
      FROM boards b
      WHERE b.project_id = ?
      ORDER BY b.position ASC
    `).all(req.params.projectId);
    res.json({ boards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/boards
router.post('/', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Board name required' });

    const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM boards WHERE project_id = ?').get(req.params.projectId);
    const position = (maxPos.maxPos || 0) + 1;

    const result = db.prepare('INSERT INTO boards (project_id, name, color, position) VALUES (?, ?, ?, ?)').run(req.params.projectId, name, color || '#6366f1', position);
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(result.lastInsertRowid);

    broadcastToProject(req.params.projectId, { type: 'BOARD_CREATED', board });
    res.status(201).json({ message: 'Board created', board });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:projectId/boards/:boardId
router.put('/:boardId', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    const { name, color, position } = req.body;
    db.prepare('UPDATE boards SET name = COALESCE(?, name), color = COALESCE(?, color), position = COALESCE(?, position) WHERE id = ? AND project_id = ?')
      .run(name, color, position, req.params.boardId, req.params.projectId);
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.boardId);
    broadcastToProject(req.params.projectId, { type: 'BOARD_UPDATED', board });
    res.json({ message: 'Board updated', board });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId/boards/:boardId
router.delete('/:boardId', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM boards WHERE id = ? AND project_id = ?').run(req.params.boardId, req.params.projectId);
    broadcastToProject(req.params.projectId, { type: 'BOARD_DELETED', boardId: req.params.boardId });
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
