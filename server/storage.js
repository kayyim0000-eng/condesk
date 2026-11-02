// 업로드 파일(사진·PDF) 저장소
// - SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 있으면 Supabase Storage (비공개 버킷) — Vercel 배포용
// - 없으면 data/uploads 폴더 — 로컬 실행용
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
export const REMOTE_STORAGE = Boolean(SB_URL && SB_KEY);
const LOCAL = path.join(DATA_DIR, 'uploads');
const safe = (name) => path.basename(String(name || ''));

let client;
let bucketReady;
async function sb() {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  // 버킷이 없으면 비공개로 만든다 (이미 있으면 그대로)
  if (!bucketReady) {
    bucketReady = client.storage.createBucket(BUCKET, { public: false }).then(({ error }) => {
      if (error && !/exist/i.test(error.message)) console.warn(`[storage] 버킷 준비 실패: ${error.message}`);
    });
  }
  await bucketReady;
  return client;
}

export async function putFile(name, buf, contentType = 'application/octet-stream') {
  if (!REMOTE_STORAGE) {
    fs.writeFileSync(path.join(LOCAL, safe(name)), buf);
    return;
  }
  const { error } = await (await sb()).storage.from(BUCKET).upload(safe(name), buf, { contentType, upsert: true });
  if (error) throw new Error(`파일 저장 실패: ${error.message}`);
}

// 없으면 null
export async function getFile(name) {
  if (!REMOTE_STORAGE) {
    const p = path.join(LOCAL, safe(name));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  const { data, error } = await (await sb()).storage.from(BUCKET).download(safe(name));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
