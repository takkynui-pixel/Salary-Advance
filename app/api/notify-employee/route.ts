import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBatch, esc } from '@/lib/mail';

export const dynamic = 'force-dynamic';

// HR/admin asks the server to email employees that they can now use the system.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!service || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return NextResponse.json({ sent: 0, reason: 'email not configured' });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: role } = await userClient.rpc('current_role_name');
  if (role !== 'hr' && role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let ids: string[] = []; let force = false;
  try { const b = await req.json(); ids = (Array.isArray(b?.employeeIds) ? b.employeeIds : []).map(String).slice(0, 300); force = !!b?.force; } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (ids.length === 0) return NextResponse.json({ sent: 0, reason: 'no employees' });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.rpc('staff_notify_emails');
  if (probe.error) return NextResponse.json({ sent: 0, reason: 'service key invalid' });
  const { data: emps } = await admin.from('employees').select('id, email, full_name, emp_code, invited_at, active').in('id', ids);
  const todo = (emps || []).filter((e: any) => e.email && e.active && (force || !e.invited_at));
  if (todo.length === 0) return NextResponse.json({ sent: 0, reason: 'nothing to send' });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const mails = todo.map((e: any) => ({
    to: String(e.email).toLowerCase(),
    subject: 'คุณสามารถใช้ระบบเบิกเงินล่วงหน้า VTA Service ได้แล้ว',
    html: `<div style="font-family:Arial,'Noto Sans Thai',sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#14224a">
      <h2 style="color:#1f5fe0;margin:0 0 12px">ยินดีต้อนรับ ${esc(e.full_name)}</h2>
      <p>บริษัท วีทีเอ เซอร์วิส จำกัด ได้เพิ่มคุณเข้าสู่ระบบเบิกเงินล่วงหน้าแล้ว (รหัสพนักงาน ${esc(e.emp_code)})</p>
      <ol style="line-height:1.7;padding-left:20px">
        <li>เปิดระบบที่ลิงก์ด้านล่าง</li>
        <li>กรอกอีเมลนี้ (${esc(e.email)}) แล้วกดส่งรหัส OTP</li>
        <li>นำรหัส 6 หลักที่ได้รับทางอีเมลมากรอกเพื่อเข้าสู่ระบบ</li>
        <li>กรอกข้อมูลส่วนตัวและอัปโหลดเอกสาร (บัตรประชาชน ทะเบียนบ้าน หน้าสมุดบัญชี) ก่อนขอเบิกครั้งแรก</li>
      </ol>
      <p><a href="${esc(origin)}/login" style="background:#1f5fe0;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">เข้าสู่ระบบ</a></p>
      <p style="font-size:12px;color:#6b7896;margin-top:20px">หากไม่ทราบเรื่องนี้ กรุณาติดต่อฝ่าย HR · อีเมลนี้ส่งอัตโนมัติ</p></div>`,
  }));
  const r = await sendBatch(mails);
  if (r.ok > 0) await admin.from('employees').update({ invited_at: new Date().toISOString() }).in('id', todo.slice(0, r.ok).map((e: any) => e.id));
  return NextResponse.json({ sent: r.ok, failed: r.failed, total: todo.length, error: r.error ? 'send failed' : undefined });
}
