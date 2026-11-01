import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles, Save, Download, FileText, Mic, MicOff, Upload, StickyNote, Video, FileAudio, Trash2, ChevronDown, ChevronUp,
  Copy, Check, Wand2, Loader2, ClipboardList, Eye, Layers, Image as ImageIcon, IdCard, FileBadge, LayoutTemplate, FolderOpen,
} from 'lucide-react';
import { api, downloadReport, shrinkImage } from '../api.js';
import { useSchema, PageHeader } from '../App.jsx';

const SRC_META = {
  text: { label: '메모', icon: StickyNote },
  zoom: { label: '줌 노트', icon: Video },
  audio: { label: '음성 녹취', icon: FileAudio },
  mic: { label: '받아쓰기', icon: Mic },
  doc: { label: '첨부 문서', icon: FileText },
  pdf: { label: '첨부 PDF', icon: FileText },
  photo: { label: '사진', icon: ImageIcon },
};
// 문서에서 읽어 채울 수 있는 기본정보 칸 (서버 extractBasicInfo의 항목과 같다)
const INFO_KEYS = ['company', 'ceo', 'mentee_position', 'biz_no', 'phone', 'biz_phone', 'industry', 'item', 'open_date', 'address',
  'session_date', 'start_time', 'end_time', 'place', 'method', 'round', 'period', 'field', 'gubun'];
const DOC_ACCEPT = '.hwp,.hwpx,.docx,.xlsx,.pdf,.txt,.csv,image/jpeg,image/png';
const DATE_KEYS = ['session_date', 'open_date'];
const TIME_KEYS = ['start_time', 'end_time'];
const ALWAYS_KEYS = ['company', 'ceo', 'industry', 'item', 'session_date', 'start_time', 'end_time', 'place', 'method', 'mentor'];

const usedKeys = (tpl) => [...new Set((tpl?.fields || []).flatMap((f) => [...(f.from || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1])))];

