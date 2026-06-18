const { initDatabase, getDb } = require('./database');

async function fix() {
  await initDatabase();
  const db = getDb();
  const result = db.prepare(`
    UPDATE tasks 
    SET status = 'done' 
    WHERE board_id IN (
      SELECT id FROM boards 
      WHERE LOWER(name) IN ('done', 'completed', 'finished')
    )
  `).run();
  console.log(`Updated ${result.changes} existing tasks to "done" status.`);
}

fix().catch(console.error);
