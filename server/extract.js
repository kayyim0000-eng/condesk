// 첨부 문서에서 텍스트 추출: HWP(5.x), HWPX, DOCX, TXT/MD/VTT/SRT. PDF는 Claude에 문서로 그대로 전달한다.
import zlib from 'node:zlib';
import path from 'node:path';
import CFB from 'cfb';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const HWPTAG_PARA_TEXT = 67;
// 확장 컨트롤 문자(16바이트 차지)
const EXTENDED_CTRL = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

function hwpText(buf) {
  const cfb = CFB.read(buf, { type: 'buffer' });
  const header = CFB.find(cfb, 'FileHeader');
  const compressed = header ? (header.content[36] & 1) === 1 : true;
  const sections = cfb.FileIndex
    .map((e, i) => ({ e, p: cfb.FullPaths[i] }))
    .filter(({ p }) => /BodyText\/Section\d+$/i.test(p))
    .sort((a, b) => Number(a.p.match(/(\d+)$/)[1]) - Number(b.p.match(/(\d+)$/)[1]));
  const lines = [];
  for (const { e } of sections) {
    let data = Buffer.from(e.content);
    if (compressed) data = zlib.inflateRawSync(data);
    let i = 0;
    while (i + 4 <= data.length) {
      const h = data.readUInt32LE(i); i += 4;
      const tag = h & 0x3ff;
      let size = (h >>> 20) & 0xfff;
      if (size === 0xfff) { size = data.readUInt32LE(i); i += 4; }
      const rec = data.subarray(i, i + size); i += size;
      if (tag !== HWPTAG_PARA_TEXT) continue;
      let t = '';
      for (let j = 0; j + 1 < rec.length;) {
        const c = rec.readUInt16LE(j);
        if (c < 32) {
          if (c === 9) t += '\t';
          j += EXTENDED_CTRL.has(c) ? 16 : 2;
          continue;
        }
        t += String.fromCharCode(c); j += 2;
      }
      lines.push(t);
    }
  }
  return lines.join('\n');
}

async function hwpxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /Contents\/section\d+\.xml$/i.test(n)).sort();
  const out = [];
  for (const n of names) {
    const xml = await zip.files[n].async('string');
    for (const p of xml.split(/<\/hp:p>/)) {
      const t = [...p.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)].map((m) => m[1]).join('');
      if (t) out.push(t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    }
  }
  return out.join('\n');
}

// 엑셀: 시트별로 한 행을 "칸 | 칸 | …" 한 줄로
async function xlsxText(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out = [];
  for (const ws of wb.worksheets) {
    out.push(`## ${ws.name}`);
    ws.eachRow((row) => {
      const cells = row.values.slice(1).map((v) => {
        if (v && typeof v === 'object') v = v instanceof Date ? v.toISOString().slice(0, 10) : v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : '');
        return String(v ?? '').trim();
      });
      if (cells.some(Boolean)) out.push(cells.join(' | '));
    });
  }
  return out.join('\n');
}

export function fileKind(name) {
  const ext = path.extname(name).toLowerCase();
  if (['.mp3', '.m4a', '.wav', '.webm', '.mp4', '.mpeg', '.mpga', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  return 'doc';
}

export async function extractText(buf, name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.hwp') return hwpText(buf);
  if (ext === '.hwpx') return hwpxText(buf);
  if (ext === '.docx') return (await mammoth.extractRawText({ buffer: buf })).value;
  if (ext === '.xlsx') return xlsxText(buf);
  if (['.txt', '.md', '.vtt', '.srt', '.csv', '.json'].includes(ext)) return buf.toString('utf8').replace(/^﻿/, '');
  throw Object.assign(new Error(`지원하지 않는 문서 형식입니다: ${ext} (HWP, HWPX, DOCX, XLSX, PDF, TXT, 사진 지원)`), { status: 400 });
}

// 파일명이 multer에서 latin1로 들어오는 문제 보정
export function fixName(name) {
  try { return Buffer.from(name, 'latin1').toString('utf8'); } catch { return name; }
}
