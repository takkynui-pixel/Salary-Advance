'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export default function Login() {
  const { session, loading, role } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!loading && session) router.replace(role === 'hr' || role === 'finance' || role === 'admin' ? '/staff' : '/me');
  }, [loading, session, role, router]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    const mail = email.trim().toLowerCase();
    const { data: ok, error: e1 } = await supabase.rpc('email_allowed', { p_email: mail });
    if (e1) { setErr('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่'); setBusy(false); return; }
    if (!ok) { setErr('ไม่พบอีเมลนี้ในระบบ กรุณาติดต่อ HR เพื่อลงทะเบียนอีเมลของคุณ'); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) { setErr(error.message.includes('rate') ? 'ส่งรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' : 'ส่งรหัสไม่สำเร็จ: ' + error.message); return; }
    setStep('code'); setInfo('ส่งรหัส OTP ไปที่ ' + mail + ' แล้ว (ตรวจในกล่องจดหมายขยะด้วย)');
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr('รหัสไม่ถูกต้องหรือหมดอายุ');
  }

  return (
    <div className="shell"><div className="panel">
      <div className="center card">
        <img src="/logo.png" alt="VTA Service" className="loginlogo" />
        <h2 style={{ textAlign: 'center' }}>เข้าสู่ระบบเบิกเงินล่วงหน้า</h2>
        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <div className="field"><label htmlFor="em">อีเมลที่ลงทะเบียนกับบริษัท</label>
              <input id="em" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งรหัส OTP'}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <div className="msg inf">{info}</div>
            <div className="field"><label htmlFor="cd">รหัส OTP</label>
              <input id="cd" type="text" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} placeholder="รหัสจากอีเมล" /></div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</button>
            <p style={{ textAlign: 'center' }}><button type="button" className="btn ghost sm" onClick={() => { setStep('email'); setCode(''); setErr(''); }}>เปลี่ยนอีเมล / ขอรหัสใหม่</button></p>
          </form>
        )}
        {err && <div className="msg err" role="alert">{err}</div>}
      </div>
    </div></div>
  );
}
