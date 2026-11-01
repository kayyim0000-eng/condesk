async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  // 로그인이 풀렸으면 화면을 로그인 창으로 돌린다
  if (res.status === 401 && data.auth) window.dispatchEvent(new Event('auth-required'));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, file, extra = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return request('POST', u, fd);
  },
};

// 사진을 긴 변 maxPx 이하 JPEG로 줄인다 (용량 절약 + 휴대폰 사진 회전 정보 반영)
export async function shrinkImage(file, maxPx = 1600) {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error(`이 사진 형식은 열 수 없습니다: ${file.name} (JPG·PNG로 저장해서 올려 주세요. 아이폰 HEIC는 지원하지 않습니다)`);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// 보고서 파일(hwp/pdf/docx)을 받아 저장. 실패하면 서버의 오류 문구로 예외를 던진다.
export const downloadReport = (id, fmt) => downloadFile(`/api/reports/${id}/${fmt}`, `보고서.${fmt}`);

// 서버가 내려준 파일을 받아 저장. 파일명은 서버의 Content-Disposition을 따른다.
export async function downloadFile(url, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `다운로드 실패 (${res.status})`);
  const name = decodeURIComponent((res.headers.get('Content-Disposition') || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || fallbackName);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const won =(n) => (n == null || n === '' ? '' : `${Math.round(Number(n)).toLocaleString('ko-KR')}`);
export const manwon = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
};

// 색약 검증을 통과한 범주 색 (고정 순서: 컨설팅·강의·심사·기타)
export const CAT_COLORS = { 컨설팅: '#2a78d6', 강의: '#eb6834', 심사: '#1baf7a', 기타: '#eda100', 지원사업: '#6250d6' };
export const CAT_CHIP = {
  컨설팅: 'bg-blue-50 text-blue-700', 강의: 'bg-orange-50 text-orange-700', 심사: 'bg-emerald-50 text-emerald-700',
  기타: 'bg-amber-50 text-amber-800', 지원사업: 'bg-violet-50 text-violet-700',
  온라인: 'bg-sky-50 text-sky-700', 오프라인: 'bg-slate-100 text-slate-700',
};

export function dday(date, today = new Date().toISOString().slice(0, 10)) {
  if (!date) return '';
  const d = Math.round((new Date(date) - new Date(today)) / 864e5);
  return d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`;
}
