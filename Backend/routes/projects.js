const express = require('express');
const router = express.Router();
const db = require('../database').getDb();
const { authenticateToken } = require('../middleware/auth');
const { requireProjectAccess, requireProjectAdmin } = require('../middleware/projectAccess');
const { broadcastToProject, createNotification } = require('../websocket');

// GET /api/projects - Get all projects for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, u.username as owner_name, u.avatar as owner_avatar,
        (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND date(t.due_date) < date('now') AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date != '') as overdue_tasks,
        COALESCE(pm.role, 'member') as user_role
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      WHERE pm.user_id IS NOT NULL 
         OR p.id IN (SELECT project_id FROM tasks WHERE assignee_id = ?)
      ORDER BY p.updated_at DESC
    `).all(req.user.id, req.user.id);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects - Create project
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, description, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const result = db.prepare(
      'INSERT INTO projects (name, description, color, icon, owner_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || '', color || '#6366f1', icon || '📋', req.user.id);

    const projectId = result.lastInsertRowid;

    // Add creator as owner member
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, req.user.id, 'owner');

    // Create default boards
    const defaultBoards = [
      { name: 'To Do', color: '#6366f1', position: 0 },
      { name: 'In Progress', color: '#f59e0b', position: 1 },
      { name: 'Review', color: '#8b5cf6', position: 2 },
      { name: 'Done', color: '#10b981', position: 3 }
    ];
    const insertBoard = db.prepare('INSERT INTO boards (project_id, name, color, position) VALUES (?, ?, ?, ?)');
    defaultBoards.forEach(b => insertBoard.run(projectId, b.name, b.color, b.position));

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json({ message: 'Project created', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId - Get single project
router.get('/:projectId', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const project = db.prepare(`
      SELECT p.*, u.username as owner_name, u.avatar as owner_avatar,
        (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as completed_tasks
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `).get(req.params.projectId);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const members = db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar, pm.role, pm.joined_at
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      UNION
      SELECT DISTINCT u.id, u.username, u.email, u.avatar, 'member' as role, t.created_at as joined_at
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ? AND t.assignee_id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
      ORDER BY joined_at ASC
    `).all(req.params.projectId, req.params.projectId, req.params.projectId);

    const boards = db.prepare('SELECT * FROM boards WHERE project_id = ? ORDER BY position ASC').all(req.params.projectId);

    res.json({ project, members, boards, userRole: req.projectRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:projectId - Update project
router.put('/:projectId', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    const { name, description, color, icon, status } = req.body;
    db.prepare(`
      UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color),
        icon = COALESCE(?, icon),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, color, icon, status, req.params.projectId);

    broadcastToProject(req.params.projectId, { type: 'PROJECT_UPDATED', projectId: req.params.projectId });
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    res.json({ message: 'Project updated', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId - Delete project
router.delete('/:projectId', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/members - Add member
router.post('/:projectId/members', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    const { email, role } = req.body;
    const user = db.prepare('SELECT id, username, email, avatar FROM users WHERE email = ?').get(email);
    if (!user) return res.status(404).json({ error: 'User not found with that email' });

    const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.projectId, user.id);
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(req.params.projectId, user.id, role || 'member');

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.projectId);
    createNotification(user.id, 'project_invite', 'Project Invitation', `You've been added to project "${project.name}"`, { projectId: req.params.projectId });

    res.status(201).json({ message: 'Member added', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId/members/:userId - Remove member
router.delete('/:projectId/members/:userId', authenticateToken, requireProjectAdmin, (req, res) => {
  try {
    const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.projectId);
    if (parseInt(req.params.userId) === project.owner_id)
      return res.status(400).json({ error: 'Cannot remove project owner' });

    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.projectId, req.params.userId);
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/activity - Get activity log
router.get('/:projectId/activity', authenticateToken, requireProjectAccess, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT al.*, u.username, u.avatar
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id
      WHERE al.project_id = ?
      ORDER BY al.created_at DESC
      LIMIT 50
    `).all(req.params.projectId);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
