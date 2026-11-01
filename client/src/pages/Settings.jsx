import { useEffect, useState } from 'react';
import { Save, Upload, Loader2, Download } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { PageHeader } from '../App.jsx';

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [replace, setReplace] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  useEffect(() => {
    api.get('/api/settings').then(setS);
    api.get('/api/public-url').then((r) => setPublicUrl(r.url)).catch(() => {});
  }, []);
  if (!s) return null;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const engine = s.ai_provider || 'gemini';

  async function save() {
    await api.put('/api/settings', s);
    setS(await api.get('/api/settings'));
    setMsg('저장했습니다.');
    setTimeout(() => setMsg(''), 2000);
  }
  async function importXlsx(file) {
    if (!file) return;
    if (replace && !confirm('기존 관리 데이터(업무·매출·교육·자격증·공고·계정)를 모두 지우고 엑셀 내용으로 바꿉니다. 계속할까요?')) return;
    setImporting(true);
    try {
      const c = await api.upload('/api/import', file, { replace: String(replace) });
      alert(`가져오기 완료\n${Object.entries(c).map(([k, v]) => `${k}: ${v}건`).join('\n') || '가져온 항목 없음'}`);
    } catch (e) { alert(e.message); } finally { setImporting(false); }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="설정" desc="AI 연결, 내 프로필, 데이터 가져오기">
        {msg && <span className="text-sm text-emerald-700 self-center">{msg}</span>}
        <button className="btn-primary" onClick={save}><Save size={16} />저장</button>
      </PageHeader>

      {publicUrl && (
        <section className="card p-5 mb-4 border-brand-300 bg-brand-50/40">
          <h2 className="font-semibold">외부 접속 주소 <span className="chip bg-emerald-50 text-emerald-700 ml-1">공개 중</span></h2>
          <p className="text-sm text-slate-500 mt-1">휴대폰·다른 PC에서 이 주소로 들어와 로그인하면 됩니다. 이 PC와 실행 창이 켜져 있는 동안만 열리고, 다시 실행하면 주소가 바뀝니다.</p>
          <div className="flex gap-2 mt-3">
            <input className="input font-mono" readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-outline shrink-0" onClick={() => navigator.clipboard.writeText(publicUrl)}>복사</button>
          </div>
        </section>
      )}

      <section className="card p-5 mb-4 space-y-4">
        <h2 className="font-semibold">AI 엔진</h2>
        <p className="text-sm text-slate-500">보고서 작성·명함/사업자등록증 읽기·양식 분석에 쓸 AI를 고르세요. 고른 엔진의 키만 있으면 됩니다.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['gemini', 'Google Gemini', '무료 등급 있음 · 음성 파일 받아쓰기도 함께 처리'],
            ['anthropic', 'Claude (Anthropic)', '유료 · 보고서 문장 품질 우수'],
          ].map(([v, l, d]) => (
            <label key={v} className={`rounded-lg border p-3 cursor-pointer ${engine === v ? 'border-brand-600 ring-2 ring-brand-100 bg-brand-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 font-medium text-sm">
                <input type="radio" name="engine" checked={engine === v} onChange={() => setS({ ...s, ai_provider: v })} />{l}
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-5">{d}</p>
            </label>
          ))}
        </div>
      </section>

      <section className={`card p-5 mb-4 space-y-4 ${engine === 'gemini' ? '' : 'opacity-70'}`}>
        <h2 className="font-semibold">Google Gemini {engine === 'gemini' && <span className="chip bg-brand-50 text-brand-700 ml-1">사용 중</span>}</h2>
        <Field label="Gemini API 키" hint="aistudio.google.com → Get API key 에서 무료로 발급. 이 컴퓨터의 앱 DB에만 저장됩니다.">
          <input className="input font-mono" value={s.gemini_api_key} onChange={set('gemini_api_key')} placeholder="AIza..." />
        </Field>
        <Field label="모델" hint="기본값 gemini-flash-latest (무료 등급에서 사용 가능한 최신 Flash 모델)">
          <input className="input" value={s.gemini_model} onChange={set('gemini_model')} placeholder="gemini-flash-latest" />
        </Field>
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">무료 등급에서는 보낸 내용(상담 메모·고객 정보 등)이 구글의 서비스 개선에 쓰일 수 있습니다. 비밀유지가 중요한 보고서는 유료 결제를 켜거나 Claude를 사용하세요.</p>
      </section>

      <section className={`card p-5 mb-4 space-y-4 ${engine === 'anthropic' ? '' : 'opacity-70'}`}>
        <h2 className="font-semibold">Claude (Anthropic) {engine === 'anthropic' && <span className="chip bg-brand-50 text-brand-700 ml-1">사용 중</span>}</h2>
        <Field label="Anthropic API 키" hint={s.anthropic_env ? '환경변수 ANTHROPIC_API_KEY가 설정되어 있어 비워 두어도 됩니다.' : 'console.anthropic.com에서 발급. 이 컴퓨터의 앱 DB에만 저장됩니다.'}>
          <input className="input font-mono" value={s.anthropic_api_key} onChange={set('anthropic_api_key')} placeholder="sk-ant-..." />
        </Field>
        <Field label="모델" hint="기본값 claude-opus-5-5 (최고 품질). 비용을 줄이려면 claude-sonnet-5-5">
          <select className="input" value={s.model || 'claude-opus-5-5'} onChange={set('model')}>
            <option value="claude-opus-5-5">claude-opus-5-5 (권장)</option>
            <option value="claude-sonnet-5-5">claude-sonnet-5-5 (빠르고 저렴)</option>
          </select>
        </Field>
      </section>

      <section className="card p-5 mb-4 space-y-4">
        <h2 className="font-semibold">음성 파일 → 텍스트 변환 (선택)</h2>
        <p className="text-sm text-slate-500">Gemini 키가 있으면 음성 파일도 Gemini로 받아씁니다(200MB까지). 아래 OpenAI Whisper 키를 넣으면 그쪽을 우선 사용합니다(25MB까지).</p>
        <Field label="음성인식 API 키"><input className="input font-mono" value={s.stt_api_key} onChange={set('stt_api_key')} placeholder="sk-..." /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="API 주소" hint="기본: https://api.openai.com/v1"><input className="input" value={s.stt_base_url} onChange={set('stt_base_url')} placeholder="https://api.openai.com/v1" /></Field>
          <Field label="모델" hint="기본: whisper-1"><input className="input" value={s.stt_model} onChange={set('stt_model')} placeholder="whisper-1" /></Field>
        </div>
      </section>

      <section className="card p-5 mb-4 space-y-4">
        <h2 className="font-semibold">내 프로필 (보고서 기본값)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="멘토/컨설턴트 이름"><input className="input" value={s.mentor} onChange={set('mentor')} /></Field>
          <Field label="소속"><input className="input" value={s.mentor_org} onChange={set('mentor_org')} /></Field>
          <Field label="전문 분야"><input className="input" value={s.field} onChange={set('field')} placeholder="마케팅, 사업계획서" /></Field>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold">엑셀에서 가져오기</h2>
        <p className="text-sm text-slate-500">‘프로젝트 관리시트.xlsx’의 매출관리·실적관리·강의실적·심사실적·교육이력관리·지원실적·계정관리 시트를 읽어 옵니다.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />기존 데이터를 지우고 가져오기</label>
        <label className={`btn-outline cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
          {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}엑셀 파일 선택
          <input type="file" className="hidden" accept=".xlsx" onChange={(e) => { importXlsx(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </section>

      <section className="card p-5 space-y-3 mt-4">
        <h2 className="font-semibold">엑셀로 내보내기</h2>
        <p className="text-sm text-slate-500">업무 이력·매출·교육 이력·자격증·공고·가입 사이트를 시트별로 나눠 한 파일로 받습니다. 백업용으로도 쓸 수 있습니다.</p>
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">가입 사이트·교육 이력의 비밀번호도 함께 들어갑니다. 받은 파일은 다른 사람과 공유하지 마세요.</p>
        <button className="btn-outline" disabled={exporting} onClick={async () => {
          setExporting(true);
          try { await downloadFile('/api/export/xlsx', 'ConDesk_전체데이터.xlsx'); } catch (e) { alert(e.message); } finally { setExporting(false); }
        }}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}전체 데이터 엑셀 다운로드</button>
      </section>
    </div>
  );
}
