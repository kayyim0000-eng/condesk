// 양식 정의(layout)와 작성된 칸 값으로 Word(.docx) 문서를 만든다. 한글(HWP)에서도 열린다.
import fs from 'node:fs';
import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';

const FONT = '맑은 고딕';
const PAGE_W = 9638; // A4 본문 폭(dxa)
const border = { style: BorderStyle.SINGLE, size: 4, color: '555555' };
const borders = { top: border, bottom: border, left: border, right: border };

const fill = (s, input) => (s || '').replace(/\{(\w+)\}/g, (_, k) => input?.[k] ?? '');

export function fieldText(f, value) {
  if (f?.type === 'check') {
    const sel = Array.isArray(value) ? value : [];
    return f.options.map((o) => `${sel.includes(o) ? '☑' : '☐'} ${o}`).join('   ');
  }
  return value ?? '';
}

function paras(text, { bold = false, size = 20, align, shade } = {}) {
  const lines = String(text ?? '').split('\n');
  return lines.map((line) => new Paragraph({
    alignment: align,
    spacing: { before: 20, after: 20, line: 300 },
    children: [new TextRun({ text: line, bold, size, font: FONT })],
  }));
}

function colWidths(n) {
  if (n === 1) return [PAGE_W];
  if (n === 2) return [Math.round(PAGE_W * 0.2), PAGE_W - Math.round(PAGE_W * 0.2)];
  if (n === 4) return [0.17, 0.33, 0.17, 0.33].map((r) => Math.round(PAGE_W * r));
  return Array.from({ length: n }, () => Math.round(PAGE_W / n));
}

function renderTable(block, tpl, values) {
  const total = Math.max(...block.rows.map((r) => r.reduce((s, c) => s + (c.span || 1), 0)));
  const widths = colWidths(total);
  const fieldMap = Object.fromEntries(tpl.fields.map((f) => [f.key, f]));
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: block.rows.map((row) => {
      const used = row.slice(0, -1).reduce((s, c) => s + (c.span || 1), 0);
      let col = 0;
      return new TableRow({
        children: row.map((cell, i) => {
          const span = i === row.length - 1 ? total - used : cell.span || 1;
          const width = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
          col += span;
          const isLabel = cell.label !== undefined;
          let text;
          if (isLabel) text = cell.label;
          else if (cell.field) {
            text = `${cell.prefix || ''}${fieldText(fieldMap[cell.field], values[cell.field])}${cell.suffix || ''}`;
            if (cell.suffixField) text += `\n(${cell.suffixLabel} : ${values[cell.suffixField] || '                    '})`;
          } else text = cell.text || '';
          return new TableCell({
            columnSpan: span > 1 ? span : undefined,
            width: { size: width, type: WidthType.DXA },
            borders,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: isLabel ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EDF3' } : undefined,
            children: paras(text, { bold: isLabel, align: isLabel ? AlignmentType.CENTER : undefined }),
          });
        }),
      });
    }),
  });
}

// 사진 파일 형식(png/jpg)과 픽셀 크기 읽기
export function imageType(buf) {
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  return null;
}
function imageSize(buf) {
  if (imageType(buf) === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return { w: 4, h: 3 };
}
function imageRun(file, maxW, maxH) {
  const data = fs.readFileSync(file);
  const { w, h } = imageSize(data);
  const scale = Math.min(maxW / w, maxH / h);
  return new ImageRun({ type: imageType(data), data, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } });
}

// labels 칸 수만큼 한 줄에 놓고, 사진이 더 많으면 같은 칸 수로 줄을 늘린다
function photos(block, imgs = []) {
  const cols = block.labels.length;
  const w = Math.round(PAGE_W / cols);
  const pxW = w / 15 - 16; // dxa → px(96dpi), 여백 제외
  const n = Math.max(cols, Math.ceil(imgs.length / cols) * cols);
  const cells = Array.from({ length: n }, (_, i) => ({ img: imgs[i], label: imgs[i]?.caption || block.labels[i] || `사진 ${i + 1}` }));
  const rows = [];
  for (let r = 0; r < n; r += cols) {
    const line = cells.slice(r, r + cols);
    rows.push(new TableRow({
      height: { value: 3200, rule: HeightRule.ATLEAST },
      children: line.map((c) => new TableCell({
        borders, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: c.img ? [imageRun(c.img.path, pxW, 210)] : [] })],
      })),
    }));
    rows.push(new TableRow({ children: line.map((c) => new TableCell({ borders, width: { size: w, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EDF3' }, children: paras(c.label, { bold: true, align: AlignmentType.CENTER }) })) }));
  }
  const out = [];
  if (block.title) out.push(...paras(block.title, { bold: true, size: 22 }));
  out.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: block.labels.map(() => w), rows }));
  if (block.note) out.push(...paras(block.note, { size: 16 }));
  return out;
}

// 첨부 사진을 양식의 사진 칸에 차례로 배분. 사진 칸이 없는 양식이면 끝에 '사진' 칸을 붙인다.
function assignPhotos(layout, imgs) {
  const blocks = layout.filter((b) => b.type === 'photos');
  if (!imgs.length) return new Map();
  if (!blocks.length) {
    const extra = { type: 'photos', title: '사진', labels: ['사진 1', '사진 2'] };
    layout.push(extra);
    blocks.push(extra);
  }
  const map = new Map();
  let i = 0;
  blocks.forEach((b, k) => {
    const take = k === blocks.length - 1 ? imgs.length - i : Math.min(b.labels.length, imgs.length - i);
    map.set(b, imgs.slice(i, i + take));
    i += take;
  });
  return map;
}

function today(input) {
  const d = input?.session_date ? new Date(input.session_date) : new Date();
  const ok = !Number.isNaN(d.getTime());
  return ok ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : '      년   월   일';
}

export async function buildDocx({ tpl, values, input, photos: imgs = [] }) {
  const children = [];
  const gap = () => children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  const layout = [...tpl.layout];
  const photoMap = assignPhotos(layout, imgs);
  for (const b of layout) {
    if (b.type === 'title') {
      children.push(...paras(fill(b.text, input), { bold: true, size: 32, align: AlignmentType.CENTER }));
      gap();
    } else if (b.type === 'note') {
      children.push(...paras(b.text, { size: 18 }));
    } else if (b.type === 'heading') {
      gap();
      children.push(...paras(b.text, { bold: true, size: 24 }));
    } else if (b.type === 'table') {
      children.push(renderTable(b, tpl, values));
      gap();
    } else if (b.type === 'block') {
      children.push(...paras(values[b.field] || ''));
    } else if (b.type === 'photos') {
      gap();
      children.push(...photos(b, photoMap.get(b)));
    } else if (b.type === 'signature') {
      gap();
      if (b.text) children.push(...paras(b.text, { align: AlignmentType.CENTER }));
      gap();
      if (b.date) children.push(...paras(today(input), { align: AlignmentType.CENTER }));
      if (b.sign) children.push(...paras(fill(b.sign, input), { align: AlignmentType.RIGHT }));
      if (b.to) { gap(); children.push(...paras(b.to, { bold: true, size: 24, align: AlignmentType.CENTER })); }
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
