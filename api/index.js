// Vercel Function: /api/* 요청을 ConDesk API(Express)로 처리한다.
// 데이터는 Supabase(Postgres + Storage)에 저장된다 — 환경변수 DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD
import app from '../server/app.js';

export default app;
