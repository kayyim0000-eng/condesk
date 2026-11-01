// '프로젝트 관리시트.xlsx'를 읽어 DB로 가져온다.
// 화면(설정 > 데이터 가져오기)에서 업로드하거나, 명령줄에서: npm run import -- "경로/프로젝트 관리시트.xlsx"
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { TABLES } from './schema.js';

function val(cell) {
  let v = cell?.value;
  if (v && typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
    else if ('formula' in v) v = null;
  }
  return v ?? null;
}

const pad = (n) => String(n).padStart(2, '0');
function toDate(v, fallbackYear) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}
// '2025.06.16.~12.31.' → [시작, 종료]
function toRange(v) {
  if (!v) return [null, null];
  const [a, b] = String(v).split('~');
  const start = toDate(a);
  const end = b && !/현재/.test(b) ? toDate(b, start?.slice(0, 4)) : null;
  return [start, end];
}
const num = (v) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function guessCategory(text = '') {
  if (/심사|평가|면접/.test(text)) return '심사';
  if (/강의|강연|특강|교육|원교료/.test(text)) return '강의';
  if (/컨설팅|멘토|멘토링|코칭|퍼실리|클리닉|진단|채움|상담|노란우산/.test(text)) return '컨설팅';
  return '기타';
}

// 헤더 행(텍스트로 판별)을 찾아 열 이름 → 열 번호 맵 반환
function findHeader(ws, mustHave) {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    const map = {};
    row.eachCell((c, col) => { const t = String(val(c) ?? '').replace(/\s+/g, ''); if (t) map[t] = col; });
    if (Object.keys(map).some((k) => k.includes(mustHave))) return { row: r, map };
  }
  return null;
}
const colOf = (map, ...names) => {
  for (const n of names) {
    const k = Object.keys(map).find((h) => h.includes(n.replace(/\s+/g, '')));
    if (k) return map[k];
  }
  return null;
};

function rowsAfter(ws, header, stopWord = '합') {
  const out = [];
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const first = String(val(row.getCell(2)) ?? '').replace(/\s+/g, '');
    if (first.startsWith(stopWord)) break;
    out.push(row);
  }
  return out;
}

function insert(table, rec) {
  const cols = TABLES[table].columns.map((c) => c.key).filter((k) => rec[k] !== undefined && rec[k] !== null && rec[k] !== '');
  if (!cols.length) return;
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((k) => rec[k]));
}

