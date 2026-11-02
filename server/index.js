// 로컬 실행용 서버 (start.bat / start-funnel.bat / start-public.bat). API 본체는 app.js
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { app } from './app.js';
import { authEnabled } from './auth.js';
import { startTunnel } from './tunnel.js';

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

app.listen(PORT, HOST, () => {
  console.log(`컨데스크(ConDesk): http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}${authEnabled() ? ' (로그인 사용)' : ''}`);
  if (TUNNEL) startTunnel(PORT);
});
