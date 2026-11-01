import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { FilePlus2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api, won, manwon, CAT_COLORS, dday } from '../api.js';
import { useSchema, PageHeader } from '../App.jsx';

// breakdown: [{ label, value }] — 총합 아래에 작게 보여주는 구분별 소계 (컨설팅·강의·심사·기타)
function Tile({ label, value, sub, tone, breakdown }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl xl:text-2xl font-bold text-slate-900 mt-1 tabular-nums whitespace-nowrap">{value}</div>
      {sub && <div className={`text-xs mt-1 ${tone || 'text-slate-500'}`}>{sub}</div>}
      {breakdown && (
        <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-slate-100">
          {breakdown.map((b) => (
            <div key={b.label} className="min-w-0">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CAT_COLORS[b.label] }} />{b.label}
              </div>
              <div className="text-sm font-semibold text-slate-800 tabular-nums truncate">{b.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Panel({ title, to, children }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {to && <Link to={to} className="text-xs text-brand-600 hover:underline">전체 보기</Link>}
      </div>
      {children}
    </section>
  );
}

function MonthTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <div className="font-semibold mb-1">{label} · {won(total)}{unit}</div>
      {payload.filter((p) => p.value).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.fill }} />
          <span className="text-slate-600">{p.dataKey}</span>
          <span className="ml-auto tabular-nums">{won(p.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

// 월별 누적 막대 (업무 구분별). 금액·건수 두 차트가 같은 모양으로 쓴다.
function MonthlyChart({ data, categories, unit, tickFormat, height, legend }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tickFormatter={tickFormat} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={48} />
          <Tooltip content={<MonthTooltip unit={unit} />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          {legend && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />}
          {categories.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLORS[c]} stroke="#fff" strokeWidth={1}
              radius={i === categories.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard() {
  const { categories } = useSchema();
  const [year, setYear] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/api/dashboard${year ? `?year=${year}` : ''}`).then(setD); }, [year]);
  if (!d) return <div className="text-slate-400">불러오는 중…</div>;

  const growth = d.prev.amount ? ((d.rev.amount - d.prev.amount) / d.prev.amount) * 100 : null;
  const catTotal = d.byCat.reduce((s, c) => s + c.amount, 0) || 1;
  const byCat = categories.map((c) => d.byCat.find((x) => x.category === c) || { category: c, amount: 0, n: 0 });
  const actTotal = d.act.reduce((s, a) => s + a.cnt, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="대시보드" desc={<span className="text-base font-semibold tracking-tight text-brand-600">Consult more, write less<span className="text-accent-500">.</span></span>}>
        <select className="input w-auto" value={d.year} onChange={(e) => setYear(e.target.value)}>
          {(d.years.length ? d.years : [d.year]).map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <Link to="/reports/new" className="btn-accent"><FilePlus2 size={16} />보고서 작성</Link>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label={`${d.year}년 매출`} value={`${manwon(d.rev.amount)}원`}
          sub={growth == null ? `${d.rev.n}건` : <span className="inline-flex items-center gap-0.5">{growth >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}전년 대비 {growth.toFixed(0)}%</span>}
          tone={growth == null ? undefined : growth >= 0 ? 'text-emerald-700' : 'text-rose-600'}
          breakdown={byCat.map((c) => ({ label: c.category, value: manwon(c.amount) }))} />
        <Tile label="수행 실적 (건/업체)" value={`${actTotal.toLocaleString()}건`} sub={`업무 이력 ${d.act.reduce((s, a) => s + a.n, 0)}건 기준`}
          breakdown={categories.map((c) => ({ label: c, value: `${(d.act.find((a) => a.category === c)?.cnt || 0).toLocaleString()}건` }))} />
        <Tile label="교육 이수" value={`${d.training.hours}시간`} sub={`${d.training.n}개 과정`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="월별 매출 (업무 구분별)" to="/t/revenues">
            <MonthlyChart data={d.monthly} categories={categories} unit="원" tickFormat={manwon} height={260} legend />
            <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-1">월별 건수 <span className="font-normal text-slate-400 text-xs">· {d.rev.n}건</span></h3>
            <MonthlyChart data={d.monthlyCount} categories={categories} unit="건" height={150} />
          </Panel>
        </div>
        <Panel title="업무 구분별 매출 비중">
          <div className="space-y-3">
            {byCat.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLORS[c.category] }} />{c.category} <span className="text-slate-400 text-xs">{c.n}건</span></span>
                  <span className="tabular-nums text-slate-700">{manwon(c.amount)}원 · {Math.round((c.amount / catTotal) * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.amount / catTotal) * 100}%`, background: CAT_COLORS[c.category] }} />
                </div>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-semibold mt-6 mb-2 text-slate-700">주요 거래 기관</h3>
          <ul className="text-sm divide-y divide-slate-100">
            {d.topOrgs.map((o) => (
              <li key={o.org} className="flex justify-between py-1.5"><span className="truncate pr-2">{o.org}</span><span className="tabular-nums text-slate-600 shrink-0">{manwon(o.amount)}원</span></li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="마감 임박 공고" to="/t/notices">
          {d.notices.length ? (
            <ul className="space-y-2 text-sm">
              {d.notices.map((n) => (
                <li key={n.id} className="flex items-start gap-2">
                  <span className={`chip shrink-0 ${dday(n.deadline, d.today).match(/^D-([0-7])$|D-DAY/) ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>{dday(n.deadline, d.today)}</span>
                  <span><span className="text-slate-800">{n.title}</span><span className="text-slate-400 text-xs block">{n.org} · {n.status || '관심'}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">진행 중인 공고가 없습니다.</p>}
        </Panel>
        <Panel title="보유 자격증" to="/t/certificates">
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{d.certTotal}<span className="text-base font-medium text-slate-500 ml-1">개</span></div>
          <ul className="mt-3 text-sm divide-y divide-slate-100">
            {d.certCategories.map((c) => {
              const n = d.certByCat.find((x) => x.category === c)?.n || 0;
              return (
                <li key={c} className="flex items-center gap-3 py-1.5">
                  <span className={`w-24 shrink-0 ${n ? 'text-slate-700' : 'text-slate-400'}`}>{c}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${d.certTotal ? (n / d.certTotal) * 100 : 0}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-slate-600">{n}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="최근 보고서" to="/reports">
          {d.reports.length ? (
            <ul className="space-y-2 text-sm">
              {d.reports.map((r) => (
                <li key={r.id}>
                  <Link to={`/reports/${r.id}`} className="hover:text-brand-600">{r.title}</Link>
                  <span className="text-slate-400 text-xs block">{r.tpl} · {r.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">아직 작성한 보고서가 없습니다. <Link className="text-brand-600" to="/reports/new">첫 보고서 작성 →</Link></p>}
        </Panel>
      </div>
    </div>
  );
}