export default function ReportEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { inputKeys, parts, hwp } = useSchema();
  const [templates, setTemplates] = useState([]);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState('fields');
  const [saved, setSaved] = useState(true);
  const [fillMsg, setFillMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const resultRef = useRef();

  useEffect(() => {
    const listP = api.get('/api/templates');
    // 삭제(숨김)된 양식으로 쓴 보고서도 열리도록, 목록에 없으면 그 양식만 따로 불러와 붙인다
    const withCurrent = async (r) => {
      const list = await listP;
      if (r.template_id && !list.some((t) => t.id === r.template_id)) {
        const t = await api.get(`/api/templates/${r.template_id}`).catch(() => null);
        if (t) list.push({ ...t, deleted: true });
      }
      setTemplates([...list]);
      setRep(r);
    };
    if (id) api.get(`/api/reports/${id}`).then(withCurrent);
    else Promise.all([listP, api.get('/api/settings')]).then(([list, s]) => withCurrent({
      template_id: list[0]?.id, status: '작성중', sources: [], result: null,
      input: { mentor: s.mentor, mentor_org: s.mentor_org, field: s.field, session_date: new Date().toISOString().slice(0, 10), method: '대면' },
    }));
  }, [id]);

  const tpl = templates.find((t) => t.id === rep?.template_id);
  const keys = useMemo(() => {
    const used = usedKeys(tpl);
    const base = [...new Set([...used, ...ALWAYS_KEYS.filter((k) => !tpl || used.length === 0 || used.includes(k))])];
    return showAll ? Object.keys(inputKeys) : Object.keys(inputKeys).filter((k) => base.includes(k));
  }, [tpl, showAll, inputKeys]);

  if (!rep || !templates.length) return <div className="text-slate-400">불러오는 중…</div>;

  const update = (patch) => { setRep((r) => ({ ...r, ...patch })); setSaved(false); };
  const setInput = (k, v) => update({ input: { ...rep.input, [k]: v } });
  const setField = (k, v) => update({ result: { ...rep.result, fields: { ...rep.result.fields, [k]: v } } });
  // 여러 파일이 연달아 추가될 수 있으므로 최신 상태 기준으로 덧붙인다
  const addSource = (s) => { setRep((r) => ({ ...r, sources: [...r.sources, { enabled: true, ...s }] })); setSaved(false); };
  const photos = rep.sources.filter((s) => s.type === 'photo' && s.enabled !== false);

  // 명함·사업자등록증·문서 파일에서 읽은 값으로 비어 있는 기본정보 칸만 채운다
  const fillFromDoc = (kind, file) => file && run(kind, async () => {
    setFillMsg('');
    const info = await api.upload('/api/extract-info', await shrinkImage(file, 2000), { kind });
    const filled = []; const kept = [];
    const next = { ...rep.input };
    const today = new Date().toISOString().slice(0, 10);
    for (const k of INFO_KEYS) {
      const v = (info[k] || '').trim();
      if (!v) continue;
      // 새 보고서에 자동으로 넣어 둔 오늘 날짜는 문서의 상담일로 바꿔도 된다
      const placeholder = k === 'session_date' && next[k] === today;
      if (next[k] && next[k] !== v && !placeholder) { kept.push(inputKeys[k]); continue; }
      if (!next[k] || placeholder) { next[k] = v; filled.push(inputKeys[k]); }
    }
    update({ input: next });
    if (filled.some((l) => !keys.includes(Object.keys(inputKeys).find((k) => inputKeys[k] === l)))) setShowAll(true);
    setFillMsg(filled.length
      ? `${file.name} (${info.doc_type})에서 ${filled.join(', ')} 항목을 채웠습니다.${kept.length ? ` 이미 입력된 ${kept.join(', ')}은(는) 그대로 두었습니다.` : ''}`
      : `${file.name}에서 새로 채울 항목을 찾지 못했습니다.${kept.length ? ` (이미 입력됨: ${kept.join(', ')})` : ''}`);
  });

  async function save(r = rep) {
    const body = { ...r };
    const out = r.id ? await api.put(`/api/reports/${r.id}`, body) : await api.post('/api/reports', body);
    setRep(out);
    setSaved(true);
    if (!r.id) nav(`/reports/${out.id}`, { replace: true });
    return out;
  }
  async function run(label, fn) {
    setBusy(label); setError('');
    try { return await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  const generate = () => run('generate', async () => {
    const s = await save();
    const result = await api.post(`/api/reports/${s.id}/generate`);
    setRep({ ...s, result });
    setTab('fields');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  });
  // 양식 칸 순서대로 "칸 이름 + 내용"을 이어 붙인 텍스트 (한글 등에 붙여넣기용)
  const allText = () => (tpl?.fields || []).map((f) => {
    const v = rep.result?.fields?.[f.key];
    const t = f.type === 'check' ? (f.options || []).map((o) => `${(v || []).includes(o) ? '☑' : '☐'} ${o}`).join('  ') : v || '';
    return `[${f.label}]\n${t}`;
  }).join('\n\n');
  const copyAll = async () => {
    await navigator.clipboard.writeText(allText());
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };
  const downloadTxt = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${tpl?.name || ''}\n\n${allText()}`], { type: 'text/plain;charset=utf-8' }));
    a.download = `${tpl?.name || '보고서'}_${rep.input.company || ''}_${rep.input.session_date || ''}.txt`.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // fmt: 'hwp' (설치된 한글로 변환, 몇 초 걸림) | 'docx'
  const download = (fmt) => run(fmt, async () => {
    const s = await save();
    await downloadReport(s.id, fmt);
  });
  const register = () => run('register', async () => {
    const s = await save();
    const hours = prompt('업무 이력에 등록합니다. 투입 시간(H)을 입력하세요 (비워도 됨)', '');
    if (hours === null) return;
    await api.post(`/api/reports/${s.id}/register`, { hours: hours ? Number(hours) : null });
    alert('업무 이력에 등록했습니다.');
  });

  return (
    <div>
      <PageHeader title={rep.id ? rep.title : '새 컨설팅 보고서'} desc={tpl?.name}>
        <select className="input w-auto" value={rep.status} onChange={(e) => update({ status: e.target.value })}>
          <option>작성중</option><option>검토완료</option><option>제출완료</option>
        </select>
        <button className="btn-outline" onClick={() => run('save', () => save())} disabled={!!busy}>
          {saved && rep.id ? <Check size={16} /> : <Save size={16} />}{saved && rep.id ? '저장됨' : '저장'}
        </button>
        {rep.result && <button className="btn-outline" onClick={register} disabled={!!busy}><ClipboardList size={16} />업무 이력 등록</button>}
        {rep.result && (() => {
          const fmt = hwp ? 'hwp' : 'docx';
          return <button className="btn-primary" onClick={() => download(fmt)} disabled={!!busy}>{busy === fmt ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{hwp ? '한글(.hwp)' : 'Word(.docx)'} 다운로드</button>;
        })()}
      </PageHeader>

      {error && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}

      <div className="grid xl:grid-cols-12 gap-5 items-start">
        {/* ── 기본 데이터 입력 ── */}
        <div className="xl:col-span-5 space-y-4">
          <section className="card p-5">
            <Step n={1} title="보고서 양식" />
            <div className="flex gap-2">
              <select className="input" value={rep.template_id} onChange={(e) => update({ template_id: e.target.value })}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.deleted ? ' (삭제된 양식)' : t.builtin ? '' : ' (추가 양식)'}</option>)}
              </select>
              <Link to="/templates" className="btn-outline shrink-0" title="양식 관리 (새 양식 올리기·삭제)"><LayoutTemplate size={15} />양식 관리</Link>
            </div>
            {tpl && <p className="text-xs text-slate-500 mt-2">{tpl.description}</p>}
            {rep.result && <p className="text-xs text-amber-700 mt-2">양식을 바꾼 뒤에는 ‘AI 보고서 생성’을 다시 눌러 주세요.</p>}
          </section>

          <section className={`card p-5 ${dragOver ? 'ring-2 ring-brand-500 bg-brand-50/40' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); fillFromDoc('file', e.dataTransfer.files[0]); }}>
            <Step n={2} title="기본 정보" desc="내 폴더의 신청서·사업계획서·명단 엑셀·명함·사업자등록증 등을 올리거나 여기에 끌어다 놓으면 빈칸을 자동으로 채웁니다" />
            <div className="flex flex-wrap gap-2 mb-3">
              {[['file', '파일에서 채우기', FolderOpen, DOC_ACCEPT], ['card', '명함', IdCard, 'image/*,.pdf'], ['bizreg', '사업자등록증', FileBadge, 'image/*,.pdf']].map(([kind, label, I, accept]) => (
                <label key={kind} className={`${kind === 'file' ? 'btn-primary' : 'btn-outline'} cursor-pointer !py-1.5 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                  {busy === kind ? <Loader2 size={15} className="animate-spin" /> : <I size={15} />}{busy === kind ? '읽는 중…' : label}
                  <input type="file" className="hidden" accept={accept} onChange={(e) => { fillFromDoc(kind, e.target.files[0]); e.target.value = ''; }} />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 -mt-1 mb-3">HWP·HWPX·DOCX·XLSX·PDF·TXT·사진 지원 · 비어 있는 칸만 채우고 이미 입력한 값은 바꾸지 않습니다</p>
            {fillMsg && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{fillMsg}</p>}
            <div className="grid grid-cols-2 gap-3">
              {keys.map((k) => (
                <div key={k} className={k === 'company' || k === 'item' || k === 'period' ? 'col-span-2 sm:col-span-1' : ''}>
                  <label className="label">{inputKeys[k]}</label>
                  <input className="input" type={DATE_KEYS.includes(k) ? 'date' : TIME_KEYS.includes(k) ? 'time' : 'text'}
                    value={rep.input[k] || ''} onChange={(e) => setInput(k, e.target.value)}
                    placeholder={k === 'method' ? '대면 / 비대면(줌) / 전화' : k === 'period' ? '2026.10.01 ~ 2026.11.30' : ''} />
                </div>
              ))}
            </div>
            <button className="btn-ghost mt-3 text-xs" onClick={() => setShowAll(!showAll)}>
              {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showAll ? '이 양식에 필요한 항목만' : '모든 항목 보기'}
            </button>
          </section>

          <section className="card p-5">
            <Step n={3} title="원자료" desc="상담 메모·줌 노트·음성·첨부 문서·사진을 여러 개 넣을 수 있습니다. 사진은 보고서 사진 칸에 들어갑니다" />
            <SourceInput onAdd={addSource} onError={setError} />
            <SourceList sources={rep.sources} onChange={(sources) => update({ sources })} />
          </section>

          <section className="card p-5">
            <Step n={4} title="추가 지시 (선택)" />
            <textarea className="input" rows={3} value={rep.input.notes || ''} onChange={(e) => setInput('notes', e.target.value)}
              placeholder="예: 정부지원사업 신청 준비에 초점. 실행과제는 3개월 일정으로. 대표님 표현을 존중해서 부드럽게." />
            <button className="btn-accent w-full mt-4 py-3 text-base" onClick={generate} disabled={!!busy}>
              {busy === 'generate' ? <><Loader2 size={18} className="animate-spin" />작성 중… (1~2분 소요)</> : <><Sparkles size={18} />AI 보고서 생성</>}
            </button>
            {error && (
              <div className="mt-3 rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                {error}
                {/API 키/.test(error) && <Link to="/settings" className="block mt-1 font-medium underline">설정 화면으로 이동 →</Link>}
              </div>
            )}
          </section>
        </div>

        {/* ── 결과 ── */}
        <div className="xl:col-span-7 xl:sticky xl:top-6">
          {!rep.result ? (
            <div className="card p-10 text-center text-slate-500">
              <Sparkles size={32} className="mx-auto text-brand-500 mb-3" />
              <p className="font-medium text-slate-700">기본 데이터를 넣고 ‘AI 보고서 생성’을 누르세요</p>
              <p className="text-sm mt-2 leading-relaxed">먼저 기본 3단 구성(①기업정보 및 진단 ②컨설팅 진행내용 ③실행과제 및 개선방향)으로<br />원고를 쓴 뒤, 선택한 기관 양식의 칸에 맞게 나누어 넣습니다.</p>
              {tpl && <TemplatePreview tpl={tpl} values={{}} input={rep.input} photos={photos} />}
            </div>
          ) : (
            <div className="card" ref={resultRef}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-emerald-50 border-b border-emerald-100 rounded-t-xl">
                <Check size={16} className="text-emerald-600" />
                <span className="text-sm text-emerald-800 font-medium mr-auto">보고서가 작성되었습니다{rep.result.generated_at ? ` · ${new Date(rep.result.generated_at).toLocaleString('ko-KR')}` : ''}</span>
                <button className="btn-outline !py-1.5" onClick={copyAll}>{copiedAll ? <Check size={15} /> : <Copy size={15} />}전체 복사</button>
                <button className="btn-outline !py-1.5" onClick={downloadTxt}><FileText size={15} />텍스트(.txt)</button>
                <button className={`${hwp ? 'btn-outline' : 'btn-primary'} !py-1.5`} onClick={() => download('docx')} disabled={!!busy}>
                  {busy === 'docx' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Word(.docx){hwp ? '' : ' 다운로드'}
                </button>
                {/* HWP·PDF는 한글이 설치된 PC에서 실행할 때만 */}
                {hwp && (
                  <>
                    <button className="btn-outline !py-1.5" onClick={() => download('pdf')} disabled={!!busy}>
                      {busy === 'pdf' ? <><Loader2 size={15} className="animate-spin" />PDF 변환 중…</> : <><Download size={15} />PDF</>}
                    </button>
                    <button className="btn-primary !py-1.5" onClick={() => download('hwp')} disabled={!!busy}>
                      {busy === 'hwp' ? <><Loader2 size={15} className="animate-spin" />HWP 변환 중…</> : <><Download size={15} />한글(.hwp) 다운로드</>}
                    </button>
                  </>
                )}
              </div>
              <div className="flex border-b border-slate-100 px-2">
                {[['fields', '칸별 편집', Layers], ['preview', '양식 미리보기', Eye], ['core', '3단 구성 원고', FileText]].map(([k, l, I]) => (
                  <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 -mb-px ${tab === k ? 'border-brand-600 text-brand-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><I size={15} />{l}</button>
                ))}
              </div>
              <div className="p-5 max-h-[calc(100vh-11rem)] overflow-y-auto">
                {tab === 'fields' && tpl && tpl.fields.map((f) => (
                  <FieldEditor key={f.key} f={f} parts={parts} value={rep.result.fields?.[f.key]} onChange={(v) => setField(f.key, v)}
                    onRewrite={async (instruction) => {
                      const s = await save();
                      const { text } = await api.post(`/api/reports/${s.id}/rewrite`, { field: f.key, current: rep.result.fields?.[f.key], instruction });
                      return text;
                    }} />
                ))}
                {tab === 'preview' && tpl && <TemplatePreview tpl={tpl} values={rep.result.fields || {}} input={rep.input} photos={photos} />}
                {tab === 'core' && [1, 2, 3].map((n) => (
                  <div key={n} className="mb-5">
                    <h3 className="font-semibold text-slate-800 mb-2">{n}. {parts[n]}</h3>
                    <textarea className="input" rows={10} value={rep.result.core?.[`part${n}`] || ''}
                      onChange={(e) => update({ result: { ...rep.result, core: { ...rep.result.core, [`part${n}`]: e.target.value } } })} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, desc }) {
  return (
    <div className="mb-3">
      <h2 className="font-semibold text-slate-800 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">{n}</span>{title}
      </h2>
      {desc && <p className="text-xs text-slate-500 mt-1 ml-7">{desc}</p>}
    </div>
  );
}

function SourceInput({ onAdd, onError }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(null);
  const fileRef = useRef();
  const finalRef = useRef('');

  async function uploadFiles(files) {
    if (!files.length) return;
    setBusy(true); onError('');
    try {
      for (const file of files) onAdd(await api.upload('/api/upload', mode === 'photo' ? await shrinkImage(file) : file));
    } catch (e) { onError(e.message); } finally { setBusy(false); fileRef.current.value = ''; }
  }
  function toggleMic() {
    if (rec) { rec.stop(); setRec(null); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onError('이 브라우저는 음성 받아쓰기를 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.'); return; }
    const r = new SR();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    finalRef.current = text;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += `${t.trim()}\n`; else interim += t;
      }
      setText(finalRef.current + interim);
    };
    r.onend = () => setRec(null);
    r.onerror = (e) => onError(`받아쓰기 오류: ${e.error}`);
    r.start();
    setRec(r);
  }
  const add = (type) => { if (!text.trim()) return; onAdd({ type, name: `${SRC_META[type].label} ${new Date().toLocaleString('ko-KR')}`, text }); setText(''); finalRef.current = ''; };

  const tabs = [['text', '텍스트 메모', StickyNote], ['zoom', '줌 노트 붙여넣기', Video], ['audio', '음성 파일', FileAudio], ['mic', '마이크 받아쓰기', Mic], ['doc', '문서 첨부', Upload], ['photo', '사진', ImageIcon]];
  const hint = {
    audio: 'mp3, m4a, wav, webm — 설정에 Gemini 키(무료)가 있으면 바로 받아씁니다',
    doc: 'HWP, HWPX, DOCX, PDF, TXT — 사업계획서·기존 자료 등',
    photo: 'JPG·PNG 여러 장 선택 가능 — 상담·사업장 사진이 보고서 사진 칸에 순서대로 들어갑니다',
  }[mode];
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-3">
        {tabs.map(([k, l, I]) => (
          <button key={k} onClick={() => setMode(k)} className={`chip !px-2.5 !py-1 gap-1 ${mode === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><I size={13} />{l}</button>
        ))}
      </div>
      {(mode === 'text' || mode === 'zoom' || mode === 'mic') && (
        <>
          <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'zoom' ? 'Zoom AI Companion 회의 요약이나 녹취록(.vtt 내용)을 그대로 붙여넣으세요.' : mode === 'mic' ? '아래 버튼을 누르고 말하면 여기에 받아써집니다.' : '상담 중 메모, 기업 현황, 논의 내용 등을 자유롭게 적으세요.'} />
          <div className="flex gap-2 mt-2">
            {mode === 'mic' && (
              <button className={rec ? 'btn bg-rose-600 text-white hover:bg-rose-700' : 'btn-outline'} onClick={toggleMic}>
                {rec ? <><MicOff size={15} />받아쓰기 중지</> : <><Mic size={15} />받아쓰기 시작</>}
              </button>
            )}
            <button className="btn-outline ml-auto" onClick={() => add(mode)} disabled={!text.trim()}>원자료로 추가</button>
          </div>
        </>
      )}
      {(mode === 'audio' || mode === 'doc' || mode === 'photo') && (
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg py-8 cursor-pointer hover:border-brand-500 hover:bg-brand-50/40 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          {busy ? <Loader2 className="animate-spin text-brand-600" /> : <Upload className="text-slate-400" />}
          <span className="text-sm text-slate-600">{busy ? { audio: '음성을 텍스트로 변환 중…', doc: '문서 읽는 중…', photo: '사진 올리는 중…' }[mode] : '클릭해서 파일 선택'}</span>
          <span className="text-xs text-slate-400 text-center px-4">{hint}</span>
          <input ref={fileRef} type="file" className="hidden" multiple={mode === 'photo'}
            accept={{ audio: 'audio/*,.m4a,.mp3,.wav,.webm,.mp4', doc: '.hwp,.hwpx,.docx,.pdf,.txt,.md,.vtt,.srt', photo: 'image/jpeg,image/png' }[mode]}
            onChange={(e) => uploadFiles([...e.target.files])} />
        </label>
      )}
    </div>
  );
}

