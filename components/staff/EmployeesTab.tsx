'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { baht, parseTable, dateTimeTH, STATUS_TH, STATUS_TONE } from '@/lib/format';
import { openPrivate } from '../Uploads';

async function callInvite(ids: string[], force: boolean): Promise<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return 'ไม่พบ session';
  let sent = 0; let reason = '';
  for (let i = 0; i < ids.length; i += 200) {
    const res = await fetch('/api/notify-employee', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeIds: ids.slice(i, i + 200), force }) });
    const j = await res.json().catch(() => ({}));
    sent += j.sent || 0; if (j.reason) reason = j.reason; if (j.error && !reason) reason = j.error;
  }
  if (sent > 0) return `ส่งอีเมลแจ้งพนักงานแล้ว ${sent} คน`;
  return reason === 'email not configured' ? 'ยังไม่ได้ตั้งค่าอีเมลของระบบ (ดู README) จึงไม่ได้ส่งอีเมล' : reason === 'nothing to send' ? 'ไม่ได้ส่งอีเมล (พนักงานไม่มีอีเมล หรือเคยส่งแล้ว)' : 'ส่งอีเมลไม่สำเร็จ' + (reason ? ` (${reason})` : '');
}

const blank = { emp_code: '', full_name: '', position: '', client_company: '', start_date: '', daily_wage: '', phone: '', email: '' };

