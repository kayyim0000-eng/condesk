import express from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db, DATA_DIR, getSetting, setSetting } from './db.js';
import { TABLES, CATEGORIES, CERT_CATEGORIES } from './schema.js';
import { PARTS, interpolate } from './templates.js';
import { INPUT_KEYS, generateReport, rewriteField, analyzeTemplate, transcribe, extractBasicInfo, sttLimitMb } from './ai.js';
import { extractText, fileKind, fixName } from './extract.js';
import { buildDocx, imageType } from './docx.js';
import { convertDocx, hwpAvailable } from './hwp.js';
import { importWorkbook } from './importXlsx.js';
import { authEnabled, mountAuth } from './auth.js';
import { startTunnel, getPublicUrl } from './tunnel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT) || 5179;
// 클라우드(Render 등)는 PORT를 넘겨주며 외부 접속을 받아야 한다. 로컬 실행은 이 PC에서만 열린다.
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
// 외부 공개 모드(start-public.bat): 이 PC 앱에 Cloudflare 터널로 인터넷 주소를 붙인다
const TUNNEL = process.env.CONDESK_TUNNEL === '1';
// 고정 주소 모드(start-funnel.bat): Tailscale Funnel이 밖에서 이 PC로 연결해 주므로 로그인 필수
const PUBLIC = TUNNEL || process.env.CONDESK_PUBLIC === '1' || funnelActive();
// Tailscale Funnel이 이 앱 포트를 밖에 열어 두었는지 확인 (그 상태로 비밀번호 없이 켜지는 것을 막는다)
function funnelActive() {
  const ts = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  if (process.platform !== 'win32' || !fs.existsSync(ts)) return false;
  try {
    const out = execFileSync(ts, ['funnel', 'status'], { timeout: 4000, windowsHide: true }).toString();
    return /Funnel on/i.test(out) && out.includes(`:${PORT}`);
  } catch { return false; }
}
if ((HOST !== '127.0.0.1' || PUBLIC) && !authEnabled()) {
  console.error('외부 접속을 허용하려면 로그인 비밀번호(APP_PASSWORD 또는 data/app_password.txt)를 설정해야 합니다.');
  process.exit(1);
}
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));
mountAuth(app);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e.status && e.status < 500) console.warn(`[${e.status}] ${req.method} ${req.path}: ${e.message}`);
  else console.error(e);
  res.status(e.status || 500).json({ error: e.message || String(e) });
});
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// ── 공통 정보 ───────────────────────────────────────────────
app.get('/api/schema', (req, res) => res.json({ tables: TABLES, categories: CATEGORIES, parts: PARTS, inputKeys: INPUT_KEYS }));