function SourceList({ sources, onChange }) {
  const [open, setOpen] = useState(null);
  if (!sources.length) return <p className="text-xs text-slate-400 mt-4">아직 추가된 원자료가 없습니다.</p>;
  const set = (i, patch) => onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <ul className="mt-4 space-y-2">
      {sources.map((s, i) => {
        const M = SRC_META[s.type] || SRC_META.text;
        return (
          <li key={i} className={`rounded-lg border ${s.enabled === false ? 'border-slate-200 opacity-50' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <input type="checkbox" checked={s.enabled !== false} onChange={(e) => set(i, { enabled: e.target.checked })} title="보고서 작성에 사용" />
              {s.type === 'photo'
                ? <img src={`/api/files/${s.file}`} alt="" className="w-12 h-9 object-cover rounded shrink-0" />
                : <M.icon size={15} className="text-slate-500 shrink-0" />}
              {s.type === 'photo'
                ? <input className="flex-1 min-w-0 text-sm bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-brand-500" value={s.caption ?? ''}
                    placeholder={`사진 설명 (예: 사업장 외부) — ${s.name}`} onChange={(e) => set(i, { caption: e.target.value })} />
                : <button className="flex-1 text-left text-sm truncate" onClick={() => setOpen(open === i ? null : i)}>{s.name}</button>}
              <span className="text-xs text-slate-400 shrink-0">{s.type === 'pdf' ? 'PDF' : s.type === 'photo' ? '사진' : `${(s.text || '').length.toLocaleString()}자`}</span>
              <button className="btn-danger !p-1" onClick={() => onChange(sources.filter((_, j) => j !== i))} aria-label="삭제"><Trash2 size={14} /></button>
            </div>
            {open === i && s.type !== 'pdf' && s.type !== 'photo' && (
              <textarea className="input !rounded-t-none border-x-0 border-b-0" rows={8} value={s.text} onChange={(e) => set(i, { text: e.target.value })} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FieldEditor({ f, value, onChange, onRewrite, parts }) {
  const [copied, setCopied] = useState(false);
  const [rw, setRw] = useState(null);
  const [busy, setBusy] = useState(false);
  const len = typeof value === 'string' ? value.length : 0;
  const bad = (f.min && len < f.min) || (f.max && len > f.max);
  const text = f.type === 'check' ? (f.options || []).map((o) => `${(value || []).includes(o) ? '☑' : '☐'} ${o}`).join('  ') : value || '';

  async function doRewrite() {
    setBusy(true);
    try { onChange(await onRewrite(rw)); setRw(null); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-slate-800">{f.label}</span>
        {f.part && <span className="chip bg-brand-50 text-brand-700">{f.part}. {parts[f.part]}</span>}
        {f.kind === 'info' && <span className="chip bg-slate-100 text-slate-500">기본정보</span>}
        <span className="ml-auto flex items-center gap-1">
          {(f.min || f.max || f.type === 'longtext') && (
            <span className={`text-xs tabular-nums ${bad ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              {len.toLocaleString()}자{f.min ? ` / ${f.min.toLocaleString()}자 이상` : ''}{f.max ? ` / ${f.max.toLocaleString()}자 이하` : ''}
            </span>
          )}
          {f.kind === 'content' && f.type !== 'check' && (
            <button className="btn-ghost !p-1" title="AI로 다시 쓰기" onClick={() => setRw(rw === null ? '' : null)}><Wand2 size={14} /></button>
          )}
          <button className="btn-ghost !p-1" title="복사 (한글 양식에 붙여넣기)" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </span>
      </div>
      {rw !== null && (
        <div className="flex gap-2 mb-2">
          <input className="input" autoFocus value={rw} onChange={(e) => setRw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRewrite()}
            placeholder="예: 더 구체적으로 / 1,000자 이상으로 늘려줘 / 실행과제를 표처럼 정리" />
          <button className="btn-primary shrink-0" onClick={doRewrite} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : '다시 쓰기'}</button>
        </div>
      )}
      {f.type === 'check' ? (
        <div className="flex flex-wrap gap-3">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={(value || []).includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...(value || []), o] : (value || []).filter((x) => x !== o))} />{o}
            </label>
          ))}
        </div>
      ) : f.kind === 'info' || f.type === 'text' ? (
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <textarea className="input" rows={Math.min(18, Math.max(4, Math.ceil(len / 60) + (value || '').split('\n').length))} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// 양식 배치를 화면에 그대로 그려 보여준다 (DOCX 출력과 같은 구조)
export function TemplatePreview({ tpl, values, input, photos = [] }) {
  const fieldMap = Object.fromEntries(tpl.fields.map((f) => [f.key, f]));
  // 서버 DOCX와 같은 규칙: 사진 칸에 차례로 배분, 사진 칸이 없으면 끝에 추가
  const layout = [...tpl.layout];
  const photoBlocks = layout.filter((b) => b.type === 'photos');
  if (photos.length && !photoBlocks.length) {
    const extra = { type: 'photos', title: '사진', labels: ['사진 1', '사진 2'] };
    layout.push(extra);
    photoBlocks.push(extra);
  }
  const photoMap = new Map();
  let taken = 0;
  photoBlocks.forEach((b, k) => {
    const n = k === photoBlocks.length - 1 ? photos.length - taken : Math.min(b.labels.length, photos.length - taken);
    photoMap.set(b, photos.slice(taken, taken + n));
    taken += n;
  });
  const fill = (s) => (s || '').replace(/\{(\w+)\}/g, (_, k) => input?.[k] ?? '');
  const fromInput = (rule) => (/\{\w+\}/.test(rule || '') && [...rule.matchAll(/\{(\w+)\}/g)].some((m) => input?.[m[1]]) ? fill(rule).replace(/\(\s*\)/g, '').trim() : '');
  const show = (key) => {
    const f = fieldMap[key];
    const v = values[key] || (f?.kind === 'info' ? fromInput(f.from) : '');
    if (f?.type === 'check') return (f.options || []).map((o) => `${(v || []).includes(o) ? '☑' : '☐'} ${o}`).join('   ');
    return v || '';
  };
  return (
    <div className="text-left text-[13px] leading-relaxed mt-6 bg-white border border-slate-200 rounded p-6 text-slate-900">
      {layout.map((b, i) => {
        if (b.type === 'title') return <h3 key={i} className="text-center text-lg font-bold whitespace-pre-line mb-4">{fill(b.text)}</h3>;
        if (b.type === 'note') return <p key={i} className="text-xs text-slate-500 mb-1">{b.text}</p>;
        if (b.type === 'heading') return <h4 key={i} className="font-bold mt-5 mb-2">{b.text}</h4>;
        if (b.type === 'block') return <p key={i} className="whitespace-pre-wrap min-h-8">{show(b.field)}</p>;
        if (b.type === 'photos') {
          const imgs = photoMap.get(b) || [];
          const n = Math.max(b.labels.length, Math.ceil(imgs.length / b.labels.length) * b.labels.length);
          return (
          <div key={i} className="mt-4">
            {b.title && <p className="font-semibold mb-1">{b.title}</p>}
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${b.labels.length}, 1fr)` }}>
              {Array.from({ length: n }, (_, j) => (
                <div key={j} className="border border-slate-400">
                  <div className="h-28 flex items-center justify-center bg-white">{imgs[j] && <img src={`/api/files/${imgs[j].file}`} alt="" className="max-h-full max-w-full object-contain" />}</div>
                  <div className="border-t border-slate-400 bg-slate-100 text-center text-xs font-semibold py-0.5">{imgs[j]?.caption || b.labels[j] || `사진 ${j + 1}`}</div>
                </div>
              ))}
            </div>
            {b.note && <p className="text-[11px] text-slate-500 mt-1">{b.note}</p>}
          </div>
          );
        }
        if (b.type === 'signature') return (
          <div key={i} className="mt-6 space-y-2">
            {b.text && <p className="text-center whitespace-pre-line">{b.text}</p>}
            {b.date && <p className="text-center">{input?.session_date || '    년   월   일'}</p>}
            {b.sign && <p className="text-right">{fill(b.sign)}</p>}
            {b.to && <p className="text-center font-bold text-base mt-4">{b.to}</p>}
          </div>
        );
        if (b.type === 'table') {
          const total = Math.max(...b.rows.map((r) => r.reduce((s, c) => s + (c.span || 1), 0)));
          return (
            <table key={i} className="w-full border-collapse mb-3 table-fixed">
              <tbody>
                {b.rows.map((row, r) => {
                  const used = row.slice(0, -1).reduce((s, c) => s + (c.span || 1), 0);
                  return (
                    <tr key={r}>
                      {row.map((c, j) => {
                        const span = j === row.length - 1 ? total - used : c.span || 1;
                        const isLabel = c.label !== undefined;
                        return (
                          <td key={j} colSpan={span} className={`border border-slate-400 px-2 py-1.5 align-middle whitespace-pre-wrap ${isLabel ? 'bg-slate-100 font-semibold text-center w-28' : ''}`}>
                            {isLabel ? c.label : c.field ? <>{c.prefix}{show(c.field)}{c.suffix}{c.suffixField ? `\n(${c.suffixLabel} : ${values[c.suffixField] || ''})` : ''}</> : c.text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        }
        return null;
      })}
    </div>
  );
}
