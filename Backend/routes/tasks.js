const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/projectAccess');
const { broadcastToProject, createNotification } = require('../websocket');

// Helper to ensure assignee is a member of the project
function ensureProjectMember(projectId, userId) {
  if (!userId) return;
  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  if (!existing) {
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, userId, 'member');
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    createNotification(userId, 'project_invite', 'Joined Project', `You've been added to project "${project.name}" because a task was assigned to you.`, { projectId });
  }
}

// GET /api/projects/:projectId/tasks
router.get('/', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const { boardId, assigneeId, priority, search } = req.query;
    let query = `
      SELECT t.*,
        u1.username as assignee_name, u1.avatar as assignee_avatar,
        u2.username as creator_name, u2.avatar as creator_avatar,
        b.name as board_name, b.color as board_color,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) as comment_count
      FROM tasks t
      LEFT JOIN users u1 ON u1.id = t.assignee_id
      LEFT JOIN users u2 ON u2.id = t.creator_id
      LEFT JOIN boards b ON b.id = t.board_id
      WHERE t.project_id = ?
    `;
    const params = [req.params.projectId];

    if (boardId) { query += ' AND t.board_id = ?'; params.push(boardId); }
    if (assigneeId) { query += ' AND t.assignee_id = ?'; params.push(assigneeId); }
    if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
    if (search) { query += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY t.position ASC, t.created_at DESC';

    const tasks = db.prepare(query).all(...params);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/tasks
router.post('/', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    if (req.projectRole !== 'owner') {
      return res.status(403).json({ error: 'Only the project owner can create tasks' });
    }
    const { title, description, board_id, priority, due_date, assignee_id, labels } = req.body;
    if (!title) return res.status(400).json({ error: 'Task title required' });
    if (!board_id) return res.status(400).json({ error: 'Board is required' });

    const board = db.prepare('SELECT id FROM boards WHERE id = ? AND project_id = ?').get(board_id, req.params.projectId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM tasks WHERE board_id = ?').get(board_id);
    const position = (maxPos.maxPos || 0) + 1;

    if (assignee_id) ensureProjectMember(req.params.projectId, assignee_id);

    const boardInfo = db.prepare('SELECT name FROM boards WHERE id = ?').get(board_id);
    const initialStatus = ['done', 'completed', 'finished'].includes(boardInfo?.name?.toLowerCase()) ? 'done' : 'todo';

    const result = db.prepare(`
      INSERT INTO tasks (board_id, project_id, title, description, priority, status, due_date, assignee_id, creator_id, labels, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(board_id, req.params.projectId, title, description || '', priority || 'medium', initialStatus, due_date || null, assignee_id || null, req.user.id, JSON.stringify(labels || []), position);

    const task = db.prepare(`
      SELECT t.*,
        u1.username as assignee_name, u1.avatar as assignee_avatar,
        u2.username as creator_name, u2.avatar as creator_avatar,
        b.name as board_name
      FROM tasks t
      LEFT JOIN users u1 ON u1.id = t.assignee_id
      LEFT JOIN users u2 ON u2.id = t.creator_id
      LEFT JOIN boards b ON b.id = t.board_id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    // Log activity
    db.prepare('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.projectId, task.id, req.user.id, 'task_created', JSON.stringify({ taskTitle: title }));

    // Notify assignee
    if (assignee_id && assignee_id !== req.user.id) {
      createNotification(assignee_id, 'task_assigned', 'Task Assigned', `You've been assigned "${title}"`, { taskId: task.id, projectId: req.params.projectId });
    }

    broadcastToProject(req.params.projectId, { type: 'TASK_CREATED', task });
    res.status(201).json({ message: 'Task created', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/tasks/:taskId
router.get('/:taskId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*,
        u1.username as assignee_name, u1.avatar as assignee_avatar,
        u2.username as creator_name, u2.avatar as creator_avatar,
        b.name as board_name, b.color as board_color
      FROM tasks t
      LEFT JOIN users u1 ON u1.id = t.assignee_id
      LEFT JOIN users u2 ON u2.id = t.creator_id
      LEFT JOIN boards b ON b.id = t.board_id
      WHERE t.id = ? AND t.project_id = ?
    `).get(req.params.taskId, req.params.projectId);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const comments = db.prepare(`
      SELECT c.*, u.username, u.avatar,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as like_count,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) as is_liked
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(req.user.id, req.params.taskId);

    res.json({ task, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:projectId/tasks/:taskId
router.put('/:taskId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const { title, description, board_id, priority, status, due_date, assignee_id, labels, position } = req.body;
    const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(req.params.taskId, req.params.projectId);
    if (!oldTask) return res.status(404).json({ error: 'Task not found' });

    if (assignee_id) ensureProjectMember(req.params.projectId, assignee_id);

    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        board_id = COALESCE(?, board_id),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        due_date = COALESCE(?, due_date),
        assignee_id = ?,
        labels = COALESCE(?, labels),
        position = COALESCE(?, position),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(
      title ?? null, 
      description ?? null, 
      board_id ?? null, 
      priority ?? null, 
      status ?? null, 
      due_date ?? null,
      assignee_id !== undefined ? assignee_id : oldTask.assignee_id,
      labels ? JSON.stringify(labels) : null, 
      position ?? null, 
      req.params.taskId, 
      req.params.projectId
    );

    // Notify new assignee
    if (assignee_id && assignee_id !== oldTask.assignee_id && assignee_id !== req.user.id) {
      createNotification(assignee_id, 'task_assigned', 'Task Assigned', `You've been assigned "${oldTask.title}"`, { taskId: oldTask.id, projectId: req.params.projectId });
    }

    // Log board change and handle automatic status update
    if (board_id && board_id !== oldTask.board_id) {
      const newBoard = db.prepare('SELECT name FROM boards WHERE id = ?').get(board_id);
      const isDoneBoard = ['done', 'completed', 'finished'].includes(newBoard?.name?.toLowerCase());
      
      // Auto-update status if moved to/from Done board
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(isDoneBoard ? 'done' : 'todo', req.params.taskId);

      db.prepare('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)')
        .run(req.params.projectId, oldTask.id, req.user.id, 'task_moved', JSON.stringify({ from: oldTask.board_id, to: board_id, boardName: newBoard?.name }));
    }

    const task = db.prepare(`
      SELECT t.*, u1.username as assignee_name, u1.avatar as assignee_avatar,
        u2.username as creator_name, b.name as board_name
      FROM tasks t
      LEFT JOIN users u1 ON u1.id = t.assignee_id
      LEFT JOIN users u2 ON u2.id = t.creator_id
      LEFT JOIN boards b ON b.id = t.board_id
      WHERE t.id = ?
    `).get(req.params.taskId);

    broadcastToProject(req.params.projectId, { type: 'TASK_UPDATED', task });
    res.json({ message: 'Task updated', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId/tasks/:taskId
router.delete('/:taskId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(req.params.taskId, req.params.projectId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.creator_id !== req.user.id && req.projectRole === 'member')
      return res.status(403).json({ error: 'Only the creator or admin can delete this task' });

    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
    broadcastToProject(req.params.projectId, { type: 'TASK_DELETED', taskId: req.params.taskId });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
