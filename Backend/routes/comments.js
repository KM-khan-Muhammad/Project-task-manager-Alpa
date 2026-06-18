const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/projectAccess');
const { broadcastToProject, createNotification } = require('../websocket');

// POST /api/projects/:projectId/tasks/:taskId/comments
router.post('/', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const { content, parent_id } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content required' });

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(req.params.taskId, req.params.projectId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const result = db.prepare('INSERT INTO comments (task_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)').run(req.params.taskId, req.user.id, content.trim(), parent_id || null);

    const comment = db.prepare(`
      SELECT c.*, u.username, u.avatar, 0 as like_count, 0 as is_liked
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    // Log activity
    db.prepare('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.projectId, req.params.taskId, req.user.id, 'comment_added', JSON.stringify({ taskTitle: task.title }));

    // Notify task creator and assignee
    const notifyUsers = new Set();
    if (task.creator_id !== req.user.id) notifyUsers.add(task.creator_id);
    if (task.assignee_id && task.assignee_id !== req.user.id) notifyUsers.add(task.assignee_id);
    notifyUsers.forEach(uid => {
      createNotification(uid, 'new_comment', 'New Comment', `${req.user.username} commented on "${task.title}"`, { taskId: task.id, projectId: req.params.projectId });
    });

    broadcastToProject(req.params.projectId, { type: 'COMMENT_ADDED', taskId: req.params.taskId, comment });
    res.status(201).json({ message: 'Comment added', comment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:projectId/tasks/:taskId/comments/:commentId
router.put('/:commentId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const { content } = req.body;
    const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND task_id = ?').get(req.params.commentId, req.params.taskId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Cannot edit others\' comments' });

    db.prepare('UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, req.params.commentId);
    const updated = db.prepare(`
      SELECT c.*, u.username, u.avatar,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as is_liked
      FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
    `).get(req.user.id, req.params.commentId);

    broadcastToProject(req.params.projectId, { type: 'COMMENT_UPDATED', taskId: req.params.taskId, comment: updated });
    res.json({ message: 'Comment updated', comment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId/tasks/:taskId/comments/:commentId
router.delete('/:commentId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND task_id = ?').get(req.params.commentId, req.params.taskId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.user_id !== req.user.id && req.projectRole === 'member')
      return res.status(403).json({ error: 'Cannot delete others\' comments' });

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
    broadcastToProject(req.params.projectId, { type: 'COMMENT_DELETED', taskId: req.params.taskId, commentId: req.params.commentId });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/tasks/:taskId/comments/:commentId/like
router.post('/:commentId/like', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(req.params.commentId, req.user.id);
    
    if (existing) {
      db.prepare('DELETE FROM comment_likes WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)').run(req.params.commentId, req.user.id);
    }

    const comment = db.prepare(`
      SELECT c.id, c.task_id,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as is_liked
      FROM comments c WHERE c.id = ?
    `).get(req.user.id, req.params.commentId);

    broadcastToProject(req.params.projectId, { type: 'COMMENT_LIKED', taskId: req.params.taskId, commentId: req.params.commentId, like_count: comment.like_count });
    res.json({ message: existing ? 'Unliked' : 'Liked', is_liked: !existing, like_count: comment.like_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
