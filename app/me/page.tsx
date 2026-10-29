'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import Shell from '@/components/Shell';
import ProfileForm, { profileComplete } from '@/components/ProfileForm';
import Uploads, { FileRow, openPrivate } from '@/components/Uploads';
import SignDialog, { Req } from '@/components/SignDialog';
import { LoanProfile, emptyProfile } from '@/lib/loanTypes';
import { baht, calcFee, dateTH, dateTimeTH, STATUS_TH, STATUS_TONE } from '@/lib/format';

const TABS = [{ key: 'home', label: 'ภาพรวม' }, { key: 'history', label: 'ประวัติ' }, { key: 'profile', label: 'ข้อมูลของฉัน' }];

export default function Me() {
  const { employee, session } = useAuth();
  const [tab, setTab] = useState('home');
  const [period, setPeriod] = useState<any>(null);
  const [days, setDays] = useState(0);
  const [avail, setAvail] = useState(0);
  const [settings, setSettings] = useState({ limit_pct: 0.7, fee_rate: 0.03, transfer_fee: 15 });
  const [reqs, setReqs] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [profile, setProfile] = useState<LoanProfile>(emptyProfile);
  const [marketing, setMarketing] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const [signing, setSigning] = useState<Req | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    const [{ data: per }, { data: st }, { data: rq }, { data: la }] = await Promise.all([
      supabase.from('pay_periods').select('*').eq('status', 'open').order('start_date', { ascending: false }).limit(1),
      supabase.from('app_settings').select('key,value'),
      supabase.from('advance_requests').select('*, pay_periods(label)').eq('employee_id', employee.id).order('created_at', { ascending: false }),
      supabase.from('loan_applications').select('*').eq('employee_id', employee.id).maybeSingle(),
    ]);
    const p = per?.[0] ?? null; setPeriod(p);
    if (st) setSettings(Object.fromEntries(st.map((s: any) => [s.key, Number(s.value)])) as any);
    setReqs(rq || []);
    if (la) { setProfile({ ...emptyProfile, ...(la.data as LoanProfile), reg: { ...emptyProfile.reg, ...(la.data as any)?.reg }, cur: { ...emptyProfile.cur, ...(la.data as any)?.cur }, exp: { ...emptyProfile.exp, ...(la.data as any)?.exp } }); setMarketing(!!la.marketing_consent); }
    if (p) {
      const [{ data: a }, { data: av }] = await Promise.all([
        supabase.from('attendance_days').select('days_worked').eq('employee_id', employee.id).eq('period_id', p.id).maybeSingle(),
        supabase.rpc('available_limit', { p_employee: employee.id, p_period: p.id }),
      ]);
      setDays(Number(a?.days_worked ?? 0)); setAvail(Number(av ?? 0));
    }
    const ids = (rq || []).map((r: any) => r.id);
    if (ids.length) { const { data: d } = await supabase.from('signed_documents').select('*').in('request_id', ids); setDocs(d || []); } else setDocs([]);
    setReady(true);
  }, [employee]);
  useEffect(() => { load(); }, [load]);

  const hasAllFiles = ['id_card', 'house_registration', 'bank_book'].every(k => files.some(f => f.kind === k));
  const complete = profileComplete(profile);
  const num = Number(amount) || 0;
  const fees = useMemo(() => calcFee(num, settings.fee_rate, settings.transfer_fee), [num, settings]);
  const gross = Math.round((employee?.daily_wage ?? 0) * days * settings.limit_pct * 100) / 100;
  const used = Math.max(0, gross - avail);
  const unsigned = reqs.filter(r => r.status === 'pending_hr' && !docs.some(d => d.request_id === r.id));

  async function submit() {
    setMsg(null);
    if (!complete || !hasAllFiles) { setMsg({ t: 'err', s: 'กรุณากรอกข้อมูลส่วนตัวและอัปโหลดเอกสารแนบให้ครบก่อน (แท็บ "ข้อมูลของฉัน")' }); return; }
    if (num <= 0) { setMsg({ t: 'err', s: 'กรอกยอดที่ต้องการเบิก' }); return; }
    if (num > avail) { setMsg({ t: 'err', s: 'ยอดเบิกเกินวงเงินคงเหลือ' }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('request_advance', { p_amount: num });
    setBusy(false);
    if (error) { setMsg({ t: 'err', s: error.message }); return; }
    setAmount(''); await load(); setSigning(data as Req);
  }
  async function cancel(id: string) {
    if (!confirm('ยกเลิกคำขอนี้?')) return;
    const { error } = await supabase.rpc('cancel_request', { p_id: id });
    if (error) alert(error.message); else load();
  }

  const first = (employee?.full_name || '').split(' ')[0];
  const greet = new Date().getHours() < 12 ? 'สวัสดีตอนเช้า' : new Date().getHours() < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <Shell need="employee" tabs={TABS} tab={tab} onTab={setTab}>
      {!employee ? (
        <div className="card" style={{ marginTop: 24 }}><h2>ยังไม่พบข้อมูลพนักงาน</h2><p className="sub">อีเมล {session?.user.email} ยังไม่ถูกผูกกับข้อมูลพนักงาน กรุณาติดต่อ HR</p></div>
      ) : <>
        <h1 className="hello">{greet}, {first}!</h1>
        {tab === 'home' && <>
          <p className="sub">{period ? `รอบ ${period.label} · ${dateTH(period.start_date)} – ${dateTH(period.end_date)}` : 'ยังไม่เปิดรอบการเบิก'}</p>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <div className="card hero">
              <div className="sub">วงเงินที่เบิกได้ตอนนี้</div>
              <div className="big">{baht(avail)}</div>
              <div className="sub" style={{ margin: '8px 0 0' }}>บาท · {settings.limit_pct * 100}% ของค่าจ้างที่ทำได้แล้ว</div>
            </div>
            <div className="card">
              <div className="label">วันทำงานสะสมในรอบ</div><div className="big" style={{ fontSize: 36 }}>{days}</div>
              <div className="label" style={{ marginTop: 8 }}>ค่าจ้างรายวัน {baht(employee.daily_wage)} บาท</div>
              <div className="label">วงเงินรวม {baht(gross)} · ใช้ไปแล้ว {baht(used)}</div>
            </div>
            <div className="card">
              <div className="label">ค่าบริการ</div><div className="big" style={{ fontSize: 36 }}>{settings.fee_rate * 100}%</div>
              <div className="label" style={{ marginTop: 8 }}>+ ค่าโอน {baht(settings.transfer_fee)} บาทต่อครั้ง</div>
              <div className="label">หักจากเงินเดือนในรอบจ่ายถัดไป</div>
            </div>
          </div>

          {(!complete || !hasAllFiles) && ready && <div className="msg inf">ก่อนเบิกครั้งแรก กรุณากรอกข้อมูลส่วนตัว ({complete ? 'ครบแล้ว' : 'ยังไม่ครบ'}) และอัปโหลดเอกสารแนบ 3 รายการ ({hasAllFiles ? 'ครบแล้ว' : 'ยังไม่ครบ'}) ที่แท็บ "ข้อมูลของฉัน"
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setTab('profile')}>ไปกรอกข้อมูล</button></div></div>}
          {unsigned.length > 0 && <div className="msg err">มีคำขอที่ยังไม่ได้เซ็นเอกสาร HR จะยังไม่เห็นคำขอนี้จนกว่าจะเซ็น
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setSigning(unsigned[0])}>เซ็นเอกสารตอนนี้</button></div></div>}

          <div className="card" style={{ maxWidth: 560 }}>
            <h2>ขอเบิกเงินล่วงหน้า</h2>
            <div className="field"><label htmlFor="amt">จำนวนที่ต้องการเบิก (บาท)</label>
              <input id="amt" type="number" inputMode="decimal" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder={`ไม่เกิน ${baht(avail)}`} disabled={!period} /></div>
            {num > 0 && <table><tbody>
              <tr><td>ยอดที่ได้รับโอน</td><td className="right">{baht(num)}</td></tr>
              <tr><td>ค่าบริการ {settings.fee_rate * 100}%</td><td className="right">{baht(fees.fee)}</td></tr>
              <tr><td>ค่าโอน</td><td className="right">{baht(fees.transferFee)}</td></tr>
              <tr><td><b>ยอดที่จะถูกหักจากเงินเดือน</b></td><td className="right"><b>{baht(fees.total)}</b></td></tr>
            </tbody></table>}
            {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
            <button className="btn" style={{ marginTop: 12 }} onClick={submit} disabled={busy || !period || avail <= 0}>{busy ? 'กำลังส่งคำขอ...' : 'ขอเบิกและเซ็นเอกสาร'}</button>
          </div>
        </>}

        {tab === 'history' && (
          <div className="card tablewrap">
            <h2>ประวัติการเบิก</h2>
            {reqs.length === 0 ? <p className="sub">ยังไม่มีรายการเบิก</p> : (
              <table><thead><tr><th>วันที่</th><th>รอบ</th><th className="right">ยอดเบิก</th><th className="right">ยอดหัก</th><th>สถานะ</th><th>เอกสาร</th><th></th></tr></thead><tbody>
                {reqs.map(r => {
                  const rd = docs.filter(d => d.request_id === r.id);
                  return <tr key={r.id}>
                    <td>{dateTimeTH(r.created_at)}</td><td>{r.pay_periods?.label}</td>
                    <td className="right">{baht(r.amount)}</td><td className="right">{baht(r.total_deduct)}</td>
                    <td><span className={'badge ' + STATUS_TONE[r.status]}>{STATUS_TH[r.status]}</span>{r.hr_note ? <div className="label">{r.hr_note}</div> : null}</td>
                    <td>{rd.map(d => <button key={d.id} className="btn ghost sm" style={{ marginRight: 6 }} onClick={() => openPrivate('signed-docs', d.pdf_path)}>{d.doc_type === 'loan_contract' ? 'สัญญา' : 'ใบยินยอมหัก'}</button>)}
                      {rd.length === 0 && r.status === 'pending_hr' && <button className="btn sm" onClick={() => setSigning(r)}>เซ็นเอกสาร</button>}</td>
                    <td>{r.status === 'pending_hr' && <button className="btn danger sm" onClick={() => cancel(r.id)}>ยกเลิก</button>}</td>
                  </tr>;
                })}
              </tbody></table>)}
          </div>
        )}

        {tab === 'profile' && <>
          <ProfileForm emp={employee} initial={profile} marketing={marketing} onSaved={(p, m) => { setProfile(p); setMarketing(m); }} />
          <div style={{ height: 16 }} />
          <Uploads employeeId={employee.id} onChange={setFiles} />
        </>}

        {signing && <SignDialog emp={employee} req={signing} profile={profile} marketing={marketing} email={session!.user.email!}
          onClose={() => setSigning(null)} onDone={() => { setSigning(null); setMsg({ t: 'ok', s: 'ส่งคำขอและเซ็นเอกสารเรียบร้อย รอ HR อนุมัติ' }); setTab('home'); load(); }} />}
      </>}
    </Shell>
  );
}
