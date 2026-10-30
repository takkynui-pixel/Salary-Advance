import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBatch } from '@/lib/mail';

export const dynamic = 'force-dynamic';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Called by the employee's browser right after a request is created. Sends one email to every HR and finance user.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!service || !resendKey || !from) {
    console.warn('notify-request: email is not configured (SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / MAIL_FROM)');
    return NextResponse.json({ sent: 0, reason: 'email not configured' });
  }

  let requestId = '';
  try { requestId = String((await req.json())?.requestId || ''); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!requestId) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // read the request as the caller (RLS limits what they can see)
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: r } = await userClient.from('advance_requests')
    .select('id, requested_amount, status, notified_at, created_at, employees(emp_code, full_name, client_company), pay_periods(label)')
    .eq('id', requestId).maybeSingle();
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const row: any = r;
  if (row.status !== 'pending_hr' || row.notified_at || Date.now() - new Date(row.created_at).getTime() > 15 * 60 * 1000) {
    return NextResponse.json({ sent: 0, reason: 'nothing to send' });
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.rpc('staff_notify_emails');
  if (probe.error) { console.error('notify-request: SUPABASE_SERVICE_ROLE_KEY is not a valid service key:', probe.error.message); return NextResponse.json({ sent: 0, reason: 'service key invalid' }); }
  // claim the notification so it is sent once
  const { data: claimed } = await admin.from('advance_requests').update({ notified_at: new Date().toISOString() })
    .eq('id', requestId).is('notified_at', null).select('id');
  if (!claimed || claimed.length === 0) return NextResponse.json({ sent: 0, reason: 'already notified' });

  const { data: staff } = await admin.rpc('staff_notify_emails');
  const set = new Set<string>((staff || []).map((s: any) => String(s.email).toLowerCase()));
  (process.env.NOTIFY_EXTRA_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).forEach(e => set.add(e));
  const recipients = Array.from(set);
  if (recipients.length === 0) return NextResponse.json({ sent: 0, reason: 'no recipients' });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const emp = row.employees || {};
  const subject = `คำขอเบิกเงินล่วงหน้าใหม่ — ${emp.full_name || ''} ${money(row.requested_amount)} บาท`;
  const html = `<div style="font-family:Arial,'Noto Sans Thai',sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#14224a">
    <h2 style="color:#1f5fe0;margin:0 0 12px">มีคำขอเบิกเงินล่วงหน้าใหม่</h2>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr><td style="padding:6px 0;color:#6b7896">พนักงาน</td><td><b>${esc(emp.full_name)}</b> (${esc(emp.emp_code)})</td></tr>
      <tr><td style="padding:6px 0;color:#6b7896">บริษัทที่ประจำ</td><td>${esc(emp.client_company || '-')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7896">รอบ</td><td>${esc(row.pay_periods?.label || '-')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7896">ยอดที่ขอเบิก</td><td><b>${money(row.requested_amount)} บาท</b></td></tr>
    </table>
    <p style="margin:16px 0">HR กรุณาตรวจสอบวันทำงานและระบุยอดที่อนุมัติ จากนั้นพนักงานจะเซ็นใบยินยอมให้หักเงิน และฝ่ายการเงินจะได้รับรายการรอโอน</p>
    <p><a href="${esc(origin)}/staff" style="background:#1f5fe0;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">เปิดระบบ</a></p>
    <p style="font-size:12px;color:#6b7896;margin-top:20px">บริษัท วีทีเอ เซอร์วิส จำกัด · อีเมลนี้ส่งอัตโนมัติ</p></div>`;

  const r2 = await sendBatch(recipients.map(to => ({ to, subject, html })));
  const ok = r2.ok;
  if (ok === 0) await admin.from('advance_requests').update({ notified_at: null }).eq('id', requestId);
  return NextResponse.json({ sent: ok, total: recipients.length });
}
