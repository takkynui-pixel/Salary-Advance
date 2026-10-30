import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Admin-only diagnostics for the app's own emails (never returns secrets)
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY; const resendKey = process.env.RESEND_API_KEY; const from = process.env.MAIL_FROM;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: role } = await userClient.rpc('current_role_name');
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data: u } = await userClient.auth.getUser();
  const me = u.user?.email || '';

  const out: Record<string, string> = {
    SUPABASE_SERVICE_ROLE_KEY: service ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง',
    RESEND_API_KEY: resendKey ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง',
    MAIL_FROM: from ? `ตั้งแล้ว (${from})` : 'ยังไม่ได้ตั้ง',
  };
  if (service) {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const probe = await admin.rpc('staff_notify_emails');
    out.service_key = probe.error ? 'ไม่ถูกต้อง — ต้องเป็นคีย์ service_role / secret (ตอนนี้ใช้คีย์ที่สิทธิ์ไม่พอ เช่น anon/publishable)' : `ถูกต้อง · ผู้รับแจ้งคำขอเบิก (HR/การเงิน) ${probe.data?.length ?? 0} อีเมล`;
  } else out.service_key = 'ข้าม (ยังไม่ได้ตั้งคีย์)';
  if (resendKey && from && me) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [me], subject: 'ทดสอบอีเมลจากระบบเบิกเงินล่วงหน้า', html: '<p>ถ้าคุณเห็นอีเมลนี้ แปลว่าการส่งอีเมลของระบบ (Resend) ใช้งานได้</p>' }),
    });
    out.test_email = res.ok ? `ส่งอีเมลทดสอบไปที่ ${me} แล้ว (ตรวจกล่องจดหมาย/ขยะ)` : `ส่งไม่สำเร็จ (${res.status}): ${(await res.text()).slice(0, 300)}`;
  } else out.test_email = 'ข้าม (ตั้งค่า RESEND_API_KEY / MAIL_FROM ไม่ครบ)';
  return NextResponse.json(out);
}
