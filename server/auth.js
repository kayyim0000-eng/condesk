// 비밀번호 로그인 (1인용)
// - 환경변수 APP_PASSWORD 또는 data/app_password.txt(외부 공개 실행 때 만들어짐)가 있으면 로그인을 요구한다.
// - 둘 다 없으면 로그인 없이 동작한다 (이 PC에서만 접속되는 로컬 실행용).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const PW_FILE = path.join(DATA_DIR, 'app_password.txt');
const PASSWORD = process.env.APP_PASSWORD
  || (fs.existsSync(PW_FILE) ? fs.readFileSync(PW_FILE, 'utf8').replace(/^﻿/, '').trim() : '');
const SECRET = process.env.SESSION_SECRET || PASSWORD;
const COOKIE = 'condesk_session';
const MAX_AGE = 30 * 24 * 3600; // 30일

export const authEnabled = () => Boolean(PASSWORD);

const sign = (exp) => crypto.createHmac('sha256', SECRET).update(`condesk:${exp}`).digest('base64url');
const makeToken = () => {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${exp}.${sign(exp)}`;
};
function validToken(token = '') {
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const readCookie = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)))[COOKIE];
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

export function mountAuth(app) {
  app.get('/api/session', (req, res) => res.json({ required: authEnabled(), ok: !authEnabled() || validToken(readCookie(req)) }));

  app.post('/api/login', async (req, res) => {
    if (!authEnabled()) return res.json({ ok: true });
    if (!sameText(req.body?.password ?? '', PASSWORD)) {
      await new Promise((r) => setTimeout(r, 800)); // 무차별 대입 속도 늦추기
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  // 위 세 경로를 뺀 모든 /api 요청은 로그인 필요
  app.use('/api', (req, res, next) => {
    if (!authEnabled() || validToken(readCookie(req))) return next();
    res.status(401).json({ error: '로그인이 필요합니다.', auth: true });
  });
}
