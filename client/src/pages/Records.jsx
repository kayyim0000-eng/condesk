import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Eye, EyeOff, ExternalLink, Copy, Download, Loader2 } from 'lucide-react';
import { api, won, CAT_CHIP, dday, downloadFile } from '../api.js';
import { useSchema, PageHeader, Modal } from '../App.jsx';

export default function Records() {
  const { table } = useParams();
  const { tables } = useSchema();
  const t = tables[table];
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [year, setYear] = useState('');
  const [editing, setEditing] = useState(null);
  const [shown, setShown] = useState({});
  const [exporting, setExporting] = useState(false);

  const load = () => api.get(`/api/t/${table}`).then(setRows);
  useEffect(() => { load(); setQ(''); setFilters({}); setYear(''); }, [table]);

  const cols = t.columns.filter((c) => c.list);
  const selectCols = t.columns.filter((c) => c.type === 'select' && c.list).slice(0, 2);
  const dateKey = t.columns.find((c) => c.type === 'date')?.key;
  const years = useMemo(() => [...new Set(rows.map((r) => r[dateKey]?.slice(0, 4)).filter(Boolean))].sort().reverse(), [rows, dateKey]);

  const filtered = rows.filter((r) => {
    if (q && !t.columns.some((c) => c.type !== 'secret' && String(r[c.key] ?? '').toLowerCase().includes(q.toLowerCase()))) return false;
    if (year && r[dateKey]?.slice(0, 4) !== year) return false;
    return Object.entries(filters).every(([k, v]) => !v || r[k] === v);
  });
  const moneyCols = t.columns.filter((c) => c.type === 'money' || c.type === 'number');
  const sums = Object.fromEntries(moneyCols.map((c) => [c.key, filtered.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)]));

  async function save(rec) {
    if (rec.id) await api.put(`/api/t/${table}/${rec.id}`, rec);
    else await api.post(`/api/t/${table}`, rec);
    setEditing(null);
    load();
  }
  async function remove(r) {
    if (!confirm('이 항목을 삭제할까요?')) return;
    await api.del(`/api/t/${table}/${r.id}`);
    load();
  }

  function cell(c, r) {
    const v = r[c.key];
    if (v == null || v === '') return <span className="text-slate-300">-</span>;
    if (c.type === 'money') return <span className="tabular-nums">{won(v)}</span>;
    if (c.type === 'select' && (c.key === 'category' || c.key === 'mode')) return <span className={`chip ${CAT_CHIP[v] || 'bg-slate-100 text-slate-600'}`}>{v}</span>;
    if (c.type === 'select') return <span className="chip bg-slate-100 text-slate-700">{v}</span>;
    if (c.type === 'url') return <a href={/^https?:/.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1 max-w-[16rem] truncate">{v.replace(/^https?:\/\//, '')}<ExternalLink size={12} /></a>;
    if (c.type === 'secret') {
      const k = `${r.id}-${c.key}`;
      return (
        <span className="inline-flex items-center gap-1 font-mono text-xs">
          {shown[k] ? v : '••••••'}
          <button className="text-slate-400 hover:text-slate-700" onClick={() => setShown({ ...shown, [k]: !shown[k] })} aria-label="보기">{shown[k] ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          <button className="text-slate-400 hover:text-slate-700" onClick={() => navigator.clipboard.writeText(v)} aria-label="복사"><Copy size={13} /></button>
        </span>
      );
    }
    if (c.key === 'deadline' || c.key === 'expiry_date') {
      const d = dday(v);
      const urgent = d.startsWith('D-') && Number(d.slice(2)) <= 14 || d === 'D-DAY';
      return <span>{v} <span className={`chip ml-1 ${urgent ? 'bg-rose-50 text-rose-600' : d.startsWith('D+') ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{d}</span></span>;
    }
    return <span className="line-clamp-2">{v}</span>;
  }

  return (
    <div>
      <PageHeader title={t.label} desc={t.desc}>
        <button className="btn-outline" disabled={exporting} onClick={async () => {
          setExporting(true);
          try { await downloadFile(`/api/t/${table}/xlsx`, `${t.label}.xlsx`); } catch (e) { alert(e.message); } finally { setExporting(false); }
        }}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}엑셀 다운로드</button>
        <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} />새 항목</button>
      </PageHeader>

      <div className="card p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {years.length > 0 && (
          <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">전체 연도</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        )}
        {selectCols.map((c) => (
          <select key={c.key} className="input w-auto" value={filters[c.key] || ''} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}>
            <option value="">{c.label} 전체</option>
            {c.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        <span className="text-sm text-slate-500 ml-auto">{filtered.length}건</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              {cols.map((c) => <th key={c.key} className={`px-3 py-2.5 font-medium whitespace-nowrap ${c.type === 'money' || c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60 group">
                {cols.map((c) => <td key={c.key} className={`px-3 py-2.5 align-top ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}>{cell(c, r)}</td>)}
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button className="btn-ghost !p-1.5" onClick={() => setEditing(r)} aria-label="수정"><Pencil size={15} /></button>
                  <button className="btn-danger !p-1.5" onClick={() => remove(r)} aria-label="삭제"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={cols.length + 1} className="text-center text-slate-400 py-12">항목이 없습니다. ‘새 항목’으로 추가하거나 설정에서 엑셀을 가져오세요.</td></tr>}
          </tbody>
          {filtered.length > 0 && moneyCols.some((c) => c.list) && (
            <tfoot className="bg-slate-50 font-medium">
              <tr>
                {cols.map((c, i) => <td key={c.key} className={`px-3 py-2.5 ${c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}`}>{i === 0 ? '합계' : c.key in sums ? won(sums[c.key]) : ''}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && <RecordForm table={t} initial={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function RecordForm({ table, initial, onSave, onClose }) {
  const [rec, setRec] = useState(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setRec((r) => {
    const next = { ...r, [k]: v };
    // 매출: 금액 입력 시 실수령(3.3% 원천징수 공제) 자동 계산
    const netUntouched = r.net_amount == null || r.net_amount === '' || Math.round(r.amount * 0.967) === Number(r.net_amount);
    if (k === 'amount' && table.columns.some((c) => c.key === 'net_amount') && netUntouched) {
      next.net_amount = v ? Math.round(Number(v) * 0.967) : '';
    }
    return next;
  });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(rec); } catch (err) { alert(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial.id ? `${table.label} 수정` : `${table.label} 추가`} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {table.columns.map((c) => (
          <div key={c.key} className={c.type === 'longtext' || c.type === 'url' ? 'sm:col-span-2' : ''}>
            <label className="label">{c.label}{c.required && <span className="text-rose-500"> *</span>}</label>
            {c.type === 'select' ? (
              <select className="input" value={rec[c.key] ?? ''} required={c.required} onChange={(e) => set(c.key, e.target.value)}>
                <option value="">선택</option>
                {c.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : c.type === 'longtext' ? (
              <textarea className="input" rows={3} value={rec[c.key] ?? ''} onChange={(e) => set(c.key, e.target.value)} />
            ) : (
              <input className="input" required={c.required}
                type={c.type === 'date' ? 'date' : c.type === 'number' || c.type === 'money' ? 'number' : 'text'}
                step={c.type === 'number' ? 'any' : undefined}
                value={rec[c.key] ?? ''} onChange={(e) => set(c.key, e.target.value)} />
            )}
          </div>
        ))}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-primary" disabled={busy}>저장</button>
        </div>
      </form>
    </Modal>
  );
}
