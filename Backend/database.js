const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'taskmanager.db');

// better-sqlite3 compatible Statement wrapper
class Statement {
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }

  _flatParams(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  get(...args) {
    const params = this._flatParams(args);
    try {
      const stmt = this._db._db.prepare(this._sql);
      if (params.length) stmt.bind(params);
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    } catch (e) {
      throw new Error(`DB.get error: ${e.message}\nSQL: ${this._sql}`);
    }
  }

  all(...args) {
    const params = this._flatParams(args);
    const rows = [];
    try {
      const stmt = this._db._db.prepare(this._sql);
      if (params.length) stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e) {
      throw new Error(`DB.all error: ${e.message}\nSQL: ${this._sql}`);
    }
  }

  run(...args) {
    const params = this._flatParams(args);
    try {
      this._db._db.run(this._sql, params.length ? params : undefined);
      const lastRow = this._db._db.exec('SELECT last_insert_rowid() as id');
      const lastId = lastRow.length && lastRow[0].values.length ? lastRow[0].values[0][0] : 0;
      const changes = this._db._db.getRowsModified();
      this._db._save();
      return { lastInsertRowid: lastId, changes };
    } catch (e) {
      throw new Error(`DB.run error: ${e.message}\nSQL: ${this._sql}`);
    }
  }
}

// better-sqlite3 compatible DB wrapper
class DB {
  constructor(sqlJs, fileData) {
    this._db = new sqlJs.Database(fileData || null);
  }

  pragma(str) { /* WAL mode not applicable to sql.js */ }

  exec(sql) {
    try {
      this._db.exec(sql);
      this._save();
      return this;
    } catch (e) {
      throw new Error(`DB.exec error: ${e.message}`);
    }
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  _save() {
    try {
      const data = this._db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.error('DB save error:', e.message);
    }
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    role TEXT DEFAULT 'member',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    icon TEXT DEFAULT '📋',
    owner_id INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    color TEXT DEFAULT '#6366f1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'todo',
    position INTEGER DEFAULT 0,
    due_date TEXT,
    assignee_id INTEGER,
    creator_id INTEGER NOT NULL,
    labels TEXT DEFAULT '[]',
    attachments TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(comment_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT DEFAULT '{}',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    task_id INTEGER,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

let dbInstance = null;

async function initDatabase() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let fileData = null;
  if (fs.existsSync(DB_PATH)) {
    fileData = fs.readFileSync(DB_PATH);
  }

  dbInstance = new DB(SQL, fileData ? new Uint8Array(fileData) : null);
  dbInstance.exec(SCHEMA);

  // Migration for existing comments table
  try { dbInstance.exec('ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL;'); } catch(e){}

  if (!fileData) dbInstance._save();
  console.log('✅ Database initialized successfully');
  return dbInstance;
}

function getDb() {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.');
  return dbInstance;
}

// Proxy: require('./database') returns DB instance after init
// Usage in routes: const db = require('../database')
// This works because routes are loaded AFTER initDatabase() resolves
module.exports = { initDatabase, getDb };
