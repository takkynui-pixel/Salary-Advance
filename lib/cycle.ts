// Pay-cycle and request-window helpers (all dates are plain YYYY-MM-DD strings, no timezone surprises)
export type CompanyRow = {
  id: string; name: string; aliases: string[]; cycle_start_day: number | null; cycle_end_day: number | null; pay_day: number | null; active: boolean;
};
export type PeriodRow = {
  id: string; company_id: string; label: string; start_date: string; end_date: string; pay_date: string | null; status: 'open' | 'closed';
  window_start: string | null; window_end: string | null; window_open: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, dim(y, m)))}`;
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const hasTemplate = (c: Pick<CompanyRow, 'cycle_start_day' | 'cycle_end_day' | 'pay_day'>) => !!(c.cycle_start_day && c.cycle_end_day && c.pay_day);

// The cycle that ENDS in month `month` of year `year` (month = 1..12): start, end, pay date, label
export function cycleFor(c: Pick<CompanyRow, 'cycle_start_day' | 'cycle_end_day' | 'pay_day'>, year: number, month: number) {
  const sd = c.cycle_start_day!, ed = c.cycle_end_day!, pd = c.pay_day!;
  const endDay = Math.min(ed, dim(year, month));
  const end = iso(year, month, endDay);
  let start: string;
  if (sd <= ed) start = iso(year, month, sd);                    // cycle lives inside one month (e.g. 1–30)
  else { const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1; start = iso(py, pm, sd); } // e.g. 16–15
  // pay date = first date AFTER the cycle end whose day-of-month is the pay day
  let pay = iso(year, month, pd);
  if (pay <= end) { const ny = month === 12 ? year + 1 : year, nm = month === 12 ? 1 : month + 1; pay = iso(ny, nm, pd); }
  return { start, end, pay, label: `${MON[month - 1]}${String((year + 543) % 100).padStart(2, '0')}` };
}

export const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

export type WinState = 'open' | 'not_yet' | 'ended' | 'closed';
export function windowState(p: Pick<PeriodRow, 'window_open' | 'window_start' | 'window_end'>, today = todayBangkok()): WinState {
  if (!p.window_open) return 'closed';
  if (p.window_start && today < p.window_start) return 'not_yet';
  if (p.window_end && today > p.window_end) return 'ended';
  return 'open';
}
export const WIN_TH: Record<WinState, string> = { open: 'เปิดรับคำขอ', not_yet: 'ยังไม่ถึงช่วงเบิก', ended: 'หมดช่วงเบิก', closed: 'ปิดโดยผู้ดูแล' };
export const WIN_TONE: Record<WinState, string> = { open: 'ok', not_yet: 'info', ended: 'mute', closed: 'bad' };
