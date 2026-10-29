'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, Role } from '@/lib/supabase';
import { baht, csvCell, dateTH, downloadText } from '@/lib/format';

export default function PeriodsTab({ role }: { role: Role }) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [form, setForm] = useState({ label: '', start_date: '', end_date: '', pay_date: '' });
  const [sum, setSum] = useState<Record<string, { n: number; total: number }>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const canFin = role === 'finance' || role === 'admin';

  const load = useCallback(async () => {
    const { data } = await supabase.from('pay_periods').select('*').order('start_date', { ascending: false }); setPeriods(data || []);
    const { data: r } = await supabase.from('advance_requests').select('period_id,total_deduct,status').in('status', ['approved', 'transferred', 'deducted']);
    const m: Record<string, { n: number; total: number }> = {};
    (r || []).forEach((x: any) => { const k = x.period_id; m[k] = m[k] || { n: 0, total: 0 }; m[k].n++; m[k].total += Number(x.total_deduct); }); setSum(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.label || !form.start_date || !form.end_date) { setMsg({ t: 'err', s: 'กรอกชื่อรอบ วันเริ่ม และวันสิ้นสุด' }); return; }
    const { error } = await supabase.from('pay_periods').insert({ ...form, pay_date: form.pay_date || null });
    if (error) setMsg({ t: 'err', s: error.message }); else { setForm({ label: '', start_date: '', end_date: '', pay_date: '' }); setMsg({ t: 'ok', s: 'สร้างรอบแล้ว' }); load(); }
  }
  async function setStatus(p: any, status: string) { await supabase.from('pay_periods').update({ status }).eq('id', p.id); load(); }
  async function exportCsv(p: any) {
    const { data, error } = await supabase.from('advance_requests').select('amount,fee,transfer_fee,total_deduct,status,transfer_ref,transferred_at,employees(emp_code,full_name,client_company)')
      .eq('period_id', p.id).in('status', ['transferred', 'deducted']).order('created_at');
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    const head = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'บริษัท', 'ยอดเบิก', 'ค่าบริการ', 'ค่าโอน', 'ยอดหักเงินเดือน', 'สถานะ', 'เลขอ้างอิงโอน'];
    const lines = (data || []).map((r: any) => [r.employees?.emp_code, r.employees?.full_name, r.employees?.client_company, r.amount, r.fee, r.transfer_fee, r.total_deduct, r.status === 'deducted' ? 'หักแล้ว' : 'โอนแล้ว รอหัก', r.transfer_ref].map(csvCell).join(','));
    downloadText(`หักเบิกล่วงหน้า_${p.label}.csv`, [head.map(csvCell).join(','), ...lines].join('\r\n'));
  }
  async function markDeducted(p: any) {
    if (!confirm(`ยืนยันว่ารายการโอนแล้วทั้งหมดของรอบ "${p.label}" ถูกหักในเงินเดือนแล้ว?`)) return;
    const { data, error } = await supabase.rpc('mark_period_deducted', { p_period: p.id });
    if (error) setMsg({ t: 'err', s: error.message }); else { setMsg({ t: 'ok', s: `ทำเครื่องหมายหักแล้ว ${data} รายการ` }); load(); }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>สร้างรอบใหม่</h2>
        <div className="row">
          <div className="field"><label>ชื่อรอบ</label><input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="เช่น พ.ย. 2569" /></div>
          <div className="field"><label>วันเริ่มรอบ</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="field"><label>วันสิ้นสุดรอบ</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="field"><label>วันจ่ายเงินเดือน</label><input type="date" value={form.pay_date} onChange={e => setForm({ ...form, pay_date: e.target.value })} /></div>
        </div>
        {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
        <button className="btn" onClick={create}>สร้างรอบ</button>
        <p className="label" style={{ marginTop: 8 }}>พนักงานเบิกได้เฉพาะรอบที่เปิดล่าสุด เมื่อปิดรอบแล้วจะเบิกเพิ่มไม่ได้</p>
      </div>
      <div className="card tablewrap">
        <h2>รอบและรายงานยอดหัก</h2>
        <table><thead><tr><th>รอบ</th><th>ช่วงวันที่</th><th>จ่ายเงินเดือน</th><th>สถานะ</th><th className="right">รายการ (อนุมัติ+)</th><th className="right">ยอดหักรวม</th><th></th></tr></thead>
          <tbody>{periods.map(p => <tr key={p.id}>
            <td><b>{p.label}</b></td><td>{dateTH(p.start_date)} – {dateTH(p.end_date)}</td><td>{dateTH(p.pay_date)}</td>
            <td><span className={'badge ' + (p.status === 'open' ? 'ok' : 'mute')}>{p.status === 'open' ? 'เปิด' : 'ปิด'}</span></td>
            <td className="right">{sum[p.id]?.n ?? 0}</td><td className="right">{baht(sum[p.id]?.total ?? 0)}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn ghost sm" onClick={() => exportCsv(p)}>ส่งออกรายการหัก (CSV)</button>{' '}
              {canFin && <button className="btn ghost sm" onClick={() => markDeducted(p)}>ทำเครื่องหมายหักแล้ว</button>}{' '}
              <button className="btn ghost sm" onClick={() => setStatus(p, p.status === 'open' ? 'closed' : 'open')}>{p.status === 'open' ? 'ปิดรอบ' : 'เปิดรอบ'}</button></td></tr>)}</tbody></table>
        {periods.length === 0 && <p className="sub">ยังไม่มีรอบ</p>}
        <p className="label">CSV รวมเฉพาะรายการที่โอนแล้ว ส่งให้ฝ่าย payroll นำไปหักในรอบเงินเดือน</p>
      </div>
    </div>
  );
}