export default function EmployeesTab({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any>(null);
  const [paste, setPaste] = useState('');
  const [inviteNew, setInviteNew] = useState(true);
  const [bulkInvite, setBulkInvite] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const [view, setView] = useState<any>(null);
  const [vfiles, setVfiles] = useState<any[]>([]);
  const [vdocs, setVdocs] = useState<any[]>([]);
  const [vreqs, setVreqs] = useState<any[]>([]);

  const load = useCallback(async () => {
    let query = supabase.from('employees').select('*').order('emp_code').limit(100);
    const t = q.trim().replace(/[%,()]/g, '');
    if (t) query = query.or(`emp_code.ilike.%${t}%,full_name.ilike.%${t}%,client_company.ilike.%${t}%,email.ilike.%${t}%`);
    const { data } = await query; setRows(data || []);
  }, [q]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);

  async function save() {
    const f = form; if (!f.emp_code || !f.full_name) { setMsg({ t: 'err', s: 'กรอกรหัสและชื่อ-สกุล' }); return; }
    const row: any = { emp_code: f.emp_code.trim(), full_name: f.full_name.trim(), position: f.position || null, client_company: f.client_company || null,
      start_date: f.start_date || null, daily_wage: Number(f.daily_wage) || 0, phone: f.phone || null, email: f.email ? f.email.trim().toLowerCase() : null, updated_at: new Date().toISOString() };
    const isNew = !f.id;
    const { data: saved, error } = await supabase.from('employees').upsert(row, { onConflict: 'emp_code' }).select('id');
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    let note = '';
    if (isNew && inviteNew && row.email && saved?.[0]) note = ' · ' + await callInvite([saved[0].id], false);
    else if (isNew && inviteNew && !row.email) note = ' · ไม่ได้ส่งอีเมล เพราะไม่ได้ใส่อีเมล';
    setMsg({ t: 'ok', s: 'บันทึกแล้ว' + note }); setForm(null); load();
  }
  async function importPaste() {
    const rows = parseTable(paste).filter(r => r.length >= 2 && !/^(รหัส|emp)/i.test(r[0]));
    const up = rows.map(r => ({ emp_code: r[0], full_name: r[1], position: r[2] || null, client_company: r[3] || null,
      start_date: /^\d{4}-\d{2}-\d{2}$/.test(r[4] || '') ? r[4] : null, daily_wage: Number((r[5] || '0').replace(/,/g, '')) || 0, phone: r[6] || null, email: r[7] ? r[7].toLowerCase() : null }));
    const codes = up.map(u => u.emp_code); const existing = new Set<string>();
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await supabase.from('employees').select('emp_code').in('emp_code', codes.slice(i, i + 200));
      (data || []).forEach((x: any) => existing.add(x.emp_code));
    }
    for (let i = 0; i < up.length; i += 500) {
      const { error } = await supabase.from('employees').upsert(up.slice(i, i + 500), { onConflict: 'emp_code' });
      if (error) { setMsg({ t: 'err', s: error.message }); return; }
    }
    const fresh = up.filter(u => !existing.has(u.emp_code) && u.email).map(u => u.emp_code);
    let note = '';
    if (bulkInvite && fresh.length) {
      const ids: string[] = [];
      for (let i = 0; i < fresh.length; i += 200) { const { data } = await supabase.from('employees').select('id').in('emp_code', fresh.slice(i, i + 200)); (data || []).forEach((x: any) => ids.push(x.id)); }
      note = ' · ' + await callInvite(ids, false);
    }
    setMsg({ t: 'ok', s: `นำเข้า/อัปเดต ${up.length} รายการ (ใหม่ ${up.filter(u => !existing.has(u.emp_code)).length})` + note }); setPaste(''); load();
  }
  async function resend(e: any) {
    if (!confirm(`ส่งอีเมลแจ้งสิทธิ์เข้าใช้ระบบให้ ${e.full_name} (${e.email})?`)) return;
    setMsg({ t: 'ok', s: await callInvite([e.id], true) }); load();
  }
  async function toggle(e: any) { await supabase.from('employees').update({ active: !e.active }).eq('id', e.id); load(); }
  async function openView(e: any) {
    setView(e);
    const [{ data: f }, { data: d }, { data: r }] = await Promise.all([
      supabase.from('employee_files').select('*').eq('employee_id', e.id).order('uploaded_at', { ascending: false }),
      supabase.from('signed_documents').select('*').eq('employee_id', e.id).order('signed_at', { ascending: false }),
      supabase.from('advance_requests').select('*, pay_periods(label)').eq('employee_id', e.id).order('created_at', { ascending: false }),
    ]); setVfiles(f || []); setVdocs(d || []); setVreqs(r || []);
  }
  const LBL: Record<string, string> = { id_card: 'บัตรประชาชน', house_registration: 'ทะเบียนบ้าน', bank_book: 'สมุดบัญชี', loan_contract: 'สัญญา', deduction_consent: 'ใบยินยอมหัก' };

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field" style={{ flex: 3 }}><label>ค้นหาพนักงาน</label><input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="รหัส / ชื่อ / บริษัท / อีเมล" /></div>
        {canEdit && <div style={{ flex: 'none', marginBottom: 12 }}><button className="btn" onClick={() => setForm({ ...blank })}>+ เพิ่มพนักงาน</button></div>}
      </div>
      {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
      <div className="tablewrap"><table>
        <thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>บริษัท</th><th className="right">ค่าจ้าง/วัน</th><th>อีเมล</th><th>เข้าระบบ</th><th></th></tr></thead>
        <tbody>{rows.map(e => <tr key={e.id} style={{ opacity: e.active ? 1 : .5 }}>
          <td>{e.emp_code}</td><td>{e.full_name}<div className="label">{e.position}</div></td><td>{e.client_company}</td><td className="right">{baht(e.daily_wage)}</td>
          <td>{e.email || <span className="label">ยังไม่มีอีเมล</span>}</td><td>{e.user_id ? <span className="badge ok">แล้ว</span> : <span className="badge mute">ยัง</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost sm" onClick={() => openView(e)}>เอกสาร</button>
            {canEdit && <> {e.email && <button className="btn ghost sm" title={e.invited_at ? 'เคยส่งแล้ว ' + dateTimeTH(e.invited_at) : 'ยังไม่เคยส่ง'} onClick={() => resend(e)}>{e.invited_at ? 'ส่งอีเมลอีกครั้ง' : 'ส่งอีเมลเชิญ'}</button>} <button className="btn ghost sm" onClick={() => setForm({ ...e, daily_wage: String(e.daily_wage), start_date: e.start_date || '', position: e.position || '', client_company: e.client_company || '', phone: e.phone || '', email: e.email || '' })}>แก้ไข</button>
              {' '}<button className="btn ghost sm" onClick={() => toggle(e)}>{e.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></>}</td></tr>)}</tbody></table></div>
      <p className="label">แสดงสูงสุด 100 รายการ ใช้ช่องค้นหาเพื่อหาคนอื่น</p>

      {canEdit && <>
        <h2 style={{ marginTop: 20 }}>นำเข้าพนักงานจาก Excel</h2>
        <p className="sub">คัดลอกจาก Excel วางทีละบรรทัด คอลัมน์: รหัส, ชื่อ-สกุล, ตำแหน่ง, บริษัท, วันเริ่มงาน (ปี-เดือน-วัน เช่น 2022-03-01), ค่าจ้างรายวัน, เบอร์โทร, อีเมล (รหัสซ้ำจะอัปเดตข้อมูลเดิม)</p>
        <textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'VTA-0001\tสมชาย รักดี\tพนักงานคลัง\tบริษัท ตัวอย่าง จำกัด\t2022-03-01\t350\t0812345678\tsomchai@example.com'} />
        <div className="check"><input id="binv" type="checkbox" checked={bulkInvite} onChange={e => setBulkInvite(e.target.checked)} /><label htmlFor="binv">ส่งอีเมลแจ้งพนักงานใหม่ที่นำเข้าพร้อมกัน (เฉพาะคนที่เพิ่งเพิ่มและมีอีเมล) — ปิดไว้ก่อนถ้ายังไม่พร้อมเปิดระบบ</label></div>
        <p><button className="btn" disabled={!paste.trim()} onClick={importPaste}>นำเข้า</button></p></>}

      {form && <div className="overlay"><div className="modal">
        <h2>{form.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h2>
        {[['emp_code', 'รหัสพนักงาน'], ['full_name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['client_company', 'บริษัทที่ประจำ'], ['phone', 'เบอร์โทร'], ['email', 'อีเมล (ใช้ล็อกอิน)']].map(([k, l]) =>
          <div className="field" key={k}><label>{l}</label><input type="text" value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} disabled={k === 'emp_code' && !!form.id} /></div>)}
        <div className="row"><div className="field"><label>วันเริ่มงาน</label><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="field"><label>ค่าจ้างรายวัน (บาท)</label><input type="number" value={form.daily_wage} onChange={e => setForm({ ...form, daily_wage: e.target.value })} /></div></div>
        {!form.id && <div className="check"><input id="inv" type="checkbox" checked={inviteNew} onChange={e => setInviteNew(e.target.checked)} /><label htmlFor="inv">ส่งอีเมลแจ้งพนักงานว่าเข้าใช้ระบบได้แล้ว</label></div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" style={{ flex: 'none' }} onClick={() => setForm(null)}>ยกเลิก</button><button className="btn" style={{ flex: 'none' }} onClick={save}>บันทึก</button></div>
      </div></div>}

      {view && <div className="overlay"><div className="modal" style={{ maxWidth: 680 }}>
        <h2>เอกสารของ {view.full_name}</h2>
        <p className="label">ไฟล์แนบ (ฉบับล่าสุด)</p>
        {vfiles.length === 0 && <p className="sub">ยังไม่มี</p>}
        {['id_card', 'house_registration', 'bank_book'].map(k => {
          const all = vfiles.filter(f => f.kind === k); const f = all[0]; if (!f) return null;
          return <div key={k} style={{ marginBottom: 6 }}><button className="btn ghost sm" onClick={() => openPrivate('employee-files', f.storage_path)}>{LBL[k]}</button> <span className="label">{dateTimeTH(f.uploaded_at)}{all.length > 1 ? ` · มีไฟล์เก่า ${all.length - 1} ฉบับ` : ''}</span>
            {all.slice(1).map(o => <button key={o.id} className="btn ghost sm" style={{ marginLeft: 6, opacity: .7 }} onClick={() => openPrivate('employee-files', o.storage_path)}>{dateTimeTH(o.uploaded_at)}</button>)}</div>;
        })}
        <p className="label" style={{ marginTop: 14 }}>สัญญาและใบยินยอมให้หักเงิน แยกตามคำขอเบิก</p>
        {vreqs.length === 0 && <p className="sub">ยังไม่มีคำขอเบิก</p>}
        {vreqs.map(r => {
          const docs = vdocs.filter(d => d.request_id === r.id);
          const okState = ['approved', 'transferred', 'deducted'].includes(r.status);
          const pick = (t: string) => okState && r.hr_at ? docs.find(d => d.doc_type === t && d.signed_at >= r.hr_at) : undefined;
          const cur = pick('deduction_consent'); const cont = pick('loan_contract'); const old = docs.filter(d => d !== cur && d !== cont);
          return <div key={r.id} className="card" style={{ boxShadow: 'none', border: '1px solid var(--line)', padding: '12px 14px', marginBottom: 8 }}>
            <div><b>{dateTimeTH(r.created_at)}</b> · {r.pay_periods?.label} <span className={'badge ' + STATUS_TONE[r.status]} style={{ marginLeft: 6 }}>{STATUS_TH[r.status]}</span></div>
            <div className="label">ขอ {baht(r.requested_amount)}{['pending_hr', 'rejected', 'cancelled'].includes(r.status) ? '' : ` · อนุมัติ ${baht(r.amount)} · ยอดหัก ${baht(r.total_deduct)}`}</div>
            <div style={{ marginTop: 6 }}>
              {okState ? <>
                {cont ? <button className="btn ghost sm" style={{ marginRight: 6 }} onClick={() => openPrivate('signed-docs', cont.pdf_path)}>สัญญา (ฉบับที่ใช้)</button> : <span className="label" style={{ marginRight: 8 }}>ไม่มีสัญญา</span>}
                {cur ? <button className="btn ghost sm" onClick={() => openPrivate('signed-docs', cur.pdf_path)}>ใบยินยอมหัก (ฉบับที่ใช้)</button> : <span className="label">ไม่มีใบยินยอมหัก</span>}
                {(cur || cont) && <div className="label" style={{ marginTop: 4 }}>เซ็น {dateTimeTH((cur || cont).signed_at)} · IP {(cur || cont).signed_ip || '-'} · {String((cur || cont).sha256).slice(0, 10)}…</div>}</>
                : <span className="label">{r.status === 'pending_sign' ? 'รอพนักงานเซ็นตามยอดที่อนุมัติ' : r.status === 'pending_hr' ? 'รอ HR อนุมัติยอดก่อน จึงจะเซ็นเอกสาร' : 'ไม่มีเอกสารที่ใช้'}</span>}
            </div>
            {old.length > 0 && <details style={{ marginTop: 6 }}><summary className="label" style={{ cursor: 'pointer' }}>เอกสารเก่าที่ไม่ใช้แล้ว ({old.length})</summary>
              {old.map(d => <div key={d.id} style={{ marginTop: 4 }}><button className="btn ghost sm" style={{ opacity: .7 }} onClick={() => openPrivate('signed-docs', d.pdf_path)}>{d.doc_type === 'loan_contract' ? 'สัญญา (ระบบเดิม)' : 'ใบยินยอมหัก (ก่อนอนุมัติยอด)'}</button> <span className="label">{dateTimeTH(d.signed_at)}</span></div>)}</details>}
          </div>;
        })}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" style={{ flex: 'none' }} onClick={() => setView(null)}>ปิด</button></div>
      </div></div>}
    </div>
  );
}
