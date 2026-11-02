import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBatch, esc } from '@/lib/mail';

export const dynamic = 'force-dynamic';
const ROLE_TH: Record<string, string> = { hr: 'HR', finance: 'การเงิน', admin: 'แอดมิน' };

// Admin asks the server to email a company-side user that they can now use the system.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!service || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return NextResponse.json({ sent: 0, reason: 'email not configured' });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: role } = await userClient.rpc('current_role_name');
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let email = '';
  try { email = String((await req.json())?.email || '').trim().toLowerCase(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!email) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.rpc('staff_notify_emails');
  if (probe.error) return NextResponse.json({ sent: 0, reason: 'service key invalid' });
  // only emails that are really on the staff list can be mailed
  const { data: inv } = await admin.from('staff_invites').select('email, role, notify_requests').ilike('email', email).maybeSingle();
  if (!inv) return NextResponse.json({ sent: 0, reason: 'not a staff user' });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const roleTh = ROLE_TH[inv.role] || inv.role;
  const html = `<div style="font-family:Arial,'Noto Sans Thai',sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#14224a">
    <h2 style="color:#1f5fe0;margin:0 0 12px">คุณได้รับสิทธิ์ใช้งานระบบเบิกเงินล่วงหน้า</h2>
    <p>บริษัท วีทีเอ เซอร์วิส จำกัด ได้เพิ่มอีเมล <b>${esc(email)}</b> เป็นผู้ใช้งานฝั่งบริษัท บทบาท <b>${esc(roleTh)}</b></p>
    <ol style="line-height:1.7;padding-left:20px">
      <li>เปิดระบบที่ลิงก์ด้านล่าง</li>
      <li>กรอกอีเมลนี้แล้วกดส่งรหัส OTP</li>
      <li>นำรหัสที่ได้รับทางอีเมลมากรอกเพื่อเข้าสู่ระบบ</li>
    </ol>
    <p><a href="${esc(origin)}/login" style="background:#1f5fe0;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">เข้าสู่ระบบ</a></p>
    <p style="font-size:13px">${inv.notify_requests ? 'คุณจะได้รับอีเมลแจ้งเตือนทุกครั้งที่พนักงานขอเบิกเงินล่วงหน้า (ปิดได้โดยแอดมิน)' : 'ขณะนี้ปิดการแจ้งเตือนคำขอเบิกทางอีเมลสำหรับคุณ'}</p>
    <p style="font-size:12px;color:#6b7896;margin-top:20px">อีเมลนี้ส่งอัตโนมัติ · หากไม่ทราบเรื่องนี้ กรุณาติดต่อแอดมินระบบ</p></div>`;
  const r = await sendBatch([{ to: email, subject: 'คุณได้รับสิทธิ์ใช้งานระบบเบิกเงินล่วงหน้า VTA Service', html }]);
  return NextResponse.json({ sent: r.ok, error: r.error ? 'send failed' : undefined });
}
