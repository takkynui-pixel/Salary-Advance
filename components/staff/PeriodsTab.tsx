'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, Role } from '@/lib/supabase';
import { baht, csvCell, dateTH, downloadText } from '@/lib/format';
import { CompanyRow, PeriodRow, WIN_TH, WIN_TONE, cycleFor, hasTemplate, todayBangkok, windowState } from '@/lib/cycle';

const emptyForm = { company_id: '', month: '', label: '', start_date: '', end_date: '', pay_date: '', window_start: '', window_end: '' };

export default function PeriodsTab({ role }: { role: Role }) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [cf, setCf] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [edit, setEdit] = useState<any>(null);
  const [sum, setSum] = useState<Record<string, { n: number; total: number }>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const canFin = role === 'finance' || role === 'admin';
  const canHr = role === 'hr' || role === 'admin';
  const today = todayBangkok();
  const cname = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c.name])), [companies]);

  const load = useCallback(async () => {
    const [{ data: c }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('companies').select('*').eq('active', true).order('name'),
      supabase.from('pay_periods').select('*').order('start_date', { ascending: false }).limit(300),
      supabase.from('advance_requests').select('period_id,total_deduct,status').in('status', ['approved', 'transferred', 'deducted']),
    ]);
    setCompanies((c || []) as CompanyRow[]); setPeriods((p || []) as PeriodRow[]);
    const m: Record<string, { n: number; total: number }> = {};
    (r || []).forEach((x: any) => { const k = x.period_id; m[k] = m[k] || { n: 0, total: 0 }; m[k].n++; m[k].total += Number(x.total_deduct); }); setSum(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  // fill dates from the company template when company + month are chosen
  function applyTemplate(next: typeof emptyForm) {
    const c = companies.find(x => x.id === next.company_id);
    if (c && next.month && hasTemplate(c)) {
      const [y, m] = next.month.split('-').map(Number); const t = cycleFor(c, y, m);
      return { ...next, label: t.label, start_date: t.start, end_date: t.end, pay_date: t.pay };
    }
    return next;
  }
  const setF = (patch: Partial<typeof emptyForm>) => setForm(f => applyTemplate({ ...f, ...patch }));
  const chosen = companies.find(c => c.id === form.company_id);

  async function create() {
    const f = form;
    if (!f.company_id || !f.label || !f.start_date || !f.end_date) { setMsg({ t: 'err', s: 'เลือกบริษัท และกรอกชื่อรอบ วันเริ่ม วันสิ้นสุด' }); return; }
    if (f.end_date < f.start_date) { setMsg({ t: 'err', s: 'วันสิ้นสุดรอบต้องไม่ก่อนวันเริ่ม' }); return; }
    if (f.window_start && f.window_end && f.window_end < f.window_start) { setMsg({ t: 'err', s: 'วันสิ้นสุดช่วงเบิกต้องไม่ก่อนวันเริ่มช่วงเบิก' }); return; }
    if (periods.some(p => p.company_id === f.company_id && p.start_date === f.start_date)) { setMsg({ t: 'err', s: 'บริษัทนี้มีรอบที่เริ่มวันเดียวกันอยู่แล้ว' }); return; }
    const { error } = await supabase.from('pay_periods').insert({ company_id: f.company_id, label: f.label, start_date: f.start_date, end_date: f.end_date,
      pay_date: f.pay_date || null, window_start: f.window_start || null, window_end: f.window_end || null, window_open: true });
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    setForm(x => ({ ...emptyForm, company_id: x.company_id })); setMsg({ t: 'ok', s: 'สร้างรอบแล้ว' }); load();
  }
  async function saveEdit() {
    const f = edit; if (!f.label || !f.start_date || !f.end_date) { setMsg({ t: 'err', s: 'กรอกชื่อรอบ วันเริ่ม และวันสิ้นสุด' }); return; }
    if (f.end_date < f.start_date) { setMsg({ t: 'err', s: 'วันสิ้นสุดรอบต้องไม่ก่อนวันเริ่ม' }); return; }
    if (f.window_start && f.window_end && f.window_end < f.window_start) { setMsg({ t: 'err', s: 'วันสิ้นสุดช่วงเบิกต้องไม่ก่อนวันเริ่มช่วงเบิก' }); return; }
    const { error } = await supabase.from('pay_periods').update({ label: f.label, start_date: f.start_date, end_date: f.end_date, pay_date: f.pay_date || null,
      window_start: f.window_start || null, window_end: f.window_end || null }).eq('id', f.id);
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    setEdit(null); setMsg({ t: 'ok', s: 'บันทึกแล้ว' }); load();
  }
  async function toggleWindow(p: PeriodRow) {
    const closing = p.window_open;
    if (!confirm(closing ? `ปิดช่วงเบิกของ ${cname[p.company_id]} (รอบ ${p.label}) ทันที? พนักงานจะส่งคำขอใหม่ไม่ได้ (คำขอที่ส่งแล้วยังอนุมัติได้ตามปกติ)` : `เปิดช่วงเบิกของ ${cname[p.company_id]} (รอบ ${p.label}) อีกครั้ง? (ยังต้องอยู่ในช่วงวันที่ที่กำหนด ถ้ามี)`)) return;
    const { error } = await supabase.from('pay_periods').update({ window_open: !closing }).eq('id', p.id);
    if (error) setMsg({ t: 'err', s: error.message }); else { setMsg({ t: 'ok', s: closing ? 'ปิดช่วงเบิกแล้ว' : 'เปิดช่วงเบิกแล้ว' }); load(); }
  }
  async function setStatus(p: PeriodRow, status: string) { await supabase.from('pay_periods').update({ status }).eq('id', p.id); load(); }
  async function exportCsv(p: PeriodRow) {
    const { data, error } = await supabase.from('advance_requests').select('amount,fee,transfer_fee,total_deduct,status,transfer_ref,transferred_at,employees(emp_code,full_name,client_company)')
      .eq('period_id', p.id).in('status', ['transferred', 'deducted']).order('created_at');
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    const head = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'บริษัท', 'รอบ', 'วันจ่ายเงินเดือน', 'ยอดเบิก', 'ค่าธรรมเนียม', 'ค่าโอน', 'ยอดหักเงินเดือน', 'สถานะ', 'เลขอ้างอิงโอน'];
    const lines = (data || []).map((r: any) => [r.employees?.emp_code, r.employees?.full_name, r.employees?.client_company, p.label, p.pay_date, r.amount, r.fee, r.transfer_fee, r.total_deduct, r.status === 'deducted' ? 'หักแล้ว' : 'โอนแล้ว รอหัก', r.transfer_ref].map(csvCell).join(','));
    downloadText(`หักเบิกล่วงหน้า_${cname[p.company_id] || ''}_${p.label}.csv`, [head.map(csvCell).join(','), ...lines].join('\r\n'));
  }
  async function markDeducted(p: PeriodRow) {
    if (!confirm(`ยืนยันว่ารายการโอนแล้วทั้งหมดของ ${cname[p.company_id]} รอบ "${p.label}" ถูกหักในเงินเดือนแล้ว?`)) return;
    const { data, error } = await supabase.rpc('mark_period_deducted', { p_period: p.id });
    if (error) setMsg({ t: 'err', s: error.message }); else { setMsg({ t: 'ok', s: `ทำเครื่องหมายหักแล้ว ${data} รายการ` }); load(); }
  }

  const shown = periods.filter(p => !cf || p.company_id === cf);
  return (
    <div className="grid" style={{ gap: 16 }}>
      {canHr && <div className="card">
        <h2>สร้างรอบใหม่ของบริษัท</h2>
        <div className="row">
          <div className="field"><label>บริษัท</label>
            <select value={form.company_id} onChange={e => setF({ company_id: e.target.value })}><option value="">เลือกบริษัท</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>รอบที่สิ้นสุดในเดือน</label><input type="month" value={form.month} onChange={e => setF({ month: e.target.value })} /></div>
        </div>
        {form.company_id && !hasTemplate(chosen!) && <div className="msg inf">บริษัทนี้ยังไม่ได้ตั้งแม่แบบรอบค่าจ้าง กรอกวันที่เองด้านล่าง (หรือตั้งแม่แบบที่แท็บ "บริษัท")</div>}
        <div className="row">
          <div className="field"><label>ชื่อรอบ</label><input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="เช่น พ.ย.69" /></div>
          <div className="field"><label>รอบค่าจ้างเริ่ม</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="field"><label>รอบค่าจ้างสิ้นสุด</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="field"><label>วันจ่ายเงินเดือน</label><input type="date" value={form.pay_date} onChange={e => setForm({ ...form, pay_date: e.target.value })} /></div>
        </div>
        <div className="row">
          <div className="field"><label>ช่วงเบิก: เริ่มรับคำขอ (ว่าง = ไม่จำกัด)</label><input type="date" value={form.window_start} onChange={e => setForm({ ...form, window_start: e.target.value })} /></div>
          <div className="field"><label>ช่วงเบิก: สิ้นสุด (รวมวันนี้ ว่าง = ไม่จำกัด)</label><input type="date" value={form.window_end} onChange={e => setForm({ ...form, window_end: e.target.value })} /></div>
        </div>
        {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
        <button className="btn" onClick={create}>สร้างรอบ</button>
        <p className="label" style={{ marginTop: 8 }}>พนักงานเบิกได้เฉพาะรอบที่เปิดล่าสุดของบริษัทตัวเอง และเฉพาะในช่วงเบิก (เวลาไทย) หรือจนกว่า HR จะกดปิดช่วงเบิก</p>
      </div>}

      <div className="card">
        <div className="row" style={{ alignItems: 'end' }}>
          <h2 style={{ flex: 3, margin: 0 }}>รอบ ช่วงเบิก และรายงานยอดหัก</h2>
          <div className="field" style={{ flex: 2, margin: 0 }}><label>บริษัท</label>
            <select value={cf} onChange={e => setCf(e.target.value)}><option value="">ทุกบริษัท</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        {!canHr && msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
        {shown.length === 0 && <p className="sub" style={{ marginTop: 12 }}>ยังไม่มีรอบ</p>}
        <div className="stafflist" style={{ marginTop: 8 }}>
          {shown.map(p => {
            const ws = windowState(p, today);
            return <div className="staffrow" key={p.id} style={{ opacity: p.status === 'closed' ? .6 : 1 }}>
              <div className="who" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                <div><b>{cname[p.company_id] || '-'}</b> · รอบ {p.label} {p.status === 'closed' && <span className="badge mute">ปิดรอบแล้ว</span>}</div>
                <div className="label">ค่าจ้าง {dateTH(p.start_date)} – {dateTH(p.end_date)} · จ่ายเงินเดือน {dateTH(p.pay_date)}</div>
                <div className="label">ช่วงเบิก: {p.window_start || p.window_end ? `${p.window_start ? dateTH(p.window_start) : 'เริ่มทันที'} – ${p.window_end ? dateTH(p.window_end) : 'ไม่กำหนดวันสิ้นสุด'}` : 'ไม่จำกัดวัน'} <span className={'badge ' + WIN_TONE[ws]} style={{ marginLeft: 6 }}>{WIN_TH[ws]}</span></div>
                <div className="label">อนุมัติ/โอน/หักแล้ว {sum[p.id]?.n ?? 0} รายการ · ยอดหักรวม {baht(sum[p.id]?.total ?? 0)} บาท</div>
              </div>
              <div className="acts">
                {canHr && p.status === 'open' && <button className={'btn sm' + (p.window_open ? ' danger' : '')} onClick={() => toggleWindow(p)}>{p.window_open ? 'ปิดช่วงเบิก' : 'เปิดช่วงเบิก'}</button>}
                {canHr && <button className="btn ghost sm" onClick={() => setEdit({ ...p, pay_date: p.pay_date || '', window_start: p.window_start || '', window_end: p.window_end || '' })}>แก้ไข</button>}
                <button className="btn ghost sm" onClick={() => exportCsv(p)}>ส่งออกรายการหัก (CSV)</button>
                {canFin && <button className="btn ghost sm" onClick={() => markDeducted(p)}>ทำเครื่องหมายหักแล้ว</button>}
                {canHr && <button className="btn ghost sm" onClick={() => setStatus(p, p.status === 'open' ? 'closed' : 'open')}>{p.status === 'open' ? 'ปิดรอบ' : 'เปิดรอบ'}</button>}
              </div>
            </div>;
          })}
        </div>
        <p className="label">CSV รวมเฉพาะรายการที่โอนแล้ว ส่งให้ฝ่าย payroll นำไปหักในรอบเงินเดือนของบริษัทนั้น · "ปิดช่วงเบิก" หยุดรับคำขอใหม่ทันที ส่วน "ปิดรอบ" ใช้เมื่อจบรอบแล้ว</p>
      </div>

      {edit && <div className="overlay"><div className="modal">
        <h2>แก้ไขรอบ · {cname[edit.company_id]}</h2>
        <div className="field"><label>ชื่อรอบ</label><input type="text" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} /></div>
        <div className="row">
          <div className="field"><label>รอบค่าจ้างเริ่ม</label><input type="date" value={edit.start_date} onChange={e => setEdit({ ...edit, start_date: e.target.value })} /></div>
          <div className="field"><label>รอบค่าจ้างสิ้นสุด</label><input type="date" value={edit.end_date} onChange={e => setEdit({ ...edit, end_date: e.target.value })} /></div>
        </div>
        <div className="field"><label>วันจ่ายเงินเดือน</label><input type="date" value={edit.pay_date} onChange={e => setEdit({ ...edit, pay_date: e.target.value })} /></div>
        <div className="row">
          <div className="field"><label>ช่วงเบิก เริ่ม (ว่าง = ไม่จำกัด)</label><input type="date" value={edit.window_start} onChange={e => setEdit({ ...edit, window_start: e.target.value })} /></div>
          <div className="field"><label>ช่วงเบิก สิ้นสุด (ว่าง = ไม่จำกัด)</label><input type="date" value={edit.window_end} onChange={e => setEdit({ ...edit, window_end: e.target.value })} /></div>
        </div>
        {msg && msg.t === 'err' && <div className="msg err" role="alert">{msg.s}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" style={{ flex: 'none' }} onClick={() => { setEdit(null); setMsg(null); }}>ยกเลิก</button><button className="btn" style={{ flex: 'none' }} onClick={saveEdit}>บันทึก</button></div>
      </div></div>}
    </div>
  );
}
