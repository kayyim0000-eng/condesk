// 업체 DB: 작성한 컨설팅 보고서의 기본정보를 업체별로 모아 보여주고 엑셀로 내려받는다
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { PageHeader } from '../App.jsx';

export default function Clients() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/clients').then(setData); }, []);
  if (!data) return <div className="text-slate-400">불러오는 중…</div>;

  const years = [...new Set(data.clients.flatMap((c) => c.reports.map((r) => r.date?.slice(0, 4))).filter(Boolean))].sort().reverse();
  const list = data.clients.filter((c) => {
    if (year && !c.reports.some((r) => r.date?.startsWith(year))) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return [c.company, c.ceo, c.industry, c.item, c.biz_no, c.orgs, c.address].some((v) => (v || '').toLowerCase().includes(s));
  });
  const sessionsInYear = year ? data.sessions.filter((s) => s.date?.startsWith(year)).length : data.sessions.length;
  const industries = new Set(list.map((c) => (c.industry || '').split('/')[0].trim()).filter(Boolean));

  async function download() {
    setBusy(true);
    try { await downloadFile('/api/clients/xlsx', '업체DB.xlsx'); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="업체 DB" desc="작성한 컨설팅 보고서의 기본정보를 업체별로 모았습니다">
        <button className="btn-primary" onClick={download} disabled={busy || !data.clients.length}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}엑셀(.xlsx) 다운로드
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[['업체 수', `${list.length}곳`], ['상담 건수', `${sessionsInYear}건`], ['업종 수', `${industries.size}개`]].map(([l, v]) => (
          <div key={l} className="card p-4">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="card p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="회사명·대표자·업종·기관 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {years.length > 0 && (
          <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">전체 연도</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="w-8" />
              {['최근 상담일', '회사명', '대표자', '업종', '아이템', '사업자등록번호', '연락처', '상담', '진행 기관'].map((h) => (
                <th key={h} className={`px-3 py-2.5 font-medium whitespace-nowrap ${h === '상담' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((c) => (
              <ClientRow key={c.key} c={c} open={open === c.key} onToggle={() => setOpen(open === c.key ? null : c.key)} />
            ))}
            {!list.length && (
              <tr><td colSpan={10} className="text-center text-slate-400 py-14">
                {data.clients.length ? '검색 결과가 없습니다.' : <>아직 업체 정보가 없습니다. <Link to="/reports/new" className="text-brand-600">보고서를 작성</Link>하면 기본정보가 여기에 모입니다.</>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientRow({ c, open, onToggle }) {
  const dash = (v) => v || <span className="text-slate-300">-</span>;
  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer align-top" onClick={onToggle}>
        <td className="pl-3 py-2.5 text-slate-400">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{dash(c.last_date)}</td>
        <td className="px-3 py-2.5 font-medium text-slate-800">{dash(c.company)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{dash(c.ceo)}</td>
        <td className="px-3 py-2.5">{dash(c.industry)}</td>
        <td className="px-3 py-2.5">{dash(c.item)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{dash(c.biz_no)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{dash(c.phone || c.biz_phone)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{c.count}건</td>
        <td className="px-3 py-2.5 text-slate-600">{dash(c.orgs)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50/70">
          <td />
          <td colSpan={9} className="px-3 pb-4 pt-1">
            <div className="grid sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-slate-600 mb-3">
              <span>직위: {c.position || '-'}</span>
              <span>사업장 전화: {c.biz_phone || '-'}</span>
              <span>개업일: {c.open_date || '-'}</span>
              <span>첫 상담일: {c.first_date || '-'}</span>
              <span className="sm:col-span-4">사업장 주소: {c.address || '-'}</span>
            </div>
            <div className="text-xs font-semibold text-slate-700 mb-1">상담 보고서</div>
            <ul className="text-sm space-y-1">
              {[...c.reports].reverse().map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="tabular-nums text-slate-500 w-24 shrink-0">{r.date || '-'}</span>
                  <Link to={`/reports/${r.id}`} className="text-brand-700 hover:underline">{r.tpl || '보고서'}</Link>
                  <span className="chip bg-slate-100 text-slate-600">{r.status}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
