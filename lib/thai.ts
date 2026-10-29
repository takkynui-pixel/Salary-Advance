const D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function chunk(n: number): string {
  const s = String(n); let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]); const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 1) out += (d === 1 ? '' : d === 2 ? 'ยี่' : D[d]) + P[1];
    else if (pos === 0) out += (d === 1 && s.length > 1 ? 'เอ็ด' : D[d]);
    else out += D[d] + P[pos];
  }
  return out;
}
function intToThai(n: number): string {
  if (n === 0) return 'ศูนย์';
  const millions = Math.floor(n / 1_000_000); const rest = n % 1_000_000;
  return (millions ? intToThai(millions) + 'ล้าน' : '') + (rest ? chunk(rest) : '');
}
export function bahtText(amount: number): string {
  const total = Math.round(amount * 100);
  const baht = Math.floor(total / 100); const sat = total % 100;
  let t = intToThai(baht) + 'บาท';
  t += sat === 0 ? 'ถ้วน' : intToThai(sat) + 'สตางค์';
  return t;
}

export const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export function beParts(d: Date | string | null | undefined) {
  if (!d) return { d: '', m: '', mn: '', y: '' };
  const x = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00' : d) : d;
  return { d: String(x.getDate()), m: String(x.getMonth() + 1), mn: MONTHS_TH[x.getMonth()], y: String(x.getFullYear() + 543) };
}
export const beShort = (d: Date | string | null | undefined) => { const p = beParts(d); return p.d ? `${p.d}/${p.m}/${p.y}` : ''; };
export function ageFrom(birth: string | null | undefined): string {
  if (!birth) return '';
  const b = new Date(birth + 'T00:00:00'); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return String(a);
}
