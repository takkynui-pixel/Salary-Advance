'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CompanyRow, cycleFor, hasTemplate } from '@/lib/cycle';
import { dateTH } from '@/lib/format';

const blank = { id: '', name: '', aliases: '', cycle_start_day: '', cycle_end_day: '', pay_day: '', active: true };

export default function CompaniesTab() {
  const [rows, setRows] = useState<(CompanyRow & { n: number })[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    const list = (data || []) as CompanyRow[];
    const counts = await Promise.all(list.map(c => supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', c.id)));
    setRows(list.map((c, i) => ({ ...c, n: counts[i].count ?? 0 })));
    const un = await supabase.from('employees').select('id', { count: 'exact', head: true }).is('company_id', null);
    setUnassigned(un.count ?? 0);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const f = form; const name = String(f.name || '').trim();
    if (!name) { setMsg({ t: 'err', s: 'กรอกชื่อบริษัท' }); return; }
    const num = (v: any) => (v === '' || v == null ? null : Number(v));
    const days = [num(f.cycle_start_day), num(f.cycle_end_day), num(f.pay_day)];
    if (days.some(d => d !== null && (!Number.isInteger(d) || d < 1 || d > 31))) { setMsg({ t: 'err', s: 'วันที่ต้องเป็นเลข 1–31' }); return; }
    if (days.some(d => d === null) && days.some(d => d !== null)) { setMsg({ t: 'err', s: 'แม่แบบรอบต้องกรอกครบทั้ง 3 ช่อง (หรือเว้นว่างทั้งหมด)' }); return; }
    const row: any = { name, aliases: String(f.aliases || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      cycle_start_day: days[0], cycle_end_day: days[1], pay_day: days[2], active: !!f.active };
    const { error } = f.id ? await supabase.from('companies').update(row).eq('id', f.id) : await supabase.from('companies').insert(row);
    if (error) { setMsg({ t: 'err', s: error.message.includes('duplicate') ? 'มีบริษัทชื่อนี้อยู่แล้ว' : error.message }); return; }
    setMsg({ t: 'ok', s: 'บันทึกแล้ว' }); setForm(null); load();
  }

  const now = new Date(); const ym: [number, number] = [now.getFullYear(), now.getMonth() + 1];
  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ flex: 3 }}><h2 style={{ margin: 0 }}>บริษัทลูกค้า</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>แต่ละบริษัทมีรอบค่าจ้าง วันจ่ายเงินเดือน และช่วงเบิกของตัวเอง (ช่วงเบิกกำหนดที่แท็บ "รอบ/รายงาน")</p></div>
        <div style={{ flex: 'none' }}><button className="btn" onClick={() => setForm({ ...blank })}>+ เพิ่มบริษัท</button></div>
      </div>
      {unassigned > 0 && <div className="msg err" style={{ marginTop: 12 }}>มีพนักงาน {unassigned} คนที่ยังไม่ได้ผูกกับบริษัท (ชื่อบริษัทไม่ตรงกับรายการนี้) พนักงานกลุ่มนี้จะขอเบิกไม่ได้จนกว่าจะแก้ที่แท็บ "พนักงาน" หรือเพิ่มชื่อที่ใช้เรียกในช่อง "ชื่อที่ใช้เรียกอื่น"</div>}
      {msg && <div className={'msg ' + (msg.t === 'ok' ? 'okm' : 'err')} role="status">{msg.s}</div>}
      <div className="stafflist" style={{ marginTop: 8 }}>
        {rows.map(c => {
          const t = hasTemplate(c) ? cycleFor(c, ym[0], ym[1]) : null;
          return <div className="staffrow" key={c.id} style={{ opacity: c.active ? 1 : .55 }}>
            <div className="who" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <div><b>{c.name}</b> <span className="badge mute">{c.n} คน</span>{!c.active && <span className="badge bad" style={{ marginLeft: 6 }}>ปิดใช้งาน</span>}</div>
              <div className="label">{t ? `รอบค่าจ้างวันที่ ${c.cycle_start_day}–${c.cycle_end_day} · จ่ายวันที่ ${c.pay_day} · ตัวอย่างเดือนนี้: ${dateTH(t.start)} – ${dateTH(t.end)} จ่าย ${dateTH(t.pay)}` : 'ยังไม่ได้ตั้งแม่แบบรอบค่าจ้าง (ต้องกรอกวันที่เองทุกครั้งที่สร้างรอบ)'}</div>
              {c.aliases.length > 0 && <div className="label">ชื่อที่ใช้เรียกอื่น: {c.aliases.join(', ')}</div>}
            </div>
            <div className="acts"><button className="btn ghost sm" onClick={() => setForm({ ...c, aliases: c.aliases.join(', '), cycle_start_day: c.cycle_start_day ?? '', cycle_end_day: c.cycle_end_day ?? '', pay_day: c.pay_day ?? '' })}>แก้ไข</button></div>
          </div>;
        })}
      </div>

      {form && <div className="overlay"><div className="modal">
        <h2>{form.id ? 'แก้ไขบริษัท' : 'เพิ่มบริษัท'}</h2>
        <div className="field"><label>ชื่อบริษัท (ชื่อหลักที่แสดง)</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label>ชื่อที่ใช้เรียกอื่น (คั่นด้วยจุลภาค ใช้จับคู่ตอนนำเข้า Excel เช่น VTA)</label><input type="text" value={form.aliases} onChange={e => setForm({ ...form, aliases: e.target.value })} /></div>
        <p className="label" style={{ margin: '4px 0' }}>แม่แบบรอบค่าจ้าง (ใช้คำนวณวันที่ตอนสร้างรอบ ปรับรายรอบได้ภายหลัง)</p>
        <div className="row">
          <div className="field"><label>รอบเริ่มวันที่</label><input type="number" min="1" max="31" value={form.cycle_start_day} onChange={e => setForm({ ...form, cycle_start_day: e.target.value })} /></div>
          <div className="field"><label>รอบสิ้นสุดวันที่ (31 = สิ้นเดือน)</label><input type="number" min="1" max="31" value={form.cycle_end_day} onChange={e => setForm({ ...form, cycle_end_day: e.target.value })} /></div>
          <div className="field"><label>จ่ายเงินเดือนวันที่</label><input type="number" min="1" max="31" value={form.pay_day} onChange={e => setForm({ ...form, pay_day: e.target.value })} /></div>
        </div>
        <p className="label">วันจ่ายคือวันที่นั้นที่ถัดจากวันสิ้นสุดรอบ เช่น รอบ 16–15 จ่ายวันที่ 26 = จ่าย 26 ของเดือนที่รอบสิ้นสุด · รอบ 1–30 จ่ายวันที่ 5 = จ่ายวันที่ 5 ของเดือนถัดไป · ถ้าเดือนไหนสั้นกว่าจะใช้วันสุดท้ายของเดือน</p>
        <div className="check"><input id="cact" type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /><label htmlFor="cact">เปิดใช้งานบริษัทนี้</label></div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" style={{ flex: 'none' }} onClick={() => setForm(null)}>ยกเลิก</button><button className="btn" style={{ flex: 'none' }} onClick={save}>บันทึก</button></div>
      </div></div>}
    </div>
  );
}
