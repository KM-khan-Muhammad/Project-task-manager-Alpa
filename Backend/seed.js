const bcrypt = require('bcryptjs');
const { initDatabase } = require('./database');

async function seed() {
  try {
    console.log('🌱 Seeding database...');
    await initDatabase();
    const db = require('./database').getDb();

    // Clear existing data
    db.exec('DELETE FROM activity_logs');
    db.exec('DELETE FROM notifications');
    db.exec('DELETE FROM comments');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM boards');
    db.exec('DELETE FROM project_members');
    db.exec('DELETE FROM projects');
    db.exec('DELETE FROM users');

    // Create demo user
    const hashedPass = await bcrypt.hash('demo123', 12);
    const userResult = db.prepare('INSERT INTO users (username, email, password, avatar) VALUES (?, ?, ?, ?)')
      .run('demo', 'demo@taskflow.com', hashedPass, '#6366f1');
    const userId = userResult.lastInsertRowid;

    console.log('👤 Created demo user: demo@taskflow.com / demo123');

    // Create a demo project
    const projResult = db.prepare('INSERT INTO projects (name, description, color, icon, owner_id) VALUES (?, ?, ?, ?, ?)')
      .run('Product Launch', 'Planning and executing the next big release.', '#8b5cf6', 'fas fa-rocket', userId);
    const projectId = projResult.lastInsertRowid;

    // Add owner as member
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, userId, 'owner');

    // Create boards
    const boards = [
      { name: 'To Do', color: '#6366f1', pos: 0 },
      { name: 'In Progress', color: '#f59e0b', pos: 1 },
      { name: 'Done', color: '#10b981', pos: 2 }
    ];

    const boardIds = {};
    for (const b of boards) {
      const res = db.prepare('INSERT INTO boards (project_id, name, color, position) VALUES (?, ?, ?, ?)').run(projectId, b.name, b.color, b.pos);
      boardIds[b.name] = res.lastInsertRowid;
    }

    // Create tasks
    const tasks = [
      { board: 'To Do', title: 'Design marketing materials', desc: 'Create banners and social media posts.', priority: 'high' },
      { board: 'To Do', title: 'Setup CI/CD pipeline', desc: 'Automate deployments to production.', priority: 'medium' },
      { board: 'In Progress', title: 'Develop landing page', desc: 'Build the homepage with React.', priority: 'urgent' },
      { board: 'Done', title: 'Brainstorm features', desc: 'Define MVP requirements.', priority: 'medium' }
    ];

    for (const t of tasks) {
      db.prepare(`
        INSERT INTO tasks (board_id, project_id, title, description, priority, status, creator_id, assignee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(boardIds[t.board], projectId, t.title, t.desc, t.priority, t.board === 'Done' ? 'done' : 'todo', userId, userId);
    }

    console.log('📋 Created demo project, boards, and tasks');
    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
