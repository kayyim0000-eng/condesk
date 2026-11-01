import { useEffect, useState } from 'react';
import { Upload, Loader2, Trash2, Save } from 'lucide-react';
import { api } from '../api.js';
import { useSchema, PageHeader, Modal } from '../App.jsx';
import { TemplatePreview } from './ReportEditor.jsx';

export default function Templates() {
  const { parts } = useSchema();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null); // 새로 분석했거나 편집 중인 양식
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hiddenCount, setHiddenCount] = useState(0);
  const load = () => Promise.all([api.get('/api/templates'), api.get('/api/templates/hidden')]).then(([l, h]) => {
    setList(l);
    setHiddenCount(h.length);
    setSel((s) => l.find((t) => t.id === s?.id) || l[0]);
  });
  async function remove(t) {
    const msg = t.builtin
      ? `기본 제공 양식 '${t.name}'을(를) 목록에서 삭제할까요?\n(나중에 '삭제한 양식 복원'으로 되살릴 수 있습니다)`
      : `'${t.name}' 양식을 삭제할까요?\n(이 양식으로 이미 쓴 보고서는 그대로 열립니다)`;
    if (!confirm(msg)) return;
    await api.del(`/api/templates/${t.id}`);
    setSel(null);
    load();
  }
  useEffect(() => { load(); }, []);

  async function analyze(file) {
    if (!file) return;
    setBusy(true); setError('');
    try { setDraft({ def: await api.upload('/api/templates/analyze', file), isNew: true }); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="보고서 양식" desc="기관별 보고서 양식. 새 기관 양식(HWP·DOCX·PDF)을 올리면 AI가 칸과 배치를 분석해 등록합니다">
        <label className={`btn-primary cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{busy ? '양식 분석 중…' : '양식 파일 올리기 (AI 분석)'}
          <input type="file" className="hidden" accept=".hwp,.hwpx,.docx,.pdf,.txt" onChange={(e) => { analyze(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </PageHeader>
      {error && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <ul className="lg:col-span-4 space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <button onClick={() => setSel(t)} className={`card w-full text-left p-4 hover:border-brand-500 ${sel?.id === t.id ? 'border-brand-600 ring-2 ring-brand-100' : ''}`}>
                <div className="font-medium text-slate-800">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.org} · 칸 {t.fields.length}개 {t.builtin ? '' : '· 추가 양식'}</div>
              </button>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li>
              <button className="btn-ghost text-xs w-full" onClick={async () => { await api.post('/api/templates/restore'); load(); }}>
                삭제한 양식 복원 ({hiddenCount}개)
              </button>
            </li>
          )}
        </ul>
        {sel && (
          <div className="lg:col-span-8 card p-5">
            <div className="flex flex-wrap items-start gap-2 mb-2">
              <div className="flex-1">
                <h2 className="font-semibold text-lg">{sel.name}</h2>
                <p className="text-sm text-slate-500">{sel.description}</p>
              </div>
              <button className="btn-danger" onClick={() => remove(sel)}><Trash2 size={15} />삭제</button>
            </div>
            {sel.guide && <p className="text-sm bg-brand-50 text-brand-900 rounded-lg px-3 py-2 mb-3">작성 지침: {sel.guide}</p>}
            <h3 className="text-sm font-semibold mt-4 mb-2">칸 구성 (기본 3단 구성과의 대응)</h3>
            <div className="flex flex-wrap gap-1.5">
              {sel.fields.map((f) => (
                <span key={f.key} className={`chip ${f.kind === 'info' ? 'bg-slate-100 text-slate-600' : f.part === 1 ? 'bg-sky-50 text-sky-800' : f.part === 2 ? 'bg-indigo-50 text-indigo-800' : 'bg-teal-50 text-teal-800'}`}>
                  {f.label}{f.part ? ` · ${f.part}` : ''}{f.min ? ` · ${f.min}자↑` : ''}{f.max ? ` · ${f.max}자↓` : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">1 {parts[1]} · 2 {parts[2]} · 3 {parts[3]} · 회색은 기본정보 칸</p>
            <TemplatePreview tpl={sel} values={{}} input={{}} />
          </div>
        )}
      </div>

      {draft && <TemplateDraft draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />}    </div>
  );
}

function TemplateDraft({ draft, onClose, onSaved }) {
  const [json, setJson] = useState(() => JSON.stringify(draft.def, null, 2));
  const [err, setErr] = useState('');
  let parsed = null;
  try { parsed = JSON.parse(json); } catch { /* 편집 중 */ }

  async function save() {
    if (!parsed) { setErr('JSON 형식이 올바르지 않습니다.'); return; }
    try {
      if (draft.isNew) await api.post('/api/templates', parsed);
      else await api.put(`/api/templates/${draft.def.id}`, parsed);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title={draft.isNew ? '양식 등록 — 분석 결과 확인' : '양식 수정'} onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3">미리보기를 확인하고, 필요하면 오른쪽 정의(JSON)에서 칸 이름·작성 지침·글자수 조건(min/max)을 고친 뒤 저장하세요.</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="max-h-[65vh] overflow-y-auto">{parsed ? <TemplatePreview tpl={parsed} values={{}} input={{}} /> : <p className="text-rose-600 text-sm">JSON 오류 — 미리보기를 표시할 수 없습니다.</p>}</div>
        <textarea className="input font-mono !text-xs h-[65vh]" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
      </div>
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>취소</button>
        <button className="btn-primary" onClick={save}><Save size={15} />저장</button>
      </div>
    </Modal>
  );
}
