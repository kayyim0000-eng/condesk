// 데이터베이스 계층
// - 환경변수 DATABASE_URL 이 있으면 Postgres(Supabase) — Vercel 배포용
// - 없으면 이 PC의 SQLite 파일(data/app.db) — 로컬 실행용
// 모든 함수는 async 이고, SQL의 자리표시자는 ? 로 쓴다 (Postgres에서는 $1, $2… 로 바꿔 보냄).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, sqlType } from './schema.js';
import { BUILTIN_TEMPLATES } from './templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Vercel의 Supabase 연결(Storage → Supabase)을 쓰면 POSTGRES_URL 이 자동으로 들어온다
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const IS_PG = Boolean(DB_URL);
// DATA_DIR 환경변수로 저장 위치를 바꿀 수 있다. Vercel은 /tmp 만 쓸 수 있다.
export const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'condesk') : path.join(here, '..', 'data'));
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

// 한국 시간 'YYYY-MM-DD HH:MM:SS' (생성·수정 시각 기록용)
export function nowStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
}

let sqlite;
let pool;
async function conn() {
  if (IS_PG) {
    if (!pool) {
      const pg = (await import('pg')).default;
      // COUNT(*)·SUM(정수)는 문자열로 오므로 숫자로 바꾼다
      pg.types.setTypeParser(20, (v) => Number(v));
      pg.types.setTypeParser(1700, (v) => Number(v));
      // Supabase는 SSL 필수, 내 PC의 시험용 Postgres(localhost)는 SSL 없음
      const url = DB_URL;
      const ssl = /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? false : { rejectUnauthorized: false };
      pool = new pg.Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl, max: 3 });
    }
    return pool;
  }
  if (!sqlite) {
    const { DatabaseSync } = await import('node:sqlite');
    sqlite = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
    sqlite.exec('PRAGMA journal_mode = WAL');
  }
  return sqlite;
}
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

export async function all(sql, ...params) {
  const c = await conn();
  if (IS_PG) return (await c.query(toPg(sql), params)).rows;
  return c.prepare(sql).all(...params);
}
export async function get(sql, ...params) {
  return (await all(sql, ...params))[0];
}
// INSERT/UPDATE/DELETE. 새 행의 id가 필요하면 SQL 끝에 RETURNING id 를 붙이고 get()을 쓴다.
export async function run(sql, ...params) {
  const c = await conn();
  if (IS_PG) return { changes: (await c.query(toPg(sql), params)).rowCount };
  return { changes: c.prepare(sql).run(...params).changes };
}
export async function exec(sql) {
  const c = await conn();
  if (IS_PG) await c.query(sql);
  else c.exec(sql);
}

// ── 테이블 준비 (처음 요청 때 한 번) ─────────────────────────
const colType = (c) => (IS_PG && sqlType(c) === 'REAL' ? 'DOUBLE PRECISION' : sqlType(c));
const ID = () => (IS_PG ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT');
const NOW_DEFAULT = () => (IS_PG ? "DEFAULT to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS')" : "DEFAULT (datetime('now','localtime'))");

async function columnsOf(table) {
  if (IS_PG) return new Set((await all('SELECT column_name FROM information_schema.columns WHERE table_name = ?', table)).map((r) => r.column_name));
  return new Set((await all(`PRAGMA table_info(${table})`)).map((r) => r.name));
}
async function addMissing(table, cols) {
  const existing = await columnsOf(table);
  for (const [name, type] of cols) if (!existing.has(name)) await exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}

async function init() {
  for (const [name, t] of Object.entries(TABLES)) {
    const cols = t.columns.map((c) => `${c.key} ${colType(c)}`).join(', ');
    await exec(`CREATE TABLE IF NOT EXISTS ${name} (${ID()}, ${cols}, created_at TEXT ${NOW_DEFAULT()}, updated_at TEXT ${NOW_DEFAULT()})`);
    await addMissing(name, t.columns.map((c) => [c.key, colType(c)]));
  }
  await exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  await exec(`CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, name TEXT, org TEXT, description TEXT, def TEXT,
    builtin INTEGER DEFAULT 0, created_at TEXT ${NOW_DEFAULT()})`);
  // 기본 제공 양식을 '삭제'하면 hidden=1로 숨긴다 (재시작 때 다시 생기지 않도록)
  await addMissing('templates', [['hidden', 'INTEGER DEFAULT 0']]);
  await exec(`CREATE TABLE IF NOT EXISTS reports (${ID()}, template_id TEXT, title TEXT, company TEXT, session_date TEXT,
    status TEXT DEFAULT '작성중', input TEXT, sources TEXT, result TEXT, created_at TEXT ${NOW_DEFAULT()}, updated_at TEXT ${NOW_DEFAULT()})`);
  // 기본 제공 양식은 항상 최신 정의로 덮어쓴다 (숨김 여부는 유지)
  for (const t of BUILTIN_TEMPLATES) {
    await run(`INSERT INTO templates (id, name, org, description, def, builtin) VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, org=excluded.org, description=excluded.description, def=excluded.def, builtin=1`,
    t.id, t.name, t.org, t.description, JSON.stringify(t));
  }
}
let initPromise;
export function ready() {
  if (!initPromise) initPromise = init().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

// ── 설정: 요청마다 한 번 읽어 두고(loadSettings) 코드에서는 바로 꺼내 쓴다 ──
const settings = new Map();
export async function loadSettings() {
  settings.clear();
  for (const r of await all('SELECT key, value FROM settings')) settings.set(r.key, r.value);
}
export function getSetting(key, fallback = '') {
  return settings.has(key) ? settings.get(key) : fallback;
}
export async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value ?? '');
  settings.set(key, value ?? '');
}
