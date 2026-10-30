'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const LABELS: Record<string, string> = { limit_pct: 'สัดส่วนวงเงิน (0.70 = 70%)', fee_rate: 'ค่าธรรมเนียม (0.03 = 3%)', transfer_fee: 'ค่าโอนต่อครั้ง (บาท)', min_request: 'ยอดขอเบิกขั้นต่ำต่อครั้ง (บาท)' };

export default function SettingsTab() {
  const [s, setS] = useState<Record<string, string>>({});
  const [inv, setInv] = useState<any[]>([]);
  const [email, setEmail] = useState(''); const [role, setRole] = useState('hr');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const [chk, setChk] = useState<Record<string, string> | null>(null);
  const [chkBusy, setChkBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('app_settings').select('key,value'); setS(Object.fromEntries((data || []).map((r: any) => [r.key, String(r.value)])));
    const { data: i } = await supabase.from('staff_invites').select('*').order('created_at'); setInv(i || []);
  };
  useEffect(() => { load(); }, []);

  async function saveSettings() {
    for (const k of Object.keys(LABELS)) {
      const v = Number(s[k]); if (Number.isNaN(v) || v < 0) { setMsg({ t: 'err', s: 'ค่าไม่ถูกต้อง: ' + LABELS[k] }); return; }
      const { error } = await supabase.from('app_settings').update({ value: v, updated_at: new Date().toISOString() }).eq('key', k);
      if (error) { setMsg({ t: 'err', s: error.message }); return; }
    }
    setMsg({ t: 'ok', s: 'บันทึกแล้ว (มีผลกับคำขอใหม่ คำขอเดิมใช้ค่าตอนที่ขอ)' });
  }
  async function checkMail() {
    setChkBusy(true); setChk(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/mail-check', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    setChk(res.ok ? await res.json() : { error: 'ตรวจสอบไม่ได้ (' + res.status + ')' }); setChkBusy(false);
  }
  async function addInvite() {
    const e = email.trim().toLowerCase(); if (!e) return;
    const { error } = await supabase.from('staff_invites').upsert({ email: e, role });
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    // if the user already signed in before, promote immediately
    const { data: u } = await supabase.from('profiles').select('user_id').eq('display_name', e).maybeSingle();
    if (u) await supabase.from('profiles').update({ role }).eq('user_id', u.user_id);
    setEmail(''); setMsg({ t: 'ok', s: 'เพิ่มผู้ใช้งานแล้ว ให้เขาล็อกอินด้วยอีเมลนี้' }); load();
  }
  async function removeInvite(e: string) {
    if (!confirm('ลบสิทธิ์ของ ' + e + '? (ผู้ที่ล็อกอินแล้วต้องแก้บทบาทใน Supabase)')) return;
    await supabase.from('staff_invites').delete().eq('email', e); load();
  }

  return (
    <div className="grid g2">
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>ตรวจสอบระบบอีเมล</h2>
        <p className="sub">ทดสอบอีเมลของระบบ (แจ้งคำขอเบิก / เชิญพนักงาน) โดยส่งอีเมลทดสอบถึงอีเมลของคุณ · อีเมล OTP ตอนล็อกอินส่งโดย Supabase ต้องตั้ง SMTP ใน Supabase แยกต่างหาก (ดู README)</p>
        <button className="btn" onClick={checkMail} disabled={chkBusy}>{chkBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบและส่งอีเมลทดสอบ'}</button>
        {chk && <table style={{ marginTop: 12 }}><tbody>{Object.entries(chk).map(([k, v]) => <tr key={k}><td style={{ whiteSpace: 'nowrap' }}><b>{k}</b></td><td>{v}</td></tr>)}</tbody></table>}
      </div>
      <div className="card">
        <h2>อัตราและเงื่อนไข</h2>
        {Object.keys(LABELS).map(k => <div className="field" key={k}><label>{LABELS[k]}</label><input type="number" step="0.01" value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: e.target.value })} /></div>)}
        {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
        <button className="btn" onClick={saveSettings}>บันทึก</button>
      </div>
      <div className="card">
        <h2>ผู้ใช้งานฝั่งบริษัท</h2>
        <div className="row"><div className="field" style={{ flex: 2 }}><label>อีเมล</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label>บทบาท</label><select value={role} onChange={e => setRole(e.target.value)}><option value="hr">HR</option><option value="finance">การเงิน</option><option value="admin">แอดมิน</option></select></div></div>
        <button className="btn" onClick={addInvite}>เพิ่มผู้ใช้งาน</button>
        <table style={{ marginTop: 12 }}><tbody>{inv.map(i => <tr key={i.email}><td>{i.email}</td><td>{i.role}</td><td className="right"><button className="btn danger sm" onClick={() => removeInvite(i.email)}>ลบ</button></td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
