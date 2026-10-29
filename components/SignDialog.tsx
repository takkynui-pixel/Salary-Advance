'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SignaturePad, { PadHandle } from './SignaturePad';
const pdfLib = () => import('@/lib/pdf');
import { LoanProfile } from '@/lib/loanTypes';
import { Employee } from './AuthProvider';
import { baht } from '@/lib/format';
import { beParts } from '@/lib/thai';

export type Req = { id: string; amount: number; fee: number; transfer_fee: number; total_deduct: number; created_at: string };

function contractNo(req: Req) {
  const p = beParts(new Date(req.created_at));
  return `SA-${p.y}${p.m.padStart(2, '0')}-${req.id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}
async function inputsFor(emp: Employee, req: Req, profile: LoanProfile, marketing: boolean, sig: Uint8Array | null, at: Date) {
  return {
    fullName: emp.full_name, empCode: emp.emp_code, position: emp.position || '', company: emp.client_company || '',
    contractNo: contractNo(req), signedAt: at, amount: Number(req.amount), fee: Number(req.fee), transferFee: Number(req.transfer_fee),
    total: Number(req.total_deduct), profile: { ...profile, startDate: emp.start_date || profile.startDate, email: profile.email || emp.email || '' },
    marketingConsent: marketing, signaturePng: sig,
  };
}
const dataUrlToBytes = (u: string) => Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0));

export default function SignDialog({ emp, req, profile, marketing, email, onClose, onDone }: {
  emp: Employee; req: Req; profile: LoanProfile; marketing: boolean; email: string; onClose: () => void; onDone: () => void;
}) {
  const pad = useRef<PadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function preview() {
    setBusy(true); setErr('');
    try {
      const { buildPackage } = await pdfLib();
      const r = await buildPackage(await inputsFor(emp, req, profile, marketing, null, new Date()));
      window.open(URL.createObjectURL(new Blob([r.contract as BlobPart], { type: 'application/pdf' })), '_blank');
      window.open(URL.createObjectURL(new Blob([r.deduction as BlobPart], { type: 'application/pdf' })), '_blank');
    } catch (e: any) { setErr('สร้างตัวอย่างเอกสารไม่สำเร็จ: ' + e.message); }
    setBusy(false);
  }

  async function sendOtp() {
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
      const at = new Date();
      const sig = dataUrlToBytes(pad.current!.toPng());
      const { buildPackage, sha256Hex } = await pdfLib();
      const out = await buildPackage(await inputsFor(emp, req, profile, marketing, sig, at));
      let ip: string | null = null;
      try { ip = (await (await fetch('/api/ip')).json()).ip; } catch { /* ignore */ }
      const base = `${emp.id}/${req.id}`;
      const files: [string, Uint8Array, 'loan_contract' | 'deduction_consent'][] = [
        [`${base}-contract.pdf`, out.contract, 'loan_contract'], [`${base}-deduction.pdf`, out.deduction, 'deduction_consent'],
      ];
      const sigPath = `${base}-signature.png`;
      const upSig = await supabase.storage.from('signed-docs').upload(sigPath, new Blob([sig as BlobPart], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
      if (upSig.error && !/exists/i.test(upSig.error.message)) throw new Error(upSig.error.message);
      for (const [path, bytes, type] of files) {
        const up = await supabase.storage.from('signed-docs').upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        if (up.error && !/exists/i.test(up.error.message)) throw new Error(up.error.message);
        const ins = await supabase.from('signed_documents').insert({
          employee_id: emp.id, request_id: req.id, doc_type: type, pdf_path: path, sha256: await sha256Hex(bytes), signature_path: sigPath,
          otp_verified: true, signed_ip: ip, signed_user_agent: navigator.userAgent.slice(0, 250), signed_at: at.toISOString(),
        });
        if (ins.error) throw new Error(ins.error.message);
      }
      onDone();
    } catch (e: any) { setErr('เซ็นเอกสารไม่สำเร็จ: ' + e.message + ' (กดลองใหม่ได้ ข้อมูลคำขอยังอยู่)'); setStep(2); }
    setBusy(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="เซ็นเอกสาร">
      <div className="modal">
        <h2>ยืนยันและเซ็นเอกสาร</h2>
        <p className="sub">ยอดเบิก {baht(req.amount)} บาท · ค่าบริการ {baht(req.fee)} · ค่าโอน {baht(req.transfer_fee)} · ยอดหักจากเงินเดือน <b>{baht(req.total_deduct)} บาท</b></p>
        <div className="steps"><span className={'step ' + (step === 1 ? 'cur' : 'done')}>1 เซ็นชื่อ</span><span className={'step ' + (step === 2 ? 'cur' : step === 3 ? 'done' : '')}>2 ยืนยัน OTP</span><span className={'step ' + (step === 3 ? 'cur' : '')}>3 สร้างเอกสาร</span></div>

        {step === 1 && <>
          <button className="btn ghost sm" onClick={preview} disabled={busy}>{busy ? 'กำลังสร้าง...' : 'ดูตัวอย่างเอกสารก่อนเซ็น (2 ไฟล์)'}</button>
          <p className="label" style={{ margin: '12px 0 6px' }}>เซ็นชื่อในกรอบด้านล่าง (ใช้นิ้วหรือเมาส์)</p>
          <SignaturePad ref={pad} onChange={setEmpty} />
          <p><button className="btn ghost sm" onClick={() => pad.current?.clear()}>ล้างลายเซ็น</button></p>
          <div className="check"><input id="ag" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <label htmlFor="ag">ข้าพเจ้าได้อ่านและเข้าใจ แบบคำขอสินเชื่อ สัญญากู้ยืมเงิน บันทึกการรับเงินกู้ และใบยินยอมให้หักเงิน และตกลงตามเอกสารทั้งหมด รวมถึงยินยอมให้หักเงินตามรอบค่าจ้าง</label></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ flex: 'none' }} onClick={onClose}>ปิด (เซ็นภายหลัง)</button>
            <button className="btn" style={{ flex: 'none' }} disabled={empty || !agree || busy} onClick={sendOtp}>ถัดไป: ส่งรหัส OTP</button>
          </div>
        </>}

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
