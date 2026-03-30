import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../data/biamos.db');
const db = new Database(dbPath);

const id = randomUUID();
const now = new Date().toISOString();

db.prepare(`INSERT OR IGNORE INTO domain_knowledge 
  (id, domain, type, content, confidence, source, version, created_at, review_status) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  id, 'www.youtube.com', 'avoid_rule',
  'AVOID: Calling done() after type_text without clicking the submit/Kommentieren button.\nINSTEAD: After typing a YouTube comment, ALWAYS click the blue Kommentieren or Comment button. Task is NOT done until that button is clicked and the comment is posted.',
  0.95, 'base_rule', 1, now, 'active'
);

console.log('KB rule inserted:', id);
db.close();