export async function importWorkbook(file, { replace = false } = {}) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(file)) await wb.xlsx.load(file); else await wb.xlsx.readFile(file);
  const counts = {};
  const add = (t, rec) => { insert(t, rec); counts[t] = (counts[t] || 0) + 1; };
  if (replace) for (const t of Object.keys(TABLES)) db.exec(`DELETE FROM ${t}`);

  for (const ws of wb.worksheets) {
    const name = ws.name;
    if (name.includes('매출')) {
      const h = findHeader(ws, '기관이름'); if (!h) continue;
      const c = { date: colOf(h.map, '연도-월', '날짜'), org: colOf(h.map, '기관'), title: colOf(h.map, '프로젝트'), amount: colOf(h.map, '금액'), settle: colOf(h.map, '정산'), note: colOf(h.map, '비고') };
      for (const row of rowsAfter(ws, h)) {
        const org = val(row.getCell(c.org)); const amount = num(val(row.getCell(c.amount)));
        if (!org || !amount) continue;
        const title = val(row.getCell(c.title)) ?? '';
        const net = num(val(row.getCell(c.amount + 1)));
        add('revenues', {
          date: toDate(val(row.getCell(c.date))), category: guessCategory(title), org: String(org).trim(), title,
          amount, net_amount: net ? Math.round(net) : Math.round(amount * 0.967),
          settle_status: /정산/.test(String(val(row.getCell(c.settle)) ?? '')) ? '정산완료' : '예정',
          note: c.note ? val(row.getCell(c.note)) : null,
        });
      }
    } else if (/실적관리|강의실적|심사실적/.test(name)) {
      const h = findHeader(ws, 'NO'); if (!h) continue;
      const fixed = name.includes('강의') ? '강의' : name.includes('심사') ? '심사' : null;
      const c = {
        date: colOf(h.map, '일시', '일자'), org: colOf(h.map, '기관'), title: colOf(h.map, '실적사항', '강의명', '심사/평가명', '내용'),
        count: colOf(h.map, '건수', '심사대상수'), hours: colOf(h.map, '시간'), amount: colOf(h.map, '강의료', '심사수당'),
        note: colOf(h.map, '비고'), status: colOf(h.map, '진행상태'),
      };
      for (const row of rowsAfter(ws, h)) {
        const title = val(row.getCell(c.title)); if (!title) continue;
        const [start, end] = toRange(val(row.getCell(c.date)));
        const rawDate = String(val(row.getCell(c.date)) ?? '');
        add('activities', {
          // 실적관리 시트는 컨설팅·멘토링 실적이므로 키워드가 없으면 컨설팅으로 본다
          category: fixed || (guessCategory(title) === '기타' ? '컨설팅' : guessCategory(title)), start_date: start, end_date: end,
          org: val(row.getCell(c.org)) ?? '', title, count: num(val(row.getCell(c.count))), hours: c.hours ? num(val(row.getCell(c.hours))) : null,
          status: /현재/.test(rawDate) ? '진행중' : '완료', note: c.note ? val(row.getCell(c.note)) : null,
        });
      }
    } else if (name.includes('교육')) {
      const h = findHeader(ws, 'NO'); if (!h) continue;
      const c = { date: colOf(h.map, '수강일자'), org: colOf(h.map, '교육기관'), title: colOf(h.map, '교육명'), mode: colOf(h.map, '교육구분'), hours: colOf(h.map, '교육시간'), url: colOf(h.map, 'URL'), id: colOf(h.map, '아이디'), pw: colOf(h.map, '패스워드'), cert: colOf(h.map, '수료증') };
      for (const row of rowsAfter(ws, h, '총')) {
        const title = val(row.getCell(c.title)); if (!title) continue;
        const mode = String(val(row.getCell(c.mode)) ?? '');
        add('trainings', {
          date: toDate(val(row.getCell(c.date))), org: val(row.getCell(c.org)), title,
          mode: mode.includes('오프') ? '오프라인' : mode.includes('온') ? '온라인' : '혼합',
          hours: num(val(row.getCell(c.hours))), url: val(row.getCell(c.url)), login_id: val(row.getCell(c.id)), login_pw: val(row.getCell(c.pw)),
          cert_status: /발급/.test(String(val(row.getCell(c.cert)) ?? '')) ? '발급완료' : '미발급',
        });
      }
    } else if (name.includes('지원')) {
      const h = findHeader(ws, 'NO'); if (!h) continue;
      const c = { date: colOf(h.map, '지원날짜'), org: colOf(h.map, '기관'), title: colOf(h.map, '지원내용'), url: colOf(h.map, '웹사이트'), amount: colOf(h.map, '신청금액'), status: colOf(h.map, '진행상태'), note: colOf(h.map, '비고') };
      for (const row of rowsAfter(ws, h)) {
        const title = val(row.getCell(c.title)); if (!title) continue;
        const st = String(val(row.getCell(c.status)) ?? '');
        add('notices', {
          category: guessCategory(title), org: val(row.getCell(c.org)), title, posted_date: toDate(val(row.getCell(c.date))), url: val(row.getCell(c.url)),
          amount: num(val(row.getCell(c.amount))), status: /탈락/.test(st) ? '탈락' : /선정/.test(st) ? '선정' : '지원완료', note: val(row.getCell(c.note)),
        });
      }
    } else if (name.includes('계정')) {
      const h = findHeader(ws, 'NO'); if (!h) continue;
      const c = { cat: colOf(h.map, '분류'), site: colOf(h.map, '사이트명'), url: colOf(h.map, '웹사이트'), id: colOf(h.map, '아이디'), pw: colOf(h.map, '패스워드'), date: colOf(h.map, '등록'), note: colOf(h.map, '비고') };
      for (const row of rowsAfter(ws, h)) {
        const site = val(row.getCell(c.site)); if (!site) continue;
        add('accounts', { category: val(row.getCell(c.cat)), site, url: val(row.getCell(c.url)), login_id: val(row.getCell(c.id)), login_pw: val(row.getCell(c.pw)), updated_date: toDate(val(row.getCell(c.date))), note: val(row.getCell(c.note)) });
      }
    }
  }
  return counts;
}

// 명령줄 실행
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '프로젝트 관리시트.xlsx');
  importWorkbook(file, { replace: process.argv.includes('--replace') })
    .then((c) => console.log('가져오기 완료:', c))
    .catch((e) => { console.error(e); process.exit(1); });
}
