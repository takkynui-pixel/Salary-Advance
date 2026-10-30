'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SignaturePad, { PadHandle } from './SignaturePad';
import { Employee } from './AuthProvider';
import { baht } from '@/lib/format';
import { beParts } from '@/lib/thai';
import { LoanProfile } from '@/lib/loanTypes';

const pdfLib = () => import('@/lib/pdf');

export type Req = { id: string; status?: string; amount: number; requested_amount?: number; fee: number; transfer_fee: number; total_deduct: number; created_at: string };

export function refNo(req: Req) {
  const p = beParts(new Date(req.created_at));
  return `SA-${p.y}${p.m.padStart(2, '0')}-${req.id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}
const dataUrlToBytes = (u: string) => Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0));

export default function SignDialog({ emp, req, profile, marketing, only, onClose, onDone }: {
  emp: Employee; req: Req; profile: LoanProfile; marketing: boolean; only?: 'contract'; onClose: () => void; onDone: () => void;
}) {
  const pad = useRef<PadHandle>(null);
  const sigData = useRef<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const inputs = (sig: Uint8Array | null, at: Date) => ({
    refNo: refNo(req), fullName: emp.full_name, empCode: emp.emp_code, position: emp.position || '', company: emp.client_company || '',
    startDate: emp.start_date, signedAt: at, amount: Number(req.amount), fee: Number(req.fee), transferFee: Number(req.transfer_fee),
    total: Number(req.total_deduct), signaturePng: sig,
  });

  const contractInputs = (sig: Uint8Array | null, at: Date) => ({
    refNo: refNo(req), fullName: emp.full_name, empCode: emp.emp_code, position: emp.position || '', company: emp.client_company || '',
    startDate: emp.start_date, signedAt: at, amount: Number(req.amount),
    profile: { ...profile, email: profile.email || emp.email || '' }, marketingConsent: marketing, signaturePng: sig,
  });

  async function preview() {
    setBusy(true); setErr('');
    try {
      const { buildDeduction, buildContract } = await pdfLib();
      const now = new Date();
      const c = await buildContract(contractInputs(null, now));
      window.open(URL.createObjectURL(new Blob([c as BlobPart], { type: 'application/pdf' })), '_blank');
      if (only !== 'contract') {
        const b = await buildDeduction(inputs(null, now));
        window.open(URL.createObjectURL(new Blob([b as BlobPart], { type: 'application/pdf' })), '_blank');
      }
    } catch (e: any) { setErr('สร้างตัวอย่างเอกสารไม่สำเร็จ: ' + e.message); }
    setBusy(false);
  }

  async function confirmAndSign() {
    if (!pad.current || pad.current.isEmpty()) { setErr('กรุณาเซ็นชื่อก่อน'); return; }
    sigData.current = pad.current.toPng();
    setBusy(true); setErr('');
    try {
      const at = new Date();
      const sig = dataUrlToBytes(sigData.current);
      const { buildDeduction, buildContract, sha256Hex } = await pdfLib();
      let ip: string | null = null;
      try { ip = (await (await fetch('/api/ip')).json()).ip; } catch { /* ignore */ }
      const stamp = at.getTime();
      const base = `${emp.id}/${req.id}-${stamp}`;
      const sigPath = `${base}-signature.png`;
      const upSig = await supabase.storage.from('signed-docs').upload(sigPath, new Blob([sig as BlobPart], { type: 'image/png' }), { contentType: 'image/png' });
      if (upSig.error) throw new Error(upSig.error.message);
      const docs: [string, Uint8Array, 'loan_contract' | 'deduction_consent'][] = [
        [`${base}-contract.pdf`, await buildContract(contractInputs(sig, at)), 'loan_contract'],
      ];
      if (only !== 'contract') docs.push([`${base}-deduction.pdf`, await buildDeduction(inputs(sig, at)), 'deduction_consent']);
      for (const [path, bytes, type] of docs) {
        const up = await supabase.storage.from('signed-docs').upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        if (up.error) throw new Error(up.error.message);
        const ins = await supabase.from('signed_documents').insert({
          employee_id: emp.id, request_id: req.id, doc_type: type, pdf_path: path, sha256: await sha256Hex(bytes), signature_path: sigPath,
          otp_verified: false, signed_ip: ip, signed_user_agent: navigator.userAgent.slice(0, 250), signed_at: at.toISOString(),
        });
        if (ins.error) throw new Error(ins.error.message);
      }
      if (req.status === 'pending_sign') {
        const done = await supabase.rpc('complete_signing', { p_id: req.id });
        if (done.error) throw new Error(done.error.message);
      }
      onDone();
    } catch (e: any) { setErr('เซ็นเอกสารไม่สำเร็จ: ' + e.message + ' (กดลองใหม่ได้ ข้อมูลคำขอยังอยู่)'); }
    setBusy(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="เซ็นใบยินยอมให้หักเงิน">
      <div className="modal">
        <h2>{only === 'contract' ? 'เซ็นสัญญาเพิ่มเติม' : 'เซ็นสัญญาและใบยินยอมให้หักเงิน'}</h2>
        <p className="sub">HR อนุมัติ <b>{baht(req.amount)}</b> บาท{req.requested_amount && Number(req.requested_amount) !== Number(req.amount) ? ` (ที่ขอ ${baht(req.requested_amount)})` : ''} · ค่าธรรมเนียม {baht(req.fee)} · ค่าโอน {baht(req.transfer_fee)} · ยอดหักจากเงินเดือน <b>{baht(req.total_deduct)} บาท</b></p>
        <div>
          <button className="btn ghost sm" onClick={preview} disabled={busy}>{busy ? 'กำลังสร้าง...' : 'ดูตัวอย่างเอกสารก่อนเซ็น'}</button>
          <p className="label" style={{ margin: '12px 0 6px' }}>เซ็นชื่อในกรอบด้านล่าง (ใช้นิ้วหรือเมาส์)</p>
          <SignaturePad ref={pad} onChange={setEmpty} />
          <p><button className="btn ghost sm" onClick={() => pad.current?.clear()}>ล้างลายเซ็น</button></p>
          <div className="check"><input id="ag" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <label htmlFor="ag">ข้าพเจ้าได้อ่านและเข้าใจแบบคำขอสินเชื่อ สัญญากู้ยืมเงิน บันทึกการรับเงินกู้ และใบยินยอมให้หักเงิน ตกลงตามเอกสารทั้งหมด และยินยอมให้บริษัทหักเงินจำนวน {baht(req.total_deduct)} บาท จากค่าจ้างในรอบจ่ายถัดไป</label></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ flex: 'none' }} onClick={onClose}>ปิด (เซ็นภายหลัง)</button>
            <button className="btn" style={{ flex: 'none' }} disabled={empty || !agree || busy} onClick={confirmAndSign}>{busy ? 'กำลังสร้างเอกสาร...' : 'ยืนยันและเซ็นเอกสาร'}</button>
          </div>
        </div>

        {err && <div className="msg err" role="alert">{err}</div>}
      </div>
    </div>
  );
}