// ── 관리 테이블 CRUD ────────────────────────────────────────
function tableOr404(req) {
  const t = TABLES[req.params.table];
  if (!t) throw Object.assign(new Error('없는 테이블'), { status: 404 });
  return t;
}
function pick(t, body) {
  const out = {};
  for (const c of t.columns) if (c.key in body) {
    let v = body[c.key];
    if ((c.type === 'number' || c.type === 'money')) v = v === '' || v === null ? null : Number(v);
    out[c.key] = v === '' ? null : v;
  }
  return out;
}
app.get('/api/t/:table', wrap((req, res) => {
  const t = tableOr404(req);
  res.json(db.prepare(`SELECT * FROM ${req.params.table} ORDER BY ${t.order}, id DESC`).all());
}));
app.post('/api/t/:table', wrap((req, res) => {
  const t = tableOr404(req);
  const rec = pick(t, req.body);
  const keys = Object.keys(rec);
  const r = db.prepare(`INSERT INTO ${req.params.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => rec[k]));
  res.json(db.prepare(`SELECT * FROM ${req.params.table} WHERE id = ?`).get(r.lastInsertRowid));
}));
app.put('/api/t/:table/:id', wrap((req, res) => {
  const t = tableOr404(req);
  const rec = pick(t, req.body);
  const keys = Object.keys(rec);
  db.prepare(`UPDATE ${req.params.table} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`).run(...keys.map((k) => rec[k]), req.params.id);
  res.json(db.prepare(`SELECT * FROM ${req.params.table} WHERE id = ?`).get(req.params.id));
}));
app.delete('/api/t/:table/:id', wrap((req, res) => {
  tableOr404(req);
  db.prepare(`DELETE FROM ${req.params.table} WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
}));

// ── 대시보드 ────────────────────────────────────────────────
app.get('/api/dashboard', wrap((req, res) => {
  const years = db.prepare(`SELECT DISTINCT substr(date,1,4) y FROM revenues WHERE date IS NOT NULL
    UNION SELECT DISTINCT substr(start_date,1,4) FROM activities WHERE start_date IS NOT NULL ORDER BY 1 DESC`).all().map((r) => r.y);
  const year = req.query.year || years[0] || String(new Date().getFullYear());
  const today = new Date().toISOString().slice(0, 10);

  const rev = db.prepare(`SELECT COALESCE(SUM(amount),0) amount, COALESCE(SUM(net_amount),0) net, COUNT(*) n,
    COALESCE(SUM(CASE WHEN settle_status IS NOT '정산완료' THEN amount END),0) unsettled FROM revenues WHERE substr(date,1,4) = ?`).get(year);
  const prev = db.prepare('SELECT COALESCE(SUM(amount),0) amount FROM revenues WHERE substr(date,1,4) = ?').get(String(Number(year) - 1));
  const byCat = db.prepare('SELECT category, SUM(amount) amount, COUNT(*) n FROM revenues WHERE substr(date,1,4) = ? GROUP BY category').all(year);
  const monthlyRows = db.prepare(`SELECT CAST(substr(date,6,2) AS INTEGER) m, category, SUM(amount) amount, COUNT(*) n FROM revenues
    WHERE substr(date,1,4) = ? GROUP BY m, category`).all(year);
  const byMonth = (key) => Array.from({ length: 12 }, (_, i) => {
    const o = { month: `${i + 1}월` };
    for (const c of CATEGORIES) o[c] = 0;
    for (const r of monthlyRows) if (r.m === i + 1) o[r.category || '기타'] += r[key];
    return o;
  });
  const monthly = byMonth('amount');
  const monthlyCount = byMonth('n');
  const topOrgs = db.prepare(`SELECT org, SUM(amount) amount, COUNT(*) n FROM revenues WHERE substr(date,1,4) = ?
    GROUP BY org ORDER BY amount DESC LIMIT 7`).all(year);
  const act = db.prepare(`SELECT category, COUNT(*) n, COALESCE(SUM(count),0) cnt, COALESCE(SUM(hours),0) hours FROM activities
    WHERE substr(start_date,1,4) = ? GROUP BY category`).all(year);
  const training = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(hours),0) hours FROM trainings WHERE substr(date,1,4) = ?`).get(year);
  const notices = db.prepare(`SELECT * FROM notices WHERE deadline >= ? AND (status IS NULL OR status IN ('관심','지원예정'))
    ORDER BY deadline LIMIT 8`).all(today);
  const certTotal = db.prepare(`SELECT COUNT(*) n FROM certificates WHERE status IS NOT '취득준비'`).get().n;
  const certByCat = db.prepare(`SELECT COALESCE(category, '기타') category, COUNT(*) n FROM certificates
    WHERE status IS NOT '취득준비' GROUP BY 1`).all();
  const reports = db.prepare(`SELECT r.id, r.title, r.company, r.session_date, r.status, t.name tpl FROM reports r
    LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.updated_at DESC LIMIT 6`).all();
  const counts = Object.fromEntries(Object.keys(TABLES).map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
  res.json({ years, year, rev, prev, byCat, monthly, monthlyCount, topOrgs, act, training, notices, certTotal, certByCat, certCategories: CERT_CATEGORIES, reports, counts, today });
}));

// ── 설정 ────────────────────────────────────────────────────
const SECRET_KEYS = ['anthropic_api_key', 'gemini_api_key', 'stt_api_key'];
const SETTING_KEYS = [...SECRET_KEYS, 'ai_provider', 'model', 'gemini_model', 'stt_base_url', 'stt_model', 'mentor', 'mentor_org', 'field'];
app.get('/api/settings', (req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) {
    const v = getSetting(k);
    out[k] = SECRET_KEYS.includes(k) ? (v ? `${v.slice(0, 7)}••••${v.slice(-4)}` : '') : v;
  }
  out.anthropic_env = Boolean(process.env.ANTHROPIC_API_KEY);
  out.gemini_env = Boolean(process.env.GEMINI_API_KEY);
  res.json(out);
});
app.put('/api/settings', (req, res) => {
  for (const k of SETTING_KEYS) {
    if (!(k in req.body)) continue;
    if (SECRET_KEYS.includes(k) && String(req.body[k]).includes('••••')) continue; // 마스킹된 값은 그대로 둔다
    setSetting(k, String(req.body[k] ?? '').trim());
  }
  res.json({ ok: true });
});
app.post('/api/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('엑셀 파일을 선택해 주세요.'), { status: 400 });
  res.json(await importWorkbook(req.file.buffer, { replace: req.body.replace === 'true' }));
}));

// ── 파일 업로드 → 원자료로 변환 ──────────────────────────────
app.post('/api/upload', upload.single('file'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw Object.assign(new Error('파일이 없습니다.'), { status: 400 });
  const name = fixName(f.originalname);
  const kind = fileKind(name);
  if (kind === 'audio') {
    const limit = sttLimitMb();
    if (f.size > limit * 1024 * 1024) throw Object.assign(new Error(`음성 파일은 ${limit}MB 이하만 변환할 수 있습니다. 파일을 나누거나 압축(mp3/m4a)해 주세요.`), { status: 400 });
    return res.json({ type: 'audio', name, text: await transcribe(f.buffer, name, f.mimetype) });
  }
  if (kind === 'pdf') {
    const file = `${crypto.randomUUID()}.pdf`;
    fs.writeFileSync(path.join(UPLOADS, file), f.buffer);
    return res.json({ type: 'pdf', name, file, text: '' });
  }
  if (kind === 'image') {
    // 보고서에 넣을 사진 (화면에서 JPEG로 줄여서 올라온다)
    const ext = imageType(f.buffer);
    if (!ext) throw Object.assign(new Error('JPG 또는 PNG 사진만 넣을 수 있습니다.'), { status: 400 });
    const file = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS, file), f.buffer);
    return res.json({ type: 'photo', name, file });
  }
  res.json({ type: 'doc', name, text: await extractText(f.buffer, name) });
}));
// 업로드한 사진 보기 (uploads 폴더 안의 파일만)
app.get('/api/files/:file', (req, res) => {
  const p = path.join(UPLOADS, path.basename(req.params.file));
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});
// 명함·사업자등록증 사진/PDF에서 기본정보 읽기
app.post('/api/extract-info', upload.single('file'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw Object.assign(new Error('파일을 선택해 주세요.'), { status: 400 });
  const name = fixName(f.originalname);
  const isPdf = f.buffer.subarray(0, 4).toString() === '%PDF';
  const type = isPdf ? 'pdf' : imageType(f.buffer);
  if (type) return res.json(await extractBasicInfo({ buf: f.buffer, type, kind: req.body.kind }));
  // HWP·HWPX·DOCX·엑셀·TXT는 글자를 뽑아서 보낸다
  const text = await extractText(f.buffer, name);
  if (!text.trim()) throw Object.assign(new Error('파일에서 글자를 찾지 못했습니다. 스캔본이면 PDF나 사진으로 올려 주세요.'), { status: 400 });
  res.json(await extractBasicInfo({ type: 'text', text, fileName: name, kind: req.body.kind }));
}));
// 클라이언트가 보낸 sources를 서버 경로로 해석 (uploads 폴더 밖은 거부)
function resolveSources(sources = []) {
  return sources.filter((s) => s.enabled !== false).map((s) => {
    if (s.type !== 'pdf' || !s.file) return s;
    const p = path.join(UPLOADS, path.basename(s.file));
    return { ...s, path: p };
  });
}

// ── 보고서 양식 ─────────────────────────────────────────────
const tplRow = (r) => r && { ...parse(r.def, {}), id: r.id, builtin: Boolean(r.builtin) };
app.get('/api/templates', (req, res) => res.json(db.prepare('SELECT * FROM templates WHERE hidden IS NOT 1 ORDER BY builtin DESC, created_at').all().map(tplRow)));
app.get('/api/templates/hidden', (req, res) => res.json(db.prepare('SELECT id, name FROM templates WHERE hidden = 1').all()));
app.post('/api/templates/restore', (req, res) => { db.exec('UPDATE templates SET hidden = 0'); res.json({ ok: true }); });
app.get('/api/templates/:id', (req, res) => res.json(tplRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id))));
app.post('/api/templates/analyze', upload.single('file'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw Object.assign(new Error('양식 파일을 선택해 주세요.'), { status: 400 });
  const name = fixName(f.originalname);
  let def;
  if (fileKind(name) === 'pdf') {
    const p = path.join(UPLOADS, `${crypto.randomUUID()}.pdf`);
    fs.writeFileSync(p, f.buffer);
    def = await analyzeTemplate({ pdfPath: p, fileName: name });
  } else {
    def = await analyzeTemplate({ text: await extractText(f.buffer, name), fileName: name });
  }
  res.json(def);
}));
app.post('/api/templates', wrap((req, res) => {
  const t = req.body;
  const id = t.id && !db.prepare('SELECT 1 FROM templates WHERE id = ?').get(t.id) ? t.id : `custom_${Date.now()}`;
  db.prepare('INSERT INTO templates (id, name, org, description, def, builtin) VALUES (?, ?, ?, ?, ?, 0)')
    .run(id, t.name, t.org, t.description, JSON.stringify({ ...t, id }));
  res.json(tplRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(id)));
}));
app.put('/api/templates/:id', wrap((req, res) => {
  const row = db.prepare('SELECT builtin FROM templates WHERE id = ?').get(req.params.id);
  if (!row) throw Object.assign(new Error('없는 양식'), { status: 404 });
  if (row.builtin) throw Object.assign(new Error('기본 제공 양식은 수정할 수 없습니다. 복제해서 수정해 주세요.'), { status: 400 });
  const t = req.body;
  db.prepare('UPDATE templates SET name=?, org=?, description=?, def=? WHERE id=?').run(t.name, t.org, t.description, JSON.stringify({ ...t, id: req.params.id }), req.params.id);
  res.json({ ok: true });
}));
// 기본 양식이나 이미 보고서에 쓰인 양식은 숨기기만 한다 (기존 보고서는 계속 열리도록)
app.delete('/api/templates/:id', wrap((req, res) => {
  const row = db.prepare('SELECT builtin FROM templates WHERE id = ?').get(req.params.id);
  if (!row) return res.json({ ok: true });
  const used = db.prepare('SELECT COUNT(*) n FROM reports WHERE template_id = ?').get(req.params.id).n;
  if (row.builtin || used) db.prepare('UPDATE templates SET hidden = 1 WHERE id = ?').run(req.params.id);
  else db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true, hidden: Boolean(row.builtin || used) });
}));

// ── 보고서 ──────────────────────────────────────────────────
const reportRow = (r) => r && { ...r, input: parse(r.input, {}), sources: parse(r.sources, []), result: parse(r.result, null) };
const getTpl = (id) => {
  const t = tplRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(id));
  if (!t) throw Object.assign(new Error('양식을 찾을 수 없습니다.'), { status: 404 });
  return t;
};
app.get('/api/reports', (req, res) => res.json(db.prepare(`SELECT r.id, r.title, r.company, r.session_date, r.status, r.template_id, r.updated_at, t.name tpl
  FROM reports r LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.updated_at DESC`).all()));
app.get('/api/reports/:id', (req, res) => res.json(reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id))));
function saveReport(id, b) {
  const title = b.title || [b.input?.company, b.input?.session_date].filter(Boolean).join(' ') || '새 보고서';
  const args = [b.template_id, title, b.input?.company || '', b.input?.session_date || '', b.status || '작성중',
    JSON.stringify(b.input || {}), JSON.stringify(b.sources || []), b.result ? JSON.stringify(b.result) : null];
  if (id) {
    db.prepare(`UPDATE reports SET template_id=?, title=?, company=?, session_date=?, status=?, input=?, sources=?, result=?,
      updated_at=datetime('now','localtime') WHERE id=?`).run(...args, id);
    return id;
  }
  return db.prepare('INSERT INTO reports (template_id, title, company, session_date, status, input, sources, result) VALUES (?,?,?,?,?,?,?,?)').run(...args).lastInsertRowid;
}
app.post('/api/reports', wrap((req, res) => res.json(reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(saveReport(null, req.body))))));
app.put('/api/reports/:id', wrap((req, res) => { saveReport(req.params.id, req.body); res.json(reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id))); }));
app.delete('/api/reports/:id', wrap((req, res) => { db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id); res.json({ ok: true }); }));

// 비어 있는 기본정보 칸은 기본데이터 규칙(from)으로 채운다
function withInfoDefaults(tpl, fields = {}, input = {}) {
  const out = { ...fields };
  for (const f of tpl.fields) if (f.kind === 'info' && !out[f.key]) out[f.key] = interpolate(f.from, input);
  return out;
}

app.post('/api/reports/:id/generate', wrap(async (req, res) => {
  const r = reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id));
  const tpl = getTpl(r.template_id);
  const out = await generateReport({ tpl, input: r.input, sources: resolveSources(r.sources) });
  const result = { ...out, generated_at: new Date().toISOString() };
  db.prepare("UPDATE reports SET result = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(result), r.id);
  res.json(result);
}));
app.post('/api/reports/:id/rewrite', wrap(async (req, res) => {
  const r = reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id));
  const tpl = getTpl(r.template_id);
  const text = await rewriteField({ tpl, field: req.body.field, current: req.body.current, instruction: req.body.instruction,
    core: r.result?.core, sources: resolveSources(r.sources) });
  res.json({ text });
}));
// 보고서 파일 다운로드: /docx (Word), /hwp·/pdf (설치된 한글로 변환)
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', hwp: 'application/x-hwp', pdf: 'application/pdf' };
app.get('/api/reports/:id/:fmt(docx|hwp|pdf)', wrap(async (req, res) => {
  const r = reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id));
  if (!r) throw Object.assign(new Error('보고서를 찾을 수 없습니다.'), { status: 404 });
  const tpl = getTpl(r.template_id);
  const photos = r.sources
    .filter((s) => s.type === 'photo' && s.enabled !== false && s.file)
    .map((s) => ({ path: path.join(UPLOADS, path.basename(s.file)), caption: s.caption || '' }))
    .filter((p) => fs.existsSync(p.path));
  let buf = await buildDocx({ tpl, values: withInfoDefaults(tpl, r.result?.fields, r.input), input: r.input, photos });
  const { fmt } = req.params;
  if (fmt !== 'docx') buf = await convertDocx(buf, fmt);
  const fname = `${tpl.name}_${r.company || '보고서'}_${r.session_date || ''}.${fmt}`.replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', MIME[fmt]);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
  res.send(buf);
}));
app.get('/api/hwp-available', wrap(async (req, res) => res.json({ available: await hwpAvailable() })));
// 보고서를 업무 이력에 등록
app.post('/api/reports/:id/register', wrap((req, res) => {
  const r = reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id));
  const tpl = getTpl(r.template_id);
  const topic = r.result?.fields?.topic || r.result?.fields?.task || r.input.gubun || tpl.name.replace(/(보고서|상담일지|수행일지|결과보고서|수행계획서)$/, '').trim();
  const a = db.prepare(`INSERT INTO activities (category, start_date, org, title, count, hours, status, note) VALUES ('컨설팅', ?, ?, ?, 1, ?, '완료', ?)`)
    .run(r.input.session_date || null, tpl.org, `${topic} - ${r.input.company || ''}`.trim(), req.body.hours ?? null, `보고서 #${r.id}`);
  res.json({ activity_id: Number(a.lastInsertRowid) });
}));

