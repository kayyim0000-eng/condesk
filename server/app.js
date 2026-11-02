// ConDesk API (Express). 로컬 서버(server/index.js)와 Vercel Function(api/index.js)이 함께 쓴다.
import express from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { all, get, run, exec, ready, loadSettings, getSetting, setSetting, nowStr, IS_PG } from './db.js';
import { putFile, getFile } from './storage.js';
import { TABLES, CATEGORIES, CERT_CATEGORIES } from './schema.js';
import { PARTS, interpolate } from './templates.js';
import { INPUT_KEYS, generateReport, rewriteField, analyzeTemplate, transcribe, extractBasicInfo, sttLimitMb } from './ai.js';
import { extractText, fileKind, fixName } from './extract.js';
import { buildDocx, imageType } from './docx.js';
import { convertDocx, hwpAvailable } from './hwp.js';
import { importWorkbook } from './importXlsx.js';
import { authEnabled, mountAuth } from './auth.js';
import { getPublicUrl } from './tunnel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ON_VERCEL = Boolean(process.env.VERCEL);

export const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));

// Vercel에서는 로그인 비밀번호(APP_PASSWORD) 없이는 아무것도 열지 않는다
if (ON_VERCEL && !authEnabled()) {
  app.use('/api', (req, res) => res.status(503).json({ error: 'Vercel 환경변수 APP_PASSWORD(로그인 비밀번호)를 설정해 주세요.' }));
}
// Vercel의 디스크는 임시라서 DB(Supabase) 연결 없이는 저장하지 않는다
if (ON_VERCEL && !IS_PG) {
  app.use('/api', (req, res) => res.status(503).json({ error: 'Supabase 데이터베이스가 연결되지 않았습니다. Vercel 환경변수 DATABASE_URL(또는 Supabase 연결)을 설정해 주세요.' }));
}
mountAuth(app);
// 로그인을 통과한 요청마다: 테이블 준비(처음 한 번) + 설정 읽기
app.use('/api', async (req, res, next) => {
  try { await ready(); await loadSettings(); next(); } catch (e) { next(e); }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e.status && e.status < 500) console.warn(`[${e.status}] ${req.method} ${req.path}: ${e.message}`);
  else console.error(e);
  res.status(e.status || 500).json({ error: e.message || String(e) });
});
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });

// ── 공통 정보 ───────────────────────────────────────────────
app.get('/api/schema', (req, res) => res.json({ tables: TABLES, categories: CATEGORIES, parts: PARTS, inputKeys: INPUT_KEYS }));

