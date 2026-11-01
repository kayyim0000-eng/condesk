// 설치된 한글(Hancom Office)을 이용해 DOCX → HWP / PDF 변환 (Windows 전용)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docx2hwp.ps1');
const run = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout, stderr })) : resolve(stdout)));
});

let available;
export async function hwpAvailable() {
  if (available !== undefined) return available;
  if (process.platform !== 'win32') return (available = false);
  try { await run('reg', ['query', 'HKCR\\HWPFrame.HwpObject']); available = true; } catch { available = false; }
  return available;
}

// 한글 프로그램은 동시에 여러 변환을 못 하므로 한 번에 하나씩 처리
let queue = Promise.resolve();
// fmt: 'hwp' | 'pdf'
export function convertDocx(docxBuf, fmt = 'hwp') {
  const job = queue.then(async () => {
    if (!(await hwpAvailable())) {
      throw Object.assign(new Error(`이 컴퓨터에 한글(한컴오피스)이 없어 ${fmt.toUpperCase()}로 저장할 수 없습니다. Word(.docx)로 받아 주세요.`), { status: 400 });
    }
    // 한글 자동화는 한글 경로를 잘 못 읽으므로 영문 임시 폴더 사용
    const dir = path.join(os.tmpdir(), 'consultant-hwp');
    fs.mkdirSync(dir, { recursive: true });
    const id = crypto.randomUUID();
    const src = path.join(dir, `${id}.docx`);
    const dst = path.join(dir, `${id}.${fmt}`);
    fs.writeFileSync(src, docxBuf);
    try {
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, src, dst, fmt.toUpperCase()], { timeout: 90_000 });
      if (!fs.existsSync(dst)) throw new Error('no output');
      return fs.readFileSync(dst);
    } catch (e) {
      const F = fmt.toUpperCase();
      console.error(`${F} 변환 실패:`, e.stderr || e.message);
      throw new Error(e.killed ? `${F} 변환 시간이 초과되었습니다. 한글 프로그램에 확인 창이 떠 있는지 확인해 주세요.` : `${F} 변환에 실패했습니다. 한글 프로그램을 모두 닫고 다시 시도해 주세요.`);
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(dst, { force: true });
    }
  });
  queue = job.catch(() => {});
  return job;
}
