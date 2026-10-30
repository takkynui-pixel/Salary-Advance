'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SignaturePad, { PadHandle } from './SignaturePad';
import { Employee } from './AuthProvider';
import { baht } from '@/lib/format';
import { beParts } from '@/lib/thai';

const pdfLib = () => import('@/lib/pdf');

export type Req = { id: string; amount: number; requested_amount?: number; fee: number; transfer_fee: number; total_deduct: number; created_at: string };

export function refNo(req: Req) {
  const p = beParts(new Date(req.created_at));
  return `SA-${p.y}${p.m.padStart(2, '0')}-${req.id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}
const dataUrlToBytes = (u: string) => Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0));

export default function SignDialog({ emp, req, email, onClose, onDone }: {
  emp: Employee; req: Req; email: string; onClose: () => void; onDone: () => void;
}) {
  const pad = useRef<PadHandle>(null);
  const sigData = useRef<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const inputs = (sig: Uint8Array | null, at: Date) => ({
    refNo: refNo(req), fullName: emp.full_name, empCode: emp.emp_code, position: emp.position || '', company: emp.client_company || '',
    startDate: emp.start_date, signedAt: at, amount: Number(req.amount), fee: Number(req.fee), transferFee: Number(req.transfer_fee),
    total: Number(req.total_deduct), signaturePng: sig,
  });

  async function preview() {
    setBusy(true); setErr('');
    try {
      const { buildDeduction } = await pdfLib();
      const bytes = await buildDeduction(inputs(null, new Date()));
      window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), '_blank');
    } catch (e: any) { setErr('สร้างตัวอย่างเอกสารไม่สำเร็จ: ' + e.message); }
    setBusy(false);
  }

  async function sendOtp() {
    if (!pad.current || pad.current.isEmpty()) { setErr('กรุณาเซ็นชื่อก่อน'); return; }
    sigData.current = pad.current.toPng();
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setErr('ส่งรหัสไม่สำเร็จ: ' + error.message); return; }
    setInfo('ส่งรหัส OTP ไปที่ ' + email + ' แล้ว'); setStep(2);
  }

  async function confirmAndSign() {
    setBusy(true); setErr('');
    const v = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    if (v.error) { setErr('รหัส OTP ไม่ถูกต้องหรือหมดอายุ'); setBusy(false); return; }
    try {
      setStep(3);
      if (!sigData.current) throw new Error('ไม่พบลายเซ็น กรุณากลับไปเซ็นชื่อใหม่');
      const at = new Date();
      const sig = dataUrlToBytes(sigData.current);
      const { buildDeduction, sha256Hex } = await pdfLib();
      const bytes = await buildDeduction(inputs(sig, at));
      let ip: string | null = null;
      try { ip = (await (await fetch('/api/ip')).json()).ip; } catch { /* ignore */ }
      const stamp = at.getTime();
      const base = `${emp.id}/${req.id}-${stamp}`;
      const sigPath = `${base}-signature.png`; const pdfPath = `${base}-deduction.pdf`;
      const upSig = await supabase.storage.from('signed-docs').upload(sigPath, new Blob([sig as BlobPart], { type: 'image/png' }), { contentType: 'image/png' });
      if (upSig.error) throw new Error(upSig.error.message);
      const up = await supabase.storage.from('signed-docs').upload(pdfPath, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' });
      if (up.error) throw new Error(up.error.message);
      const ins = await supabase.from('signed_documents').insert({
        employee_id: emp.id, request_id: req.id, doc_type: 'deduction_consent', pdf_path: pdfPath, sha256: await sha256Hex(bytes), signature_path: sigPath,
        otp_verified: true, signed_ip: ip, signed_user_agent: navigator.userAgent.slice(0, 250), signed_at: at.toISOString(),
      });
      if (ins.error) throw new Error(ins.error.message);
      const done = await supabase.rpc('complete_signing', { p_id: req.id });
      if (done.error) throw new Error(done.error.message);
      onDone();
    } catch (e: any) { setErr('เซ็นเอกสารไม่สำเร็จ: ' + e.message + ' (กดลองใหม่ได้ ข้อมูลคำขอยังอยู่)'); setStep(2); }
    setBusy(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="เซ็นใบยินยอมให้หักเงิน">
      <div className="modal">
        <h2>เซ็นใบยินยอมให้หักเงิน</h2>
        <p className="sub">HR อนุมัติ <b>{baht(req.amount)}</b> บาท{req.requested_amount && Number(req.requested_amount) !== Number(req.amount) ? ` (ที่ขอ ${baht(req.requested_amount)})` : ''} · ค่าธรรมเนียม {baht(req.fee)} · ค่าโอน {baht(req.transfer_fee)} · ยอดหักจากเงินเดือน <b>{baht(req.total_deduct)} บาท</b></p>
        <div className="steps"><span className={'step ' + (step === 1 ? 'cur' : 'done')}>1 เซ็นชื่อ</span><span className={'step ' + (step === 2 ? 'cur' : step === 3 ? 'done' : '')}>2 ยืนยัน OTP</span><span className={'step ' + (step === 3 ? 'cur' : '')}>3 สร้างเอกสาร</span></div>

        <div style={{ display: step === 1 ? 'block' : 'none' }}>
          <button className="btn ghost sm" onClick={preview} disabled={busy}>{busy ? 'กำลังสร้าง...' : 'ดูตัวอย่างเอกสารก่อนเซ็น'}</button>
          <p className="label" style={{ margin: '12px 0 6px' }}>เซ็นชื่อในกรอบด้านล่าง (ใช้นิ้วหรือเมาส์)</p>
          <SignaturePad ref={pad} onChange={setEmpty} />
          <p><button className="btn ghost sm" onClick={() => pad.current?.clear()}>ล้างลายเซ็น</button></p>
          <div className="check"><input id="ag" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <label htmlFor="ag">ข้าพเจ้าได้อ่านและเข้าใจใบยินยอมให้หักเงิน และยินยอมให้บริษัทหักเงินจำนวน {baht(req.total_deduct)} บาท จากค่าจ้างในรอบจ่ายถัดไป</label></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ flex: 'none' }} onClick={onClose}>ปิด (เซ็นภายหลัง)</button>
            <button className="btn" style={{ flex: 'none' }} disabled={empty || !agree || busy} onClick={sendOtp}>ถัดไป: ส่งรหัส OTP</button>
          </div>
        </div>

        {step >= 2 && <>
          <div className="msg inf">{info}</div>
          <div className="field"><label htmlFor="otp">รหัส OTP จากอีเมล</label>
            <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} disabled={step === 3} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ flex: 'none' }} disabled={busy} onClick={() => { setStep(1); setCode(''); }}>กลับ</button>
            <button className="btn" style={{ flex: 'none' }} disabled={busy || code.trim().length < 6} onClick={confirmAndSign}>{step === 3 ? 'กำลังสร้างเอกสาร...' : 'ยืนยันและเซ็นเอกสาร'}</button>
          </div>
        </>}
        {err && <div className="msg err" role="alert">{err}</div>}
      </div>
    </div>
  );
}
