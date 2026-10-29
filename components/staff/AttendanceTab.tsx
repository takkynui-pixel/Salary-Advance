'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { baht, parseTable } from '@/lib/format';

export default function AttendanceTab() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [pid, setPid] = useState('');
  const [emps, setEmps] = useState<any[]>([]);
  const [days, setDays] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [pct, setPct] = useState(0.7);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);

  useEffect(() => { (async () => {
    const { data } = await supabase.from('pay_periods').select('*').order('start_date', { ascending: false });
    setPeriods(data || []); if (data?.[0]) setPid(data[0].id);
    const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'limit_pct').maybeSingle(); if (s) setPct(Number(s.value));
    const all: any[] = []; for (let from = 0; ; from += 1000) {
      const { data: e } = await supabase.from('employees').select('id,emp_code,full_name,client_company,daily_wage').eq('active', true).order('emp_code').range(from, from + 999);
      all.push(...(e || [])); if (!e || e.length < 1000) break;
    }
    setEmps(all);
  })(); }, []);

  const loadDays = useCallback(async () => {
    if (!pid) return; const m: Record<string, number> = {};
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('attendance_days').select('employee_id,days_worked').eq('period_id', pid).range(from, from + 999);
      (data || []).forEach((r: any) => { m[r.employee_id] = Number(r.days_worked); }); if (!data || data.length < 1000) break;
    }
    setDays(m);
  }, [pid]);
  useEffect(() => { loadDays(); }, [loadDays]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = t ? emps.filter(e => (e.emp_code + e.full_name + (e.client_company || '')).toLowerCase().includes(t)) : emps;
    return f.slice(0, 100);
  }, [emps, q]);

  async function save(empId: string, v: string) {
    const n = Number(v); if (Number.isNaN(n) || n < 0 || n > 31) { setMsg({ t: 'err', s: 'วันทำงานต้องอยู่ระหว่าง 0–31' }); return; }
    if (days[empId] === n) return;
    const { error } = await supabase.from('attendance_days').upsert({ employee_id: empId, period_id: pid, days_worked: n, updated_at: new Date().toISOString() }, { onConflict: 'employee_id,period_id' });
    if (error) setMsg({ t: 'err', s: error.message }); else { setDays(d => ({ ...d, [empId]: n })); setMsg(null); }
  }
  async function importPaste() {
    const rows = parseTable(paste).filter(r => r.length >= 2); const byCode = new Map(emps.map(e => [e.emp_code, e.id]));
    const bad: string[] = []; const up: any[] = [];
    rows.forEach(r => { const id = byCode.get(r[0]); const n = Number(r[1]);
      if (!id || Number.isNaN(n) || n < 0 || n > 31) bad.push(r[0]); else up.push({ employee_id: id, period_id: pid, days_worked: n, updated_at: new Date().toISOString() }); });
    for (let i = 0; i < up.length; i += 500) {
      const { error } = await supabase.from('attendance_days').upsert(up.slice(i, i + 500), { onConflict: 'employee_id,period_id' });
      if (error) { setMsg({ t: 'err', s: error.message }); return; }
    }
    setMsg({ t: bad.length ? 'err' : 'ok', s: `นำเข้า ${up.length} รายการ` + (bad.length ? ` · ข้าม ${bad.length} รายการที่รหัสหรือค่าไม่ถูกต้อง (${bad.slice(0, 5).join(', ')}...)` : '') });
    setPaste(''); loadDays();
  }

  return (
    <div className="card">
      <h2>วันทำงานในรอบ</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="field"><label>รอบการจ่าย</label><select value={pid} onChange={e => setPid(e.target.value)}>{periods.map(p => <option key={p.id} value={p.id}>{p.label} ({p.status === 'open' ? 'เปิด' : 'ปิด'})</option>)}</select></div>
        <div className="field"><label>ค้นหา (รหัส/ชื่อ/บริษัท)</label><input type="text" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      {periods.length === 0 && <div className="msg inf">ยังไม่มีรอบ ไปสร้างที่แท็บ "รอบ/รายงาน" ก่อน</div>}
      {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
      <div className="tablewrap"><table>
        <thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>บริษัท</th><th className="right">ค่าจ้าง/วัน</th><th style={{ width: 120 }}>วันทำงาน</th><th className="right">วงเงิน {pct * 100}%</th></tr></thead>
        <tbody>{shown.map(e => <tr key={e.id}>
          <td>{e.emp_code}</td><td>{e.full_name}</td><td>{e.client_company}</td><td className="right">{baht(e.daily_wage)}</td>
          <td><input key={pid + e.id + (days[e.id] ?? '')} type="number" min="0" max="31" step="0.5" defaultValue={days[e.id] ?? ''} onBlur={ev => ev.target.value !== '' && save(e.id, ev.target.value)} aria-label={'วันทำงาน ' + e.full_name} /></td>
          <td className="right">{baht(Math.round(e.daily_wage * (days[e.id] ?? 0) * pct * 100) / 100)}</td></tr>)}</tbody></table></div>
      <p className="label">แสดงสูงสุด 100 รายการ ใช้ช่องค้นหาเพื่อหาคนอื่น · พิมพ์ค่าแล้วคลิกออกจากช่องเพื่อบันทึก</p>
      <h2 style={{ marginTop: 20 }}>นำเข้าจาก Excel</h2>
      <p className="sub">คัดลอก 2 คอลัมน์จาก Excel แล้ววาง: รหัสพนักงาน [แท็บ] วันทำงาน (ทีละบรรทัด)</p>
      <textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'VTA-0001\t10\nVTA-0002\t12.5'} />
      <p><button className="btn" disabled={!paste.trim() || !pid} onClick={importPaste}>นำเข้า</button></p>
    </div>
  );
}
