// 외부 공개 모드: Cloudflare 무료 임시 터널로 이 PC의 앱에 인터넷 주소를 붙인다.
// tools/cloudflared.exe 가 필요하다. 주소(https://xxxx.trycloudflare.com)는 켤 때마다 바뀐다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
let publicUrl = '';
export const getPublicUrl = () => publicUrl;

export function startTunnel(port) {
  if (!fs.existsSync(EXE)) {
    console.error(`터널 프로그램이 없습니다: ${EXE}`);
    return;
  }
  // http2: QUIC(UDP)이 막힌 사무실·공유기에서도 연결되도록 TCP 443으로 접속
  const child = spawn(EXE, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${port}`], { windowsHide: true });
  let candidate = '';
  const onData = (buf) => {
    const text = buf.toString();
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) candidate = m[0];
    // 주소는 먼저 발급되고, 실제 연결이 등록된 뒤에야 접속된다
    if (candidate && !publicUrl && /Registered tunnel connection/i.test(text)) {
      publicUrl = candidate;
      const line = '='.repeat(64);
      console.log(`\n${line}\n  외부 접속 주소:  ${publicUrl}\n  (휴대폰·다른 PC에서 이 주소로 접속 → 로그인 비밀번호 입력)\n${line}\n`);
    }
    for (const l of text.split('\n')) if (/\bERR\b/.test(l)) console.error(`[터널] ${l.trim()}`);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    publicUrl = '';
    console.error(`터널이 종료되었습니다 (코드 ${code}). 창을 닫고 start-public.bat을 다시 실행해 주세요.`);
  });
  // 앱 서버가 꺼지면 터널도 함께 끈다
  const stop = () => { try { child.kill(); } catch { /* 이미 종료 */ } };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(0); });
}
