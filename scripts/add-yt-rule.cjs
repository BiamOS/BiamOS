const BetterSqlite = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const dbPath = path.join(__dirname, '../packages/backend/biamos.db');
const db = new BetterSqlite(dbPath);

const id = randomUUID();
const now = new Date().toISOString();

const stmt = db.prepare(
  'INSERT OR IGNORE INTO domain_knowledge (id, domain, type, content, confidence, source, version, created_at, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

stmt.run(
  id,
  'www.youtube.com',
  'avoid_rule',
  'AVOID: Calling done() after type_text without clicking the submit/Kommentieren button.\nINSTEAD: After typing a YouTube comment, ALWAYS click the blue Kommentieren or Comment button. Task is NOT done until that button is clicked.',
  0.95,
  'base_rule',
  1,
  now,
  'active'
);

console.log('Inserted KB rule:', id);
db.close();
