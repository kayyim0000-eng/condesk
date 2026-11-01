import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, sqlType } from './schema.js';
import { BUILTIN_TEMPLATES } from './templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR 환경변수로 저장 위치를 바꿀 수 있다 (클라우드의 영구 디스크 경로 등)
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');

for (const [name, t] of Object.entries(TABLES)) {
  const cols = t.columns.map((c) => `${c.key} ${sqlType(c)}`).join(', ');
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols},
    created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
  // 스키마에 새 컬럼이 추가된 경우 기존 DB에 반영
  const existing = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((r) => r.name));
  for (const c of t.columns) {
    if (!existing.has(c.key)) db.exec(`ALTER TABLE ${name} ADD COLUMN ${c.key} ${sqlType(c)}`);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, name TEXT, org TEXT, description TEXT, def TEXT, builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, template_id TEXT, title TEXT, company TEXT, session_date TEXT,
  status TEXT DEFAULT '작성중', input TEXT, sources TEXT, result TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')));
`);

// 기본 제공 양식을 '삭제'하면 hidden=1로 숨긴다 (재시작 때 다시 생기지 않도록)
if (!db.prepare('PRAGMA table_info(templates)').all().some((c) => c.name === 'hidden')) {
  db.exec('ALTER TABLE templates ADD COLUMN hidden INTEGER DEFAULT 0');
}

// 기본 제공 양식은 항상 최신 정의로 덮어쓴다 (숨김 여부는 유지)
const upsertTpl = db.prepare(`INSERT INTO templates (id, name, org, description, def, builtin) VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, org=excluded.org, description=excluded.description, def=excluded.def, builtin=1`);
for (const t of BUILTIN_TEMPLATES) upsertTpl.run(t.id, t.name, t.org, t.description, JSON.stringify(t));

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value ?? '');
}
