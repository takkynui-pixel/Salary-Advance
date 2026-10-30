'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, Role } from '@/lib/supabase';
import { baht, calcFee, dateTimeTH, STATUS_TH, STATUS_TONE } from '@/lib/format';
import { openPrivate } from '../Uploads';

const FILTERS = [['pending_hr', 'รอ HR อนุมัติยอด'], ['pending_sign', 'รอพนักงานเซ็น'], ['approved', 'รอโอน'], ['transferred', 'โอนแล้ว'], ['deducted', 'หักแล้ว'], ['rejected', 'ไม่อนุมัติ'], ['all', 'ทั้งหมด']];

export default function RequestsTab({ role }: { role: Role }) {
  const [filter, setFilter] = useState(role === 'finance' ? 'approved' : 'pending_hr');
  const [rows, setRows] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [apps, setApps] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState('');
  const [xfer, setXfer] = useState<any>(null);
  const [ref, setRef] = useState('');
  const [slip, setSlip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [appr, setAppr] = useState<any>(null);
  const [apprAmt, setApprAmt] = useState('');
  const [apprNote, setApprNote] = useState('');
  const [apprAvail, setApprAvail] = useState(0);
  const [apprDays, setApprDays] = useState(0);
  const [cfg, setCfg] = useState({ fee_rate: 0.03, transfer_fee: 15, limit_pct: 0.7 });
  const canHr = role === 'hr' || role === 'admin';
  const canFin = role === 'finance' || role === 'admin';

  const load = useCallback(async () => {
    let q = supabase.from('advance_requests').select('*, employees(emp_code, full_name, client_company, daily_wage), pay_periods(label)').order('created_at', { ascending: false }).limit(300);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q; const list = data || []; setRows(list);
    const ids = list.map((r: any) => r.id); const eids = Array.from(new Set(list.map((r: any) => r.employee_id)));
    if (ids.length) { const { data: d } = await supabase.from('signed_documents').select('id,request_id,doc_type,pdf_path,signed_at').in('request_id', ids); setDocs(d || []); } else setDocs([]);
    if (eids.length) { const { data: a } = await supabase.from('loan_applications').select('employee_id,data').in('employee_id', eids as string[]); setApps(Object.fromEntries((a || []).map((x: any) => [x.employee_id, x.data]))); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { supabase.from('app_settings').select('key,value').then(({ data }) => { if (data) setCfg(Object.fromEntries(data.map((x: any) => [x.key, Number(x.value)])) as any); }); }, []);

  async function reject(r: any) {
    const note = prompt('เหตุผลที่ไม่อนุมัติ (แสดงให้พนักงานเห็น)');
    if (note === null) return;
    setMsg(''); const { error } = await supabase.rpc('hr_decide', { p_id: r.id, p_approve: false, p_note: note, p_amount: null });
    if (error) setMsg(error.message); else load();
  }
  async function openApprove(r: any) {
    setMsg(''); setAppr(r); setApprNote('');
    const { data } = await supabase.rpc('available_limit', { p_employee: r.employee_id, p_period: r.period_id });
    const { data: at } = await supabase.from('attendance_days').select('days_worked').eq('employee_id', r.employee_id).eq('period_id', r.period_id).maybeSingle();
    setApprDays(Number(at?.days_worked ?? 0));
    const av = Number(data ?? 0); setApprAvail(av);
    setApprAmt(String(Math.max(0, Math.min(Number(r.requested_amount), Math.floor(av)))));
  }
  async function confirmApprove() {
    if (!appr) return; setBusy(true); setMsg('');
    const { error } = await supabase.rpc('hr_decide', { p_id: appr.id, p_approve: true, p_note: apprNote || null, p_amount: Number(apprAmt) });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setAppr(null); load();
  }
  const latestDoc = (id: string, type = 'deduction_consent') => docs.filter(d => d.request_id === id && d.doc_type === type).sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1))[0];

  async function doTransfer() {
    if (!xfer) return; setBusy(true); setMsg('');
    let slipPath: string | null = null;
    if (slip) {
      const ext = (slip.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      slipPath = `${xfer.id}/slip-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('transfer-slips').upload(slipPath, slip, { contentType: slip.type });
      if (up.error) { setMsg('อัปโหลดสลิปไม่สำเร็จ: ' + up.error.message); setBusy(false); return; }
    }
    const { error } = await supabase.rpc('finance_transfer', { p_id: xfer.id, p_ref: ref, p_slip: slipPath });
    setBusy(false);
    if (error) setMsg(error.message); else { setXfer(null); setRef(''); setSlip(null); load(); }
  }

  return (
    <div className="card">
      <h2>คำขอเบิกเงินล่วงหน้า</h2>
      <div className="nav" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
        {FILTERS.map(([k, l]) => <button key={k} className={'pill' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {msg && <div className="msg err" role="alert">{msg}</div>}
      <div className="tablewrap"><table>
        <thead><tr><th>วันที่</th><th>พนักงาน</th><th>รอบ</th><th className="right">วงเงินตามวันทำงาน*</th><th className="right">ยอดที่ขอ</th><th className="right">ยอดอนุมัติ</th><th className="right">ยอดหัก</th><th>สถานะ</th><th>เอกสาร</th><th>จัดการ</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} className="label">ไม่มีรายการ</td></tr>}
          {rows.map(r => {
            const ld = latestDoc(r.id); const lc = latestDoc(r.id, 'loan_contract'); const bank = apps[r.employee_id];
            return <tr key={r.id}>
              <td>{dateTimeTH(r.created_at)}</td>
              <td><b>{r.employees?.full_name}</b><div className="label">{r.employees?.emp_code} · {r.employees?.client_company}</div></td>
              <td>{r.pay_periods?.label}</td>
              <td className="right" title={`${r.days_snapshot} วัน × ${r.wage_snapshot}`}>{baht(r.limit_snapshot)}<div className="label">{r.days_snapshot} วัน × {baht(r.wage_snapshot)}</div></td>
              <td className="right">{baht(r.requested_amount)}</td><td className="right">{['pending_hr', 'rejected', 'cancelled'].includes(r.status) ? '-' : baht(r.amount)}</td><td className="right">{['pending_hr', 'rejected', 'cancelled'].includes(r.status) ? '-' : baht(r.total_deduct)}</td>
              <td><span className={'badge ' + STATUS_TONE[r.status]}>{STATUS_TH[r.status]}</span>{r.transfer_ref && <div className="label">อ้างอิง {r.transfer_ref}</div>}{r.hr_note && <div className="label">{r.hr_note}</div>}</td>
              <td>{['approved', 'transferred', 'deducted'].includes(r.status) ? <>{lc ? <button className="btn ghost sm" style={{ margin: '0 6px 4px 0' }} onClick={() => openPrivate('signed-docs', lc.pdf_path)}>สัญญา</button> : <span className="label" style={{ marginRight: 6 }}>ไม่มีสัญญา</span>}{ld && <button className="btn ghost sm" onClick={() => openPrivate('signed-docs', ld.pdf_path)}>ใบยินยอมหัก</button>}</> : <span className="label">{r.status === 'pending_sign' ? 'รอพนักงานเซ็น' : '-'}</span>}</td>
              <td>
                {r.status === 'pending_hr' && canHr && <>
                  <button className="btn sm" onClick={() => openApprove(r)}>ตรวจสอบและอนุมัติ</button>{' '}
                  <button className="btn danger sm" onClick={() => reject(r)}>ไม่อนุมัติ</button></>}
                {r.status === 'approved' && canFin && <button className="btn sm" onClick={() => { setXfer(r); setRef(''); setSlip(null); }}>บันทึกการโอน</button>}
                {r.status === 'approved' && bank && canFin && <div className="label" style={{ marginTop: 4 }}>{bank.bankName} · {bank.bankAccountNo}<br />{bank.bankAccountName}</div>}
              </td>
            </tr>;
          })}
        </tbody></table></div>
      <p className="label">* วงเงินตามวันทำงาน = ค่าจ้างรายวัน × วันทำงาน × 70% ณ เวลาที่ขอเบิก (HR เป็นผู้กำหนดยอดอนุมัติจริง)</p>

      {appr && <div className="overlay"><div className="modal">
        <h2>อนุมัติยอดเบิก</h2>
        <p className="sub"><b>{appr.employees?.full_name}</b> ({appr.employees?.emp_code}) · {appr.employees?.client_company}</p>
        <table><tbody>
          <tr><td>ยอดที่พนักงานขอ</td><td className="right">{baht(appr.requested_amount)}</td></tr>
          <tr><td>ค่าจ้างรายวัน × วันทำงานในรอบ</td><td className="right">{baht(appr.employees?.daily_wage)} × {apprDays} วัน</td></tr>
          <tr><td><b>เบิกได้สูงสุดตามวันทำงาน ({cfg.limit_pct * 100}% หักยอดที่อนุมัติแล้ว)</b></td><td className="right"><b>{baht(apprAvail)}</b></td></tr>
        </tbody></table>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="aa">ยอดที่อนุมัติ (บาท)</label>
          <input id="aa" type="number" min="1" step="1" value={apprAmt} onChange={e => setApprAmt(e.target.value)} /></div>
        {Number(apprAmt) > 0 && (() => { const f = calcFee(Number(apprAmt), cfg.fee_rate, cfg.transfer_fee); return <p className="label">ค่าธรรมเนียม {baht(f.fee)} + ค่าโอน {baht(f.transferFee)} → ยอดหักเงินเดือน <b>{baht(f.total)}</b></p>; })()}
        <div className="field"><label htmlFor="an">หมายเหตุถึงพนักงาน (ไม่บังคับ)</label><input id="an" type="text" value={apprNote} onChange={e => setApprNote(e.target.value)} /></div>
        {msg && <div className="msg err" role="alert">{msg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" style={{ flex: 'none' }} onClick={() => setAppr(null)}>ปิด</button>
          <button className="btn" style={{ flex: 'none' }} disabled={busy || !(Number(apprAmt) > 0)} onClick={confirmApprove}>{busy ? 'กำลังบันทึก...' : 'อนุมัติยอดนี้'}</button>
        </div></div></div>}

      {xfer && <div className="overlay"><div className="modal">
        <h2>บันทึกการโอนเงิน</h2>
        <p className="sub">{xfer.employees?.full_name} · โอน <b>{baht(xfer.amount)}</b> บาท (ยอดหักเงินเดือน {baht(xfer.total_deduct)})</p>
        {apps[xfer.employee_id] && <div className="msg inf">{apps[xfer.employee_id].bankName} · {apps[xfer.employee_id].bankAccountNo} · {apps[xfer.employee_id].bankAccountName}</div>}
        <div className="field"><label>เลขอ้างอิงการโอน</label><input type="text" value={ref} onChange={e => setRef(e.target.value)} /></div>
        <div className="field"><label>แนบสลิป (ไม่บังคับ)</label><input type="file" accept="image/*,application/pdf" onChange={e => setSlip(e.target.files?.[0] || null)} /></div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" style={{ flex: 'none' }} onClick={() => setXfer(null)}>ปิด</button>
          <button className="btn" style={{ flex: 'none' }} disabled={busy || !ref.trim()} onClick={doTransfer}>{busy ? 'กำลังบันทึก...' : 'ยืนยันโอนแล้ว'}</button>
        </div></div></div>}
    </div>
  );
}