// ── 엑셀 내보내기 ───────────────────────────────────────────
// 제목줄: 티파니 블루 바탕 흰 글씨, 고정, 필터
function styleSheet(ws) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF088C88' } };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
}
// 관리 테이블 하나를 시트로 (금액은 천 단위 쉼표, 합계 행 추가)
function addTableSheet(wb, name) {
  const t = TABLES[name];
  const ws = wb.addWorksheet(t.label);
  ws.columns = t.columns.map((c) => ({
    header: c.label, key: c.key,
    width: c.type === 'longtext' ? 40 : c.type === 'url' ? 32 : c.type === 'date' ? 12 : c.type === 'money' ? 14 : c.type === 'number' ? 10 : 18,
    style: c.type === 'money' ? { numFmt: '#,##0' } : c.type === 'longtext' ? { alignment: { wrapText: true, vertical: 'top' } } : {},
  }));
  const rows = db.prepare(`SELECT * FROM ${name} ORDER BY ${t.order}, id DESC`).all();
  ws.addRows(rows);
  const sums = t.columns.filter((c) => c.type === 'money' || c.type === 'number');
  if (rows.length && sums.length) {
    const total = ws.addRow({ [t.columns[0].key]: '합계', ...Object.fromEntries(sums.map((c) => [c.key, rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)])) });
    total.font = { bold: true };
  }
  styleSheet(ws);
  return rows.length;
}
async function sendWorkbook(res, wb, fname) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
}
const today = () => new Date().toISOString().slice(0, 10);
app.get('/api/t/:table/xlsx', wrap(async (req, res) => {
  const t = tableOr404(req);
  const wb = new ExcelJS.Workbook();
  addTableSheet(wb, req.params.table);
  await sendWorkbook(res, wb, `${t.label}_${today()}.xlsx`);
}));
// 관리 데이터 전체(업무 이력·매출·교육·자격증·공고·가입 사이트)를 한 파일에 시트별로
app.get('/api/export/xlsx', wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  for (const name of Object.keys(TABLES)) addTableSheet(wb, name);
  await sendWorkbook(res, wb, `ConDesk_전체데이터_${today()}.xlsx`);
}));

