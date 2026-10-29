'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateTimeTH } from '@/lib/format';

export const KINDS: { key: 'id_card' | 'house_registration' | 'bank_book'; label: string }[] = [
  { key: 'id_card', label: 'สำเนาบัตรประชาชน' },
  { key: 'house_registration', label: 'สำเนาทะเบียนบ้าน' },
  { key: 'bank_book', label: 'หน้าแรกสมุดบัญชีธนาคาร' },
];

export type FileRow = { id: string; kind: string; storage_path: string; uploaded_at: string };

export async function openPrivate(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  if (error || !data) { alert('เปิดไฟล์ไม่ได้'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

export default function Uploads({ employeeId, onChange }: { employeeId: string; onChange?: (files: FileRow[]) => void }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('employee_files').select('*').eq('employee_id', employeeId).order('uploaded_at', { ascending: false });
    setFiles((data as FileRow[]) || []); onChange?.((data as FileRow[]) || []);
  }, [employeeId, onChange]);
  useEffect(() => { load(); }, [load]);

  async function upload(kind: string, f: File | null) {
    if (!f) return; setErr('');
    if (f.size > 8 * 1024 * 1024) { setErr('ไฟล์ใหญ่เกิน 8 MB'); return; }
    if (!/^(image\/|application\/pdf)/.test(f.type)) { setErr('รองรับเฉพาะรูปภาพหรือ PDF'); return; }
    setBusy(kind);
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${employeeId}/${kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('employee-files').upload(path, f, { contentType: f.type });
    if (up.error) { setErr('อัปโหลดไม่สำเร็จ: ' + up.error.message); setBusy(null); return; }
    const ins = await supabase.from('employee_files').insert({ employee_id: employeeId, kind, storage_path: path });
    if (ins.error) setErr('บันทึกไม่สำเร็จ: ' + ins.error.message);
    setBusy(null); load();
  }

  return (
    <div className="card">
      <h2>เอกสารแนบ</h2>
      <p className="sub">ถ่ายรูปหรือเลือกไฟล์ (รูปภาพ/PDF ไม่เกิน 8 MB) ไฟล์ถูกเก็บแบบส่วนตัว เฉพาะ HR และการเงินเท่านั้นที่เปิดดูได้</p>
      <div className="grid g3">
        {KINDS.map(k => {
          const latest = files.find(f => f.kind === k.key);
          return (
            <div key={k.key} className="card" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 500 }}>{k.label}</div>
              <div className="label" style={{ margin: '4px 0 10px' }}>{latest ? 'อัปโหลดแล้ว ' + dateTimeTH(latest.uploaded_at) : 'ยังไม่ได้อัปโหลด'}</div>
              <label className="btn ghost sm" style={{ display: 'inline-block' }}>
                {busy === k.key ? 'กำลังอัปโหลด...' : latest ? 'อัปโหลดใหม่' : 'เลือกไฟล์'}
                <input type="file" accept="image/*,application/pdf" hidden disabled={!!busy} onChange={e => { upload(k.key, e.target.files?.[0] || null); e.target.value = ''; }} />
              </label>
              {latest && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => openPrivate('employee-files', latest.storage_path)}>เปิดดู</button>}
            </div>
          );
        })}
      </div>
      {err && <div className="msg err" role="alert">{err}</div>}
    </div>
  );
}
