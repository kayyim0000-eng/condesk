import { useEffect, useState, createContext, useContext } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Briefcase, Wallet, GraduationCap, Award, Megaphone, KeyRound, Settings as Cog, LayoutTemplate, Menu, X, Building2, LogOut,
} from 'lucide-react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Records from './pages/Records.jsx';
import Reports from './pages/Reports.jsx';
import ReportEditor from './pages/ReportEditor.jsx';
import Templates from './pages/Templates.jsx';
import Clients from './pages/Clients.jsx';
import Settings from './pages/Settings.jsx';

const SchemaCtx = createContext(null);
export const useSchema = () => useContext(SchemaCtx);

const NAV = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/reports', label: '컨설팅 보고서', icon: FileText },
  { to: '/clients', label: '업체 DB', icon: Building2 },
  { group: '업무 관리' },
  { to: '/t/activities', label: '업무 이력', icon: Briefcase },
  { to: '/t/revenues', label: '매출', icon: Wallet },
  { group: '역량 관리' },
  { to: '/t/trainings', label: '교육 이력', icon: GraduationCap },
  { to: '/t/certificates', label: '자격증', icon: Award },
  { group: '정보 관리' },
  { to: '/t/notices', label: '공고', icon: Megaphone },
  { to: '/t/accounts', label: '가입 사이트', icon: KeyRound },
  { group: '' },
  { to: '/templates', label: '보고서 양식', icon: LayoutTemplate },
  { to: '/settings', label: '설정', icon: Cog },
];

export default function App() {
  const [session, setSession] = useState(null); // { required, ok }
  const [schema, setSchema] = useState(null);
  const [open, setOpen] = useState(false);
  const [hwp, setHwp] = useState(true);
  useEffect(() => {
    // 서버(API)가 없는 곳(예: Cloudflare 정적 배포)에서는 안내 화면을 보여 준다
    api.get('/api/session').then(setSession).catch(() => setSession({ offline: true }));
    const onAuth = () => setSession((s) => ({ ...s, ok: false }));
    window.addEventListener('auth-required', onAuth);
    return () => window.removeEventListener('auth-required', onAuth);
  }, []);
  useEffect(() => {
    if (!session?.ok) return;
    api.get('/api/schema').then(setSchema);
    api.get('/api/hwp-available').then((r) => setHwp(r.available)).catch(() => setHwp(false));
  }, [session?.ok]);
  if (!session) return <div className="p-10 text-slate-400">불러오는 중…</div>;
  if (session.offline) return <Offline />;
  if (!session.ok) return <Login onDone={() => setSession({ ...session, ok: true })} />;
  if (!schema) return <div className="p-10 text-slate-400">불러오는 중…</div>;
  const logout = async () => { await api.post('/api/logout'); setSession({ ...session, ok: false }); };

  return (
    <SchemaCtx.Provider value={{ ...schema, hwp }}>
      <div className="min-h-screen lg:flex">
        <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-side border-b border-side-line text-slate-700">
          <Logo className="text-lg" />
          <button onClick={() => setOpen(!open)} aria-label="메뉴">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </header>
        <aside className={`${open ? 'block' : 'hidden'} lg:block lg:w-60 shrink-0 bg-side lg:border-r border-side-line text-slate-600 lg:min-h-screen lg:sticky lg:top-0 lg:h-screen overflow-y-auto`}>
          <div className="hidden lg:block px-5 pt-6 pb-4">
            <Logo className="text-2xl" />
            <div className="text-[11px] tracking-wide text-slate-500 mt-1">Your consulting workspace · 컨데스크</div>
          </div>
          <nav className="px-3 pb-6 space-y-0.5">
            {NAV.map((n, i) => n.group !== undefined
              ? <div key={i} className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">{n.group}</div>
              : (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm border-l-2 ${isActive ? 'bg-white text-slate-900 font-semibold border-accent-500 shadow-sm' : 'border-transparent hover:bg-white/60 hover:text-slate-900'}`}>
                  <n.icon size={17} />{n.label}
                </NavLink>
              ))}
            {session.required && (
              <button onClick={logout} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm border-l-2 border-transparent hover:bg-white/60 hover:text-slate-900">
                <LogOut size={17} />로그아웃
              </button>
            )}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 p-4 lg:p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/new" element={<ReportEditor />} />
            <Route path="/reports/:id" element={<ReportEditor />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/t/:table" element={<Records />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </SchemaCtx.Provider>
  );
}

function Offline() {
  return (
    <div className="min-h-screen bg-side flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8">
        <Logo className="text-3xl" />
        <p className="text-sm font-semibold text-brand-600 mt-2">Consult more, write less<span className="text-accent-500">.</span></p>
        <h1 className="text-lg font-bold text-slate-900 mt-8">서버에 연결할 수 없습니다</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          이 주소에는 ConDesk 화면만 올라가 있고, 데이터를 저장하고 AI를 실행하는 서버는 아직 연결되지 않았습니다.
          지금은 컨설턴트 PC에서 실행 중인 ConDesk 주소로 접속해 주세요.
        </p>
        <button className="btn-outline mt-6" onClick={() => window.location.reload()}>다시 시도</button>
      </div>
    </div>
  );
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.post('/api/login', { password: pw }); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen bg-side flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <Logo className="text-3xl" />
        <p className="text-sm font-semibold text-brand-600 mt-2">Consult more, write less<span className="text-accent-500">.</span></p>
        <label className="label mt-8" htmlFor="pw">비밀번호</label>
        <input id="pw" type="password" className="input" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
        <button className="btn-primary w-full mt-5 py-2.5" disabled={busy || !pw}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </div>
  );
}

// 영문 워드마크: Con(티파니 블루) + Desk(짙은 남색) + 코랄 포인트 점
function Logo({ className = '' }) {
  return (
    <span className={`font-extrabold tracking-tight leading-none ${className}`}>
      <span className="text-brand-600">Con</span><span className="text-slate-800">Desk</span><span className="text-accent-500">.</span>
    </span>
  );
}

export function PageHeader({ title, desc, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} mt-10 mb-10`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
