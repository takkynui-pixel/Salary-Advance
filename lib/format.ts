export const baht = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dateTH = (d?: string | Date | null) => {
  if (!d) return '-';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const dateTimeTH = (d?: string | null) =>
  d ? new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

export const STATUS_TH: Record<string, string> = {
  pending_hr: 'รอ HR อนุมัติยอด', pending_sign: 'อนุมัติแล้ว รอเซ็นเอกสาร', approved: 'อนุมัติแล้ว รอโอน', rejected: 'ไม่อนุมัติ',
  transferred: 'โอนแล้ว', deducted: 'หักเงินแล้ว', cancelled: 'ยกเลิก',
};
export const STATUS_TONE: Record<string, string> = {
  pending_hr: 'warn', pending_sign: 'info', approved: 'info', rejected: 'bad', transferred: 'ok', deducted: 'mute', cancelled: 'mute',
};

export function calcFee(amount: number, feeRate: number, transferFee: number) {
  const fee = Math.round(amount * feeRate * 100) / 100;
  return { fee, transferFee, total: Math.round((amount + fee + transferFee) * 100) / 100 };
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
export const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function parseTable(text: string): string[][] {
  const delim = text.includes('\t') ? '\t' : ',';
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, '')));
}
