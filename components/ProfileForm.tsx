'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Employee } from './AuthProvider';
import { LoanProfile, Addr } from '@/lib/loanTypes';

export const REQUIRED_MSG = 'กรอกข้อมูลที่จำเป็นให้ครบ: วันเกิด, เลขบัตรประชาชน, สถานะ, เบอร์โทร, ที่อยู่ตามทะเบียนบ้าน, บัญชีธนาคาร, บุคคลติดต่อ';
export function profileComplete(p: LoanProfile): boolean {
  return !!(p.birthDate && p.idNumber.replace(/\D/g, '').length === 13 && p.marital && p.phone && p.reg.no && p.reg.subdistrict && p.reg.district &&
    p.reg.province && p.reg.postal && p.bankName && p.bankAccountName && p.bankAccountNo && p.contactName && p.contactPhone);
}

function T({ label, v, on, type = 'text', ph }: { label: string; v: string; on: (s: string) => void; type?: string; ph?: string }) {
  return <div className="field"><label>{label}</label><input type={type} value={v} placeholder={ph} onChange={e => on(e.target.value)} /></div>;
}
function AddrFields({ a, on }: { a: Addr; on: (a: Addr) => void }) {
  const s = (k: keyof Addr) => (v: string) => on({ ...a, [k]: v });
  return (
    <div className="row">
      <T label="เลขที่" v={a.no} on={s('no')} /><T label="หมู่ที่" v={a.moo} on={s('moo')} /><T label="ซอย/ตรอก" v={a.soi} on={s('soi')} />
      <T label="ถนน" v={a.road} on={s('road')} /><T label="ตำบล/แขวง" v={a.subdistrict} on={s('subdistrict')} /><T label="อำเภอ/เขต" v={a.district} on={s('district')} />
      <T label="จังหวัด" v={a.province} on={s('province')} /><T label="รหัสไปรษณีย์" v={a.postal} on={s('postal')} />
    </div>
  );
}