// ── 관리 테이블 CRUD ────────────────────────────────────────
function tableOr404(req) {
  const t = TABLES[req.params.table];
  if (!t) throw notFound('없는 테이블');
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
const listTable = (name) => all(`SELECT * FROM ${name} ORDER BY ${TABLES[name].order}, id DESC`);
app.get('/api/t/:table', wrap(async (req, res) => {
  tableOr404(req);
  res.json(await listTable(req.params.table));
}));
app.post('/api/t/:table', wrap(async (req, res) => {
  const t = tableOr404(req);
  const rec = pick(t, req.body);
  const keys = Object.keys(rec);
  const row = await get(`INSERT INTO ${req.params.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`, ...keys.map((k) => rec[k]));
  res.json(await get(`SELECT * FROM ${req.params.table} WHERE id = ?`, row.id));
}));
app.put('/api/t/:table/:id', wrap(async (req, res) => {
  const t = tableOr404(req);
  const rec = pick(t, req.body);
  const keys = Object.keys(rec);
  await run(`UPDATE ${req.params.table} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => rec[k]), nowStr(), Number(req.params.id));
  res.json(await get(`SELECT * FROM ${req.params.table} WHERE id = ?`, Number(req.params.id)));
}));
app.delete('/api/t/:table/:id', wrap(async (req, res) => {
  tableOr404(req);
  await run(`DELETE FROM ${req.params.table} WHERE id = ?`, Number(req.params.id));
  res.json({ ok: true });
}));

// ── 대시보드 ────────────────────────────────────────────────
app.get('/api/dashboard', wrap(async (req, res) => {
  const years = (await all(`SELECT DISTINCT substr(date,1,4) y FROM revenues WHERE date IS NOT NULL
    UNION SELECT DISTINCT substr(start_date,1,4) y FROM activities WHERE start_date IS NOT NULL ORDER BY 1 DESC`)).map((r) => r.y);
  const year = req.query.year || years[0] || String(new Date().getFullYear());
  const today = new Date().toISOString().slice(0, 10);

  const rev = await get(`SELECT COALESCE(SUM(amount),0) amount, COALESCE(SUM(net_amount),0) net, COUNT(*) n,
    COALESCE(SUM(CASE WHEN COALESCE(settle_status,'') <> '정산완료' THEN amount END),0) unsettled FROM revenues WHERE substr(date,1,4) = ?`, year);
  const prev = await get('SELECT COALESCE(SUM(amount),0) amount FROM revenues WHERE substr(date,1,4) = ?', String(Number(year) - 1));
  const byCat = await all('SELECT category, SUM(amount) amount, COUNT(*) n FROM revenues WHERE substr(date,1,4) = ? GROUP BY category', year);
  const monthlyRows = await all(`SELECT CAST(substr(date,6,2) AS INTEGER) m, category, SUM(amount) amount, COUNT(*) n FROM revenues
    WHERE substr(date,1,4) = ? GROUP BY 1, category`, year);
  const byMonth = (key) => Array.from({ length: 12 }, (_, i) => {
    const o = { month: `${i + 1}월` };
    for (const c of CATEGORIES) o[c] = 0;
    for (const r of monthlyRows) if (Number(r.m) === i + 1) o[r.category || '기타'] += Number(r[key]) || 0;
    return o;
  });
  const monthly = byMonth('amount');
  const monthlyCount = byMonth('n');
  const topOrgs = await all(`SELECT org, SUM(amount) amount, COUNT(*) n FROM revenues WHERE substr(date,1,4) = ?
    GROUP BY org ORDER BY 2 DESC LIMIT 7`, year);
  const act = await all(`SELECT category, COUNT(*) n, COALESCE(SUM(count),0) cnt, COALESCE(SUM(hours),0) hours FROM activities
    WHERE substr(start_date,1,4) = ? GROUP BY category`, year);
  const training = await get(`SELECT COUNT(*) n, COALESCE(SUM(hours),0) hours FROM trainings WHERE substr(date,1,4) = ?`, year);
  const notices = await all(`SELECT * FROM notices WHERE deadline >= ? AND (status IS NULL OR status IN ('관심','지원예정'))
    ORDER BY deadline LIMIT 8`, today);
  const certTotal = (await get(`SELECT COUNT(*) n FROM certificates WHERE COALESCE(status,'') <> '취득준비'`)).n;
  const certByCat = await all(`SELECT COALESCE(category, '기타') category, COUNT(*) n FROM certificates
    WHERE COALESCE(status,'') <> '취득준비' GROUP BY 1`);
  const reports = await all(`SELECT r.id, r.title, r.company, r.session_date, r.status, t.name tpl FROM reports r
    LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.updated_at DESC LIMIT 6`);
  const counts = {};
  for (const t of Object.keys(TABLES)) counts[t] = (await get(`SELECT COUNT(*) n FROM ${t}`)).n;
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
app.put('/api/settings', wrap(async (req, res) => {
  for (const k of SETTING_KEYS) {
    if (!(k in req.body)) continue;
    if (SECRET_KEYS.includes(k) && String(req.body[k]).includes('••••')) continue; // 마스킹된 값은 그대로 둔다
    await setSetting(k, String(req.body[k] ?? '').trim());
  }
  res.json({ ok: true });
}));
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
    await putFile(file, f.buffer, 'application/pdf');
    return res.json({ type: 'pdf', name, file, text: '' });
  }
  if (kind === 'image') {
    // 보고서에 넣을 사진 (화면에서 JPEG로 줄여서 올라온다)
    const ext = imageType(f.buffer);
    if (!ext) throw Object.assign(new Error('JPG 또는 PNG 사진만 넣을 수 있습니다.'), { status: 400 });
    const file = `${crypto.randomUUID()}.${ext}`;
    await putFile(file, f.buffer, ext === 'png' ? 'image/png' : 'image/jpeg');
    return res.json({ type: 'photo', name, file });
  }
  res.json({ type: 'doc', name, text: await extractText(f.buffer, name) });
}));
// 업로드한 사진 보기
app.get('/api/files/:file', wrap(async (req, res) => {
  const buf = await getFile(req.params.file);
  if (!buf) return res.status(404).end();
  const ext = path.extname(req.params.file).toLowerCase();
  res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(buf);
}));
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
// 보고서 원자료 중 사용하는 것만 고르고, PDF는 파일 내용을 불러 붙인다
async function resolveSources(sources = []) {
  const out = [];
  for (const s of sources.filter((x) => x.enabled !== false)) {
    out.push(s.type === 'pdf' && s.file ? { ...s, buf: await getFile(s.file) } : s);
  }
  return out;
}

// ── 보고서 양식 ─────────────────────────────────────────────
const tplRow = (r) => r && { ...parse(r.def, {}), id: r.id, builtin: Boolean(r.builtin) };
app.get('/api/templates', wrap(async (req, res) => res.json((await all('SELECT * FROM templates WHERE COALESCE(hidden,0) <> 1 ORDER BY builtin DESC, created_at')).map(tplRow))));
app.get('/api/templates/hidden', wrap(async (req, res) => res.json(await all('SELECT id, name FROM templates WHERE hidden = 1'))));
app.post('/api/templates/restore', wrap(async (req, res) => { await exec('UPDATE templates SET hidden = 0'); res.json({ ok: true }); }));
app.get('/api/templates/:id', wrap(async (req, res) => res.json(tplRow(await get('SELECT * FROM templates WHERE id = ?', req.params.id)) || null)));
app.post('/api/templates/analyze', upload.single('file'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw Object.assign(new Error('양식 파일을 선택해 주세요.'), { status: 400 });
  const name = fixName(f.originalname);
  const def = fileKind(name) === 'pdf'
    ? await analyzeTemplate({ pdfBuf: f.buffer, fileName: name })
    : await analyzeTemplate({ text: await extractText(f.buffer, name), fileName: name });
  res.json(def);
}));
app.post('/api/templates', wrap(async (req, res) => {
  const t = req.body;
  const id = t.id && !(await get('SELECT 1 x FROM templates WHERE id = ?', t.id)) ? t.id : `custom_${Date.now()}`;
  await run('INSERT INTO templates (id, name, org, description, def, builtin) VALUES (?, ?, ?, ?, ?, 0)', id, t.name, t.org, t.description, JSON.stringify({ ...t, id }));
  res.json(tplRow(await get('SELECT * FROM templates WHERE id = ?', id)));
}));
app.put('/api/templates/:id', wrap(async (req, res) => {
  const row = await get('SELECT builtin FROM templates WHERE id = ?', req.params.id);
  if (!row) throw notFound('없는 양식');
  if (row.builtin) throw Object.assign(new Error('기본 제공 양식은 수정할 수 없습니다.'), { status: 400 });
  const t = req.body;
  await run('UPDATE templates SET name=?, org=?, description=?, def=? WHERE id=?', t.name, t.org, t.description, JSON.stringify({ ...t, id: req.params.id }), req.params.id);
  res.json({ ok: true });
}));
// 기본 양식이나 이미 보고서에 쓰인 양식은 숨기기만 한다 (기존 보고서는 계속 열리도록)
app.delete('/api/templates/:id', wrap(async (req, res) => {
  const row = await get('SELECT builtin FROM templates WHERE id = ?', req.params.id);
  if (!row) return res.json({ ok: true });
  const used = (await get('SELECT COUNT(*) n FROM reports WHERE template_id = ?', req.params.id)).n;
  if (row.builtin || used) await run('UPDATE templates SET hidden = 1 WHERE id = ?', req.params.id);
  else await run('DELETE FROM templates WHERE id = ?', req.params.id);
  res.json({ ok: true, hidden: Boolean(row.builtin || used) });
}));

// ── 보고서 ──────────────────────────────────────────────────
const reportRow = (r) => r && { ...r, input: parse(r.input, {}), sources: parse(r.sources, []), result: parse(r.result, null) };
const getReport = async (id) => {
  const r = reportRow(await get('SELECT * FROM reports WHERE id = ?', Number(id)));
  if (!r) throw notFound('보고서를 찾을 수 없습니다.');
  return r;
};
const getTpl = async (id) => {
  const t = tplRow(await get('SELECT * FROM templates WHERE id = ?', id));
  if (!t) throw notFound('양식을 찾을 수 없습니다.');
  return t;
};
app.get('/api/reports', wrap(async (req, res) => res.json(await all(`SELECT r.id, r.title, r.company, r.session_date, r.status, r.template_id, r.updated_at, t.name tpl
  FROM reports r LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.updated_at DESC`))));
app.get('/api/reports/:id', wrap(async (req, res) => res.json(await getReport(req.params.id))));
async function saveReport(id, b) {
  const title = b.title || [b.input?.company, b.input?.session_date].filter(Boolean).join(' ') || '새 보고서';
  const args = [b.template_id, title, b.input?.company || '', b.input?.session_date || '', b.status || '작성중',
    JSON.stringify(b.input || {}), JSON.stringify(b.sources || []), b.result ? JSON.stringify(b.result) : null];
  if (id) {
    await run(`UPDATE reports SET template_id=?, title=?, company=?, session_date=?, status=?, input=?, sources=?, result=?, updated_at=? WHERE id=?`,
      ...args, nowStr(), Number(id));
    return Number(id);
  }
  return (await get('INSERT INTO reports (template_id, title, company, session_date, status, input, sources, result) VALUES (?,?,?,?,?,?,?,?) RETURNING id', ...args)).id;
}
app.post('/api/reports', wrap(async (req, res) => res.json(await getReport(await saveReport(null, req.body)))));
app.put('/api/reports/:id', wrap(async (req, res) => { await saveReport(req.params.id, req.body); res.json(await getReport(req.params.id)); }));
app.delete('/api/reports/:id', wrap(async (req, res) => { await run('DELETE FROM reports WHERE id = ?', Number(req.params.id)); res.json({ ok: true }); }));

// 비어 있는 기본정보 칸은 기본데이터 규칙(from)으로 채운다
function withInfoDefaults(tpl, fields = {}, input = {}) {
  const out = { ...fields };
  for (const f of tpl.fields) if (f.kind === 'info' && !out[f.key]) out[f.key] = interpolate(f.from, input);
  return out;
}

app.post('/api/reports/:id/generate', wrap(async (req, res) => {
  const r = await getReport(req.params.id);
  const tpl = await getTpl(r.template_id);
  const out = await generateReport({ tpl, input: r.input, sources: await resolveSources(r.sources) });
  const result = { ...out, generated_at: new Date().toISOString() };
  await run('UPDATE reports SET result = ?, updated_at = ? WHERE id = ?', JSON.stringify(result), nowStr(), r.id);
  res.json(result);
}));
app.post('/api/reports/:id/rewrite', wrap(async (req, res) => {
  const r = await getReport(req.params.id);
  const tpl = await getTpl(r.template_id);
  const text = await rewriteField({ tpl, field: req.body.field, current: req.body.current, instruction: req.body.instruction,
    core: r.result?.core, sources: await resolveSources(r.sources) });
  res.json({ text });
}));
// 보고서 파일 다운로드: /docx (Word), /hwp·/pdf (한글이 설치된 PC에서만)
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', hwp: 'application/x-hwp', pdf: 'application/pdf' };
app.get('/api/reports/:id/:fmt(docx|hwp|pdf)', wrap(async (req, res) => {
  const r = await getReport(req.params.id);
  const tpl = await getTpl(r.template_id);
  const photos = [];
  for (const s of r.sources.filter((x) => x.type === 'photo' && x.enabled !== false && x.file)) {
    const buf = await getFile(s.file);
    if (buf) photos.push({ buf, caption: s.caption || '' });
  }
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
app.post('/api/reports/:id/register', wrap(async (req, res) => {
  const r = await getReport(req.params.id);
  const tpl = await getTpl(r.template_id);
  const topic = r.result?.fields?.topic || r.result?.fields?.task || r.input.gubun || tpl.name.replace(/(보고서|상담일지|수행일지|결과보고서|수행계획서)$/, '').trim();
  const a = await get(`INSERT INTO activities (category, start_date, org, title, count, hours, status, note) VALUES ('컨설팅', ?, ?, ?, 1, ?, '완료', ?) RETURNING id`,
    r.input.session_date || null, tpl.org, `${topic} - ${r.input.company || ''}`.trim(), req.body.hours ?? null, `보고서 #${r.id}`);
  res.json({ activity_id: Number(a.id) });
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
async function addTableSheet(wb, name) {
  const t = TABLES[name];
  const ws = wb.addWorksheet(t.label);
  ws.columns = t.columns.map((c) => ({
    header: c.label, key: c.key,
    width: c.type === 'longtext' ? 40 : c.type === 'url' ? 32 : c.type === 'date' ? 12 : c.type === 'money' ? 14 : c.type === 'number' ? 10 : 18,
    style: c.type === 'money' ? { numFmt: '#,##0' } : c.type === 'longtext' ? { alignment: { wrapText: true, vertical: 'top' } } : {},
  }));
  const rows = await listTable(name);
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
  await addTableSheet(wb, req.params.table);
  await sendWorkbook(res, wb, `${t.label}_${today()}.xlsx`);
}));
// 관리 데이터 전체(업무 이력·매출·교육·자격증·공고·가입 사이트)를 한 파일에 시트별로
app.get('/api/export/xlsx', wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  for (const name of Object.keys(TABLES)) await addTableSheet(wb, name);
  await sendWorkbook(res, wb, `ConDesk_전체데이터_${today()}.xlsx`);
}));

// ── 업체 DB: 보고서 기본정보를 업체별로 모은다 ─────────────────
// 같은 업체 판단: 사업자번호가 있으면 그것으로, 없으면 회사명+대표자
async function clientDb() {
  const rows = await all(`SELECT r.id, r.title, r.status, r.input, r.session_date, t.name tpl, t.org
    FROM reports r LEFT JOIN templates t ON t.id = r.template_id ORDER BY r.session_date, r.id`);
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
app.get('/api/clients', wrap(async (req, res) => res.json(await clientDb())));
app.get('/api/clients/xlsx', wrap(async (req, res) => {
  const { clients, sessions } = await clientDb();
  const wb = new ExcelJS.Workbook();
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
  styleSheet(ws);
  const ws2 = wb.addWorksheet('상담 내역');
  ws2.columns = [
    { header: '상담일', key: 'date', width: 12 }, { header: '회사명', key: 'company', width: 22 }, { header: '대표자', key: 'ceo', width: 10 },
    { header: '기관', key: 'org', width: 24 }, { header: '보고서 양식', key: 'tpl', width: 32 }, { header: '회차', key: 'round', width: 6 },
    { header: '진행방법', key: 'method', width: 12 }, { header: '보고서 상태', key: 'status', width: 10 },
  ];
  ws2.addRows(sessions);
  styleSheet(ws2);
  await sendWorkbook(res, wb, `업체DB_${today()}.xlsx`);
}));

app.get('/api/public-url', (req, res) => res.json({ url: getPublicUrl() }));

// 오류 처리 (위 미들웨어에서 넘어온 DB 연결 오류 등)
app.use('/api', (err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: `서버 오류: ${err.message}` });
});

// ── 화면(빌드 결과) 제공: 로컬 실행용. Vercel은 dist를 직접 내보낸다 ──
const dist = path.join(here, '..', 'dist');
if (!ON_VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export default app;
