// server-side helper: send emails through Resend's batch endpoint (up to 100 per call, avoids the 2 requests/second limit)
export type Mail = { to: string; subject: string; html: string };

export async function sendBatch(mails: Mail[]): Promise<{ ok: number; failed: number; error?: string }> {
  const key = process.env.RESEND_API_KEY; const from = process.env.MAIL_FROM;
  if (!key || !from) return { ok: 0, failed: mails.length, error: 'email not configured' };
  let ok = 0; let failed = 0; let error: string | undefined;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(m => ({ from, to: [m.to], subject: m.subject, html: m.html }))),
    });
    if (res.ok) ok += chunk.length;
    else { failed += chunk.length; error = `${res.status} ${await res.text()}`; console.error('resend batch failed:', error); }
  }
  return { ok, failed, error };
}
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