export default function ProfileForm({ emp, initial, marketing, onSaved }: {
  emp: Employee; initial: LoanProfile; marketing: boolean; onSaved: (p: LoanProfile, m: boolean) => void;
}) {
  const [p, setP] = useState<LoanProfile>(initial);
  const [mk, setMk] = useState(marketing);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const set = <K extends keyof LoanProfile>(k: K) => (v: LoanProfile[K]) => setP(x => ({ ...x, [k]: v }));
  const str = (k: keyof LoanProfile) => (v: string) => setP(x => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('loan_applications').upsert({ employee_id: emp.id, data: p, marketing_consent: mk, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) setMsg({ t: 'err', s: 'บันทึกไม่สำเร็จ: ' + error.message });
    else { setMsg({ t: 'ok', s: profileComplete(p) ? 'บันทึกแล้ว ข้อมูลครบถ้วน' : 'บันทึกแล้ว แต่ยังกรอกไม่ครบ — ' + REQUIRED_MSG }); onSaved(p, mk); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>ข้อมูลส่วนตัว</h2>
        <p className="sub">ข้อมูลนี้จะถูกพิมพ์ลงในแบบคำขอสินเชื่อและสัญญาโดยอัตโนมัติ</p>
        <div className="row">
          <div className="field"><label>ชื่อ-สกุล</label><input value={emp.full_name} disabled /></div>
          <div className="field"><label>รหัสพนักงาน</label><input value={emp.emp_code} disabled /></div>
        </div>
        <div className="row">
          <T label="วันเกิด" type="date" v={p.birthDate} on={str('birthDate')} />
          <T label="สัญชาติ" v={p.nationality} on={str('nationality')} />
          <T label="เลขบัตรประชาชน 13 หลัก" v={p.idNumber} on={str('idNumber')} ph="x-xxxx-xxxxx-xx-x" />
        </div>
        <div className="row">
          <div className="field"><label>สถานะ</label>
            <select value={p.marital} onChange={e => set('marital')(e.target.value as LoanProfile['marital'])}>
              <option value="">เลือก</option><option value="single">โสด</option><option value="married">สมรส</option><option value="divorced">หย่า/ร้าง</option></select></div>
          <T label="จำนวนบุตร" v={p.children} on={str('children')} type="number" />
          <div className="field"><label>ระดับการศึกษา</label>
            <select value={p.education} onChange={e => set('education')(e.target.value as LoanProfile['education'])}>
              <option value="">เลือก</option><option value="0">ต่ำกว่ามัธยม 6</option><option value="1">อนุปริญญา</option><option value="2">ปริญญาตรี</option><option value="3">สูงกว่าปริญญาตรี</option></select></div>
        </div>
        <div className="row">
          <T label="เบอร์โทรติดต่อ" type="tel" v={p.phone} on={str('phone')} />
          <T label="อีเมล" type="email" v={p.email || emp.email || ''} on={str('email')} />
          <T label="ID Line" v={p.lineId} on={str('lineId')} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>ที่อยู่ตามทะเบียนบ้าน</h2>
        <AddrFields a={p.reg} on={set('reg')} />
        <div className="check"><input id="same" type="checkbox" checked={p.curSame} onChange={e => set('curSame')(e.target.checked)} /><label htmlFor="same">ที่อยู่ปัจจุบันเหมือนทะเบียนบ้าน</label></div>
        {!p.curSame && <><h2 style={{ marginTop: 12 }}>ที่อยู่ปัจจุบัน</h2><AddrFields a={p.cur} on={set('cur')} /></>}
        <div className="row" style={{ marginTop: 8 }}>
          <div className="field"><label>ประเภทที่อยู่อาศัย</label>
            <select value={p.housing} onChange={e => set('housing')(e.target.value as LoanProfile['housing'])}>
              <option value="">เลือก</option><option value="house">บ้านเดี่ยว</option><option value="twin">บ้านแฝด</option><option value="town">ทาวน์เฮาส์</option>
              <option value="shop">อาคารพาณิชย์</option><option value="condo">ห้องชุด</option><option value="flat">แฟลต/อพาร์ทเมนท์</option><option value="rent">บ้านเช่า/ห้องเช่า</option><option value="other">อื่นๆ</option></select></div>
          <div className="field"><label>กรรมสิทธิ์ที่อยู่อาศัย</label>
            <select value={p.ownership} onChange={e => set('ownership')(e.target.value as LoanProfile['ownership'])}>
              <option value="">เลือก</option><option value="own">ของตนเอง/คู่สมรส</option><option value="rent">เช่า</option><option value="welfare">บ้านพักสวัสดิการ</option><option value="with">อาศัยอยู่กับ...</option></select></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>ข้อมูลการทำงาน</h2>
        <div className="row">
          <div className="field"><label>บริษัท/หน่วยงานที่ปฏิบัติงาน</label><input value={emp.client_company || ''} disabled /></div>
          <div className="field"><label>ตำแหน่ง</label><input value={emp.position || ''} disabled /></div>
          <div className="field"><label>วันเริ่มทำงาน</label><input value={emp.start_date || ''} disabled /></div>
        </div>
        <div className="row">
          <T label="ที่อยู่ที่ทำงาน" v={p.workAddress} on={str('workAddress')} /><T label="รหัสไปรษณีย์ที่ทำงาน" v={p.workPostal} on={str('workPostal')} /><T label="เบอร์ที่ทำงาน" v={p.workPhone} on={str('workPhone')} />
        </div>
        <div className="row">
          <T label="อายุงานปัจจุบัน (ปี)" v={p.yearsHere} on={str('yearsHere')} /><T label="เงินเดือน/รายได้ต่อเดือน (บาท)" v={p.salary} on={str('salary')} />
        </div>
      </div>

      {p.marital === 'married' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>ข้อมูลคู่สมรส</h2>
          <div className="row"><T label="ชื่อ-สกุลคู่สมรส" v={p.spouseName} on={str('spouseName')} /><T label="สถานที่ทำงาน" v={p.spouseWorkplace} on={str('spouseWorkplace')} /><T label="เบอร์ติดต่อ" v={p.spousePhone} on={str('spousePhone')} /></div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>ค่าใช้จ่ายต่อเดือน (ไม่บังคับ)</h2>
        <div className="row">
          <T label="ค่าอุปโภคบริโภค" v={p.exp.living} on={v => set('exp')({ ...p.exp, living: v })} /><T label="ค่าที่พักอาศัย" v={p.exp.housing} on={v => set('exp')({ ...p.exp, housing: v })} />
          <T label="ค่าผ่อนรถ" v={p.exp.car} on={v => set('exp')({ ...p.exp, car: v })} /><T label="ค่าผ่อนบ้าน" v={p.exp.home} on={v => set('exp')({ ...p.exp, home: v })} />
          <T label="ค่าใช้จ่ายอื่นๆ" v={p.exp.other} on={v => set('exp')({ ...p.exp, other: v })} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>บัญชีรับเงิน</h2>
        <div className="row"><T label="ธนาคาร" v={p.bankName} on={str('bankName')} /><T label="ชื่อบัญชี" v={p.bankAccountName} on={str('bankAccountName')} /><T label="เลขที่บัญชี" v={p.bankAccountNo} on={str('bankAccountNo')} /></div>
        <p className="sub">ชื่อบัญชีต้องตรงกับชื่อของพนักงาน บริษัทจะโอนเงินเข้าบัญชีนี้เท่านั้น</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>บุคคลติดต่อ (บุคคลอ้างอิง/ญาติ)</h2>
        <div className="row"><T label="ชื่อ-สกุล" v={p.contactName} on={str('contactName')} /><T label="ความสัมพันธ์" v={p.contactRel} on={str('contactRel')} />
          <T label="เบอร์โทร" v={p.contactPhone} on={str('contactPhone')} /><T label="สถานที่ติดต่อ" v={p.contactPlace} on={str('contactPlace')} /></div>
        <div className="check"><input id="mk" type="checkbox" checked={mk} onChange={e => setMk(e.target.checked)} />
          <label htmlFor="mk">ยินยอมให้ใช้ข้อมูลเพื่อการตลาดและเสนอสิทธิประโยชน์/บริการในอนาคต (ไม่บังคับ — ไม่ยินยอมก็เบิกเงินได้)</label></div>
      </div>

      {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
    </div>
  );
}