// ── 업체 DB: 보고서 기본정보를 업체별로 모은다 ─────────────────
// 같은 업체 판단: 사업자번호가 있으면 그것으로, 없으면 회사명+대표자
function clientDb() {
  const rows = db.prepare(`SELECT r.id, r.title, r.status, r.input, r.session_date, t.name tpl, t.org
    FROM reports r LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.session_date, r.id`).all();
  const map = new Map();
  const sessions = [];
  for (const r of rows) {
    const i = parse(r.input, {});
    if (!i.company && !i.ceo) continue;
    const norm = (s) => (s || '').replace(/\s|\(주\)|주식회사|㈜/g, '').toLowerCase();
    const key = i.biz_no?.replace(/\D/g, '') || `${norm(i.company)}|${norm(i.ceo)}`;
    const date = i.session_date || r.session_date || '';
    sessions.push({ report_id: r.id, date, company: i.company || '', ceo: i.ceo || '', org: r.org || '', tpl: r.tpl || '', round: i.round || '', method: i.method || '', status: r.status });
    const c = map.get(key) || { key, company: '', ceo: '', position: '', biz_no: '', phone: '', biz_phone: '', industry: '', item: '', open_date: '', address: '', first_date: date, last_date: date, count: 0, orgs: new Set(), reports: [] };
    // 나중 보고서의 값이 있으면 그것으로 갱신(최신 정보 우선)
    const pairs = { company: i.company, ceo: i.ceo, position: i.mentee_position, biz_no: i.biz_no, phone: i.phone, biz_phone: i.biz_phone, industry: i.industry, item: i.item, open_date: i.open_date, address: i.address };
    for (const [k, v] of Object.entries(pairs)) if (v) c[k] = v;
    if (date && (!c.first_date || date < c.first_date)) c.first_date = date;
    if (date && date > c.last_date) c.last_date = date;
    c.count += 1;
    if (r.org) c.orgs.add(r.org);
    c.reports.push({ id: r.id, date, tpl: r.tpl, status: r.status });
    map.set(key, c);
  }
  const clients = [...map.values()].map((c) => ({ ...c, orgs: [...c.orgs].join(', ') })).sort((a, b) => (b.last_date || '').localeCompare(a.last_date || ''));
  return { clients, sessions: sessions.sort((a, b) => (b.date || '').localeCompare(a.date || '')) };
}
app.get('/api/clients', (req, res) => res.json(clientDb()));
app.get('/api/clients/xlsx', wrap(async (req, res) => {
  const { clients, sessions } = clientDb();
  const wb = new ExcelJS.Workbook();
  const style = styleSheet;
  const ws = wb.addWorksheet('업체 목록');
  ws.columns = [
    { header: '최근 상담일', key: 'last_date', width: 12 }, { header: '첫 상담일', key: 'first_date', width: 12 },
    { header: '회사명', key: 'company', width: 22 }, { header: '대표자', key: 'ceo', width: 10 }, { header: '직위', key: 'position', width: 10 },
    { header: '업종', key: 'industry', width: 22 }, { header: '아이템', key: 'item', width: 22 },
    { header: '사업자등록번호', key: 'biz_no', width: 15 }, { header: '휴대전화', key: 'phone', width: 15 }, { header: '사업장 전화', key: 'biz_phone', width: 15 },
    { header: '개업일', key: 'open_date', width: 12 }, { header: '사업장 주소', key: 'address', width: 34 },
    { header: '상담 횟수', key: 'count', width: 9 }, { header: '진행 기관', key: 'orgs', width: 28 },
  ];
  ws.addRows(clients);
  style(ws);
  const ws2 = wb.addWorksheet('상담 내역');
  ws2.columns = [
    { header: '상담일', key: 'date', width: 12 }, { header: '회사명', key: 'company', width: 22 }, { header: '대표자', key: 'ceo', width: 10 },
    { header: '기관', key: 'org', width: 24 }, { header: '보고서 양식', key: 'tpl', width: 32 }, { header: '회차', key: 'round', width: 6 },
    { header: '진행방법', key: 'method', width: 12 }, { header: '보고서 상태', key: 'status', width: 10 },
  ];
  ws2.addRows(sessions);
  style(ws2);
  const fname = `업체DB_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
}));

// ── 화면(빌드 결과) 제공 ────────────────────────────────────
const dist = path.join(here, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.get('/api/public-url', (req, res) => res.json({ url: getPublicUrl() }));

app.listen(PORT, HOST, () => {
  console.log(`컨데스크(ConDesk): http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}${authEnabled() ? ' (로그인 사용)' : ''}`);
  if (TUNNEL) startTunnel(PORT);
});
