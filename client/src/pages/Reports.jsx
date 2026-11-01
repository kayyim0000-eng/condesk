import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Trash2, Download, Loader2, LayoutTemplate } from 'lucide-react';
import { api, downloadReport } from '../api.js';
import { PageHeader, useSchema } from '../App.jsx';

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const { hwp } = useSchema();
  const nav = useNavigate();
  const load = () => api.get('/api/reports').then(setRows);
  useEffect(() => { load(); }, []);

  async function remove(r) {
    if (!confirm(`'${r.title}' 보고서를 삭제할까요?`)) return;
    await api.del(`/api/reports/${r.id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="컨설팅 보고서" desc="기본 데이터(메모·녹취·줌 노트·첨부)를 넣으면 기관 양식에 맞춰 보고서를 작성합니다">
        <Link to="/templates" className="btn-outline"><LayoutTemplate size={16} />양식 관리</Link>
        <Link to="/reports/new" className="btn-accent"><FilePlus2 size={16} />새 보고서</Link>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">제목</th>
              <th className="px-4 py-2.5 text-left font-medium">양식</th>
              <th className="px-4 py-2.5 text-left font-medium">일자</th>
              <th className="px-4 py-2.5 text-left font-medium">상태</th>
              <th className="px-4 py-2.5 text-left font-medium">최종 수정</th>
              <th className="w-36" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/reports/${r.id}`)}>
                <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                <td className="px-4 py-3 text-slate-600">{r.tpl}</td>
                <td className="px-4 py-3">{r.session_date}</td>
                <td className="px-4 py-3"><span className={`chip ${r.status === '제출완료' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-slate-500">{r.updated_at}</td>
                <td className="px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {(hwp ? ['hwp', 'pdf'] : ['docx']).map((fmt) => (
                    <button key={fmt} className="btn-ghost !p-1.5 text-xs" disabled={busy === `${r.id}${fmt}`} title={`${fmt.toUpperCase()} 다운로드`}
                      onClick={async () => { setBusy(`${r.id}${fmt}`); try { await downloadReport(r.id, fmt); } catch (e) { alert(e.message); } finally { setBusy(null); } }}>
                      {busy === `${r.id}${fmt}` ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{fmt === 'docx' ? 'Word' : fmt.toUpperCase()}
                    </button>
                  ))}
                  <button className="btn-danger !p-1.5" onClick={() => remove(r)} aria-label="삭제"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center py-14 text-slate-400">아직 보고서가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
