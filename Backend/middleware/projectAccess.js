const db = require('../database').getDb();

// Check if user is member or owner of a project
const requireProjectAccess = (req, res, next) => {
  const projectId = req.params.projectId || req.body.project_id;
  const userId = req.user.id;

  const member = db.prepare(`
    SELECT pm.role FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = ?
  `).get(projectId, userId);

  if (!member) {
    // Check if user is assigned to any task in this project
    const isAssignee = db.prepare('SELECT id FROM tasks WHERE project_id = ? AND assignee_id = ?').get(projectId, userId);
    if (!isAssignee) {
      return res.status(403).json({ error: 'Access denied: Not a project member' });
    }
    req.projectRole = 'member'; // Assign temporary member role
  } else {
    req.projectRole = member.role;
  }
  next();
};

// Check if user is owner or admin of a project
const requireProjectAdmin = (req, res, next) => {
  const projectId = req.params.projectId || req.body.project_id;
  const userId = req.user.id;

  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const member = db.prepare(`
    SELECT pm.role FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = ?
  `).get(projectId, userId);

  if (!member || (member.role !== 'admin' && project.owner_id !== userId)) {
    return res.status(403).json({ error: 'Access denied: Admin rights required' });
  }
  req.projectRole = member ? member.role : 'owner';
  next();
};

module.exports = { requireProjectAccess, requireProjectAdmin };
