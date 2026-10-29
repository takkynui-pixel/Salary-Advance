import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { LoanProfile } from './loanTypes';
import { bahtText, beParts, beShort, ageFrom } from './thai';

export type Loader = (url: string) => Promise<ArrayBuffer>;
export const browserLoader: Loader = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('โหลดไฟล์ไม่ได้: ' + url);
  return r.arrayBuffer();
};
const optionalLoader = async (load: Loader, url: string) => { try { return await load(url); } catch { return null; } };

export type PackageInput = {
  fullName: string; empCode: string; position: string; company: string;
  contractNo: string; signedAt: Date; amount: number; fee: number; transferFee: number; total: number;
  profile: LoanProfile; marketingConsent: boolean; signaturePng: Uint8Array | null;
};

const INK = rgb(0.04, 0.1, 0.35);

type Ctx = { page: PDFPage; font: PDFFont; H: number };
// write text into a dotted slot [x0,x1] on a line [top,bot] (pdf points measured from page top)
function put(c: Ctx, text: string | undefined | null, x0: number, x1: number, bot: number, size = 9.5, opts: { center?: boolean } = {}) {
  const t = (text ?? '').toString().trim();
  if (!t) return;
  const maxW = x1 - x0 - 2;
  let s = size;
  while (s > 6 && c.font.widthOfTextAtSize(t, s) > maxW) s -= 0.25;
  const w = c.font.widthOfTextAtSize(t, s);
  const x = opts.center ? x0 + Math.max(0, (x1 - x0 - w) / 2) : x0 + 1.5;
  c.page.drawText(t, { x, y: c.H - bot + 5.0, size: s, font: c.font, color: INK });
}
function tick(c: Ctx, x: number, top: number, w = 8, h = 8) {
  const y0 = c.H - top - h; // bottom of box
  const o = { thickness: 1.4, color: INK };
  c.page.drawLine({ start: { x: x + w * 0.18, y: y0 + h * 0.5 }, end: { x: x + w * 0.42, y: y0 + h * 0.2 }, ...o });
  c.page.drawLine({ start: { x: x + w * 0.42, y: y0 + h * 0.2 }, end: { x: x + w * 0.95, y: y0 + h * 0.95 }, ...o });
}
function dot(c: Ctx, x: number, top: number, w = 6.6, h = 6) {
  c.page.drawCircle({ x: x + w / 2, y: c.H - top - h / 2, size: 2.2, color: INK });
}
function sign(c: Ctx, img: any, x0: number, x1: number, bot: number, hh = 30) {
  if (!img) return;
  const maxW = x1 - x0; const ratio = img.width / img.height;
  let h = hh; let w = h * ratio; if (w > maxW) { w = maxW; h = w / ratio; }
  c.page.drawImage(img, { x: x0 + (maxW - w) / 2, y: c.H - bot + 2, width: w, height: h });
}

export async function buildPackage(inp: PackageInput, load: Loader = browserLoader) {
  const [contractBytes, deductBytes, regular, bold] = await Promise.all([
    load('/templates/contract.pdf'), load('/templates/deduction.pdf'),
    load('/fonts/Sarabun-Regular.ttf'), load('/fonts/Sarabun-Bold.ttf'),
  ]);
  const coSig = await optionalLoader(load, '/templates/company-signature.png');
  const witSig = await optionalLoader(load, '/templates/witness-signature.png');

  const pr = inp.profile; const d = beParts(inp.signedAt);
  const fullDate = `${d.d} ${d.mn} ${d.y}`; const shortDate = beShort(inp.signedAt);
  const A = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const name = inp.fullName;

  // ---------------- contract package (6 pages) ----------------
  const doc = await PDFDocument.load(contractBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const boldF = await doc.embedFont(bold, { subset: true });
  const sigImg = inp.signaturePng ? await doc.embedPng(inp.signaturePng) : null;
  const coImg = coSig ? await doc.embedPng(coSig) : null;
  const witImg = witSig ? await doc.embedPng(witSig) : null;
  const pg = doc.getPages();
  const C = (i: number): Ctx => ({ page: pg[i], font, H: pg[i].getHeight() });

  // page 1 : loan request
  let c = C(0);
  put(c, inp.contractNo, 449, 561, 71.3, 9.5);
  put(c, name, 145, 345, 112, 10);
  put(c, ageFrom(pr.birthDate), 360, 387, 112, 9.5, { center: true });
  put(c, pr.nationality, 421, 462, 112, 9.5, { center: true });
  put(c, beShort(pr.birthDate), 522, 568, 112, 8.5);
  put(c, pr.idNumber, 163, 249, 128.5, 9.5);
  if (pr.marital === 'single') dot(c, 283.3, 116.6);
  if (pr.marital === 'married') dot(c, 310.6, 116.6);
  if (pr.marital === 'divorced') dot(c, 283.3, 127.8);
  put(c, pr.children, 376, 412, 140, 9.5, { center: true });
  put(c, pr.phone, 95, 186, 153.5);
  put(c, pr.email, 243, 440, 153.5, 9);
  put(c, pr.lineId, 470, 557, 153.5);
  dot(c, 42.8, 163.9, 8.1, 7.5);
  const reg = pr.reg;
  put(c, reg.no, 60, 132, 196.2); put(c, reg.moo, 153, 180, 196.2, 9.5, { center: true }); put(c, reg.soi, 221, 298, 196.2);
  put(c, reg.road, 58, 164, 212.7); put(c, reg.subdistrict, 208, 298, 212.7);
  put(c, reg.district, 82, 163, 227.7); put(c, reg.province, 189, 297, 227.7);
  put(c, reg.postal, 90, 166, 243.5);
  if (!pr.curSame) {
    dot(c, 311.4, 163.9, 8.1, 7.5);
    const cu = pr.cur;
    put(c, cu.no, 326, 392, 196.2); put(c, cu.moo, 412, 439, 196.2, 9.5, { center: true }); put(c, cu.soi, 480, 568, 196.2);
    put(c, cu.road, 323, 405, 208.3, 8.5); put(c, cu.subdistrict, 444, 530, 208.3, 8.5);
    put(c, cu.district, 344, 405, 221.3, 8.5); put(c, cu.province, 427, 529, 221.3, 8.5);
    put(c, cu.postal, 351, 407, 235, 8.5);
  }
  const eduX = [143.5, 206.4, 259.5, 321.9];
  if (pr.education !== '') dot(c, eduX[Number(pr.education)], pr.education === '3' ? 249.1 : 249.6);
  // employment: outsourced staff = employee of company
  tick(c, 376.5, 283.1, 9, 9);
  put(c, inp.company, 177, 407, 327.8, 9);
  put(c, inp.position, 71, 199, 343.6);
  put(c, pr.workAddress, 235, 569, 343.6, 9);
  put(c, pr.workPostal, 249, 307, 358.7);
  put(c, beShort(pr.startDate), 359, 412, 358.7, 9);
  put(c, pr.workPhone, 456, 568, 358.7);
  if (pr.supName) { dot(c, 161.6, 362.3); put(c, pr.supName, 262, 406, 374.5, 9); put(c, pr.supPhone, 447, 568, 374.5); }
  const housing: Record<string, [number, number]> = {
    house: [112.7, 380.8], twin: [186.9, 379.9], town: [257.7, 379.7], shop: [352.1, 380.5], condo: [424.1, 380.5],
    flat: [112.7, 401.7], rent: [197.6, 402.4], other: [268.9, 402.4],
  };
  if (pr.housing && housing[pr.housing]) tick(c, housing[pr.housing][0], housing[pr.housing][1], 9, 9);
  const own: Record<string, [number, number]> = { own: [115.3, 424.9], rent: [199.8, 424.9], welfare: [257.7, 423.3], with: [411.3, 423.3] };
  if (pr.ownership && own[pr.ownership]) tick(c, own[pr.ownership][0], own[pr.ownership][1], 9, 9);
  if (pr.marital === 'married') {
    put(c, pr.spouseName, 141, 311, 471.2, 9); put(c, pr.spouseWorkplace, 168, 439, 486.2, 9); put(c, pr.spousePhone, 300, 559, 500.6, 9);
  }
  tick(c, 68.0, 522.9, 7.3, 7.3);
  put(c, inp.position, 105, 294, 548.9); put(c, pr.yearsHere, 132, 175, 564.6, 9.5, { center: true });
  put(c, inp.company, 126, 294, 579.6, 9);
  put(c, pr.salary, 106, 177, 595.4);
  const ex = pr.exp;
  put(c, ex.living, 412, 492, 548.9); put(c, ex.housing, 412, 492, 564.6); put(c, ex.car, 412, 492, 579.6);
  put(c, ex.home, 412, 492, 595.4); put(c, ex.other, 412, 492, 610.4);
  // delivery address = registered
  tick(c, 42.2, 634.7, 9.7, 9.7);
  put(c, reg.no, 95, 147, 665.8); put(c, reg.moo, 165, 203, 665.8, 9.5, { center: true }); put(c, reg.soi, 219, 318, 665.8);
  put(c, reg.road, 335, 430, 665.8); put(c, reg.subdistrict, 475, 567, 665.8);
  put(c, reg.district, 80, 175, 681.6); put(c, reg.province, 200, 309, 681.6); put(c, reg.postal, 357, 432, 681.6);
  put(c, pr.phone, 463, 565, 681.6);
  put(c, pr.phone, 199, 318, 696.6);
  put(c, pr.contactName, 143, 389, 763.3, 9); put(c, pr.contactRel, 470, 565, 763.3, 9);
  put(c, pr.contactPlace, 132, 391, 779.1, 9); put(c, pr.contactPhone, 441, 565, 779.1);

  // page 2 : consents + signature
  c = C(1);
  [[48.0, 85.0, 9.7], [47.8, 146.2, 9.7], [47.8, 178.6, 9.7]].forEach(([x, t, w]) => tick(c, x, t, w, w));
  if (inp.marketingConsent) tick(c, 47.5, 226.7, 8.3, 8.3);
  sign(c, sigImg, 394, 514, 345.8);
  put(c, name, 398, 532, 361.6, 9.5, { center: true });
  put(c, d.d, 433, 453, 377.3, 9.5, { center: true }); put(c, d.m, 457, 488, 377.3, 9.5, { center: true }); put(c, d.y, 492, 519, 377.3, 9.5, { center: true });

  // page 3 : receipt memo
  c = C(2);
  put(c, fullDate, 241, 379, 188.1, 10, { center: true });
  put(c, name, 232, 356, 213.1, 10, { center: true });
  put(c, fullDate, 174, 256, 238.1, 8.5, { center: true });
  put(c, inp.contractNo, 300, 372, 238.1, 8.5, { center: true });
  put(c, A(inp.amount), 398, 471, 238.1, 10, { center: true });
  put(c, bahtText(inp.amount), 81, 189, 263.3, 7.5, { center: true });
  put(c, A(inp.amount), 368, 468, 288.3, 10, { center: true });
  put(c, bahtText(inp.amount), 84, 192, 313.5, 7.5, { center: true });
  put(c, pr.bankName, 72, 174, 347.5, 9.5, { center: true });
  put(c, pr.bankAccountName, 203, 315, 347.5, 9, { center: true });
  put(c, pr.bankAccountNo, 368, 459, 347.5, 10, { center: true });
  sign(c, sigImg, 247, 376, 489.9);
  put(c, name, 232, 399, 515.1, 9.5, { center: true });

  // page 4 : loan contract p1
  c = C(3);
  put(c, inp.contractNo, 116, 230, 148.1, 10, { center: true });
  put(c, fullDate, 383, 500, 173.1, 10, { center: true });
  put(c, name, 312, 464, 201.5, 10, { center: true });
  put(c, ageFrom(pr.birthDate), 479, 515, 201.5, 10, { center: true });
  put(c, pr.idNumber, 179, 349, 225.3, 10);
  put(c, reg.no, 388, 451, 225.3, 9.5, { center: true }); put(c, reg.moo, 469, 523, 225.3, 9.5, { center: true });
  put(c, reg.soi, 113, 221, 249.1, 9.5, { center: true }); put(c, reg.road, 238, 352, 249.1, 9.5, { center: true });
  put(c, reg.subdistrict, 396, 521, 249.1, 9.5, { center: true });
  put(c, reg.district, 113, 220, 272.7, 9.5, { center: true }); put(c, reg.province, 245, 350, 272.7, 9.5, { center: true });
  put(c, reg.postal, 399, 522, 272.7, 9.5, { center: true });
  put(c, A(inp.amount), 283, 338, 391.5, 9.5, { center: true });
  put(c, bahtText(inp.amount), 363, 477, 391.5, 7.5, { center: true });
  put(c, shortDate, 419, 473, 510.1, 9, { center: true });

  // page 6 : signatures
  c = C(5);
  sign(c, sigImg, 92, 226, 592.6);
  put(c, name, 92, 226, 608, 9.5, { center: true });
  sign(c, coImg, 344, 478, 592.6);
  sign(c, witImg, 344, 478, 709.2);

  const contractOut = await doc.save();

  // ---------------- deduction consent (1 page, 2 copies) ----------------
  const dd = await PDFDocument.load(deductBytes);
  dd.registerFontkit(fontkit);
  const f2 = await dd.embedFont(regular, { subset: true });
  const sig2 = inp.signaturePng ? await dd.embedPng(inp.signaturePng) : null;
  const p0 = dd.getPages()[0];
  const K: Ctx = { page: p0, font: f2, H: p0.getHeight() };
  const st = beParts(pr.startDate);
  const note = `(เงินต้น ${A(inp.amount)} + ค่าบริการ ${A(inp.fee)} + ค่าโอน ${A(inp.transferFee)})`;
  const copy = (o: { date: number; name: number; row1: number; row2: number; it1: number; sig: number; par: number; sd: number; top: boolean }) => {
    put(K, d.d, 409, 428, o.date + 14, 9.5, { center: true }); put(K, d.m, 430, 449, o.date + 14, 9.5, { center: true }); put(K, d.y, 452, 470, o.date + 14, 9.5, { center: true });
    put(K, name, 188, 408, o.name + 14.1, 10, { center: true }); put(K, inp.empCode, 430, 537, o.name + 14.1, 10, { center: true });
    put(K, inp.position, 82, 273, o.row1 + 14.1, 9.5); put(K, inp.company, 393, 552, o.row1 + 14.1, 9);
    put(K, st.d, 79, 145, o.row2 + 14, 9.5, { center: true }); put(K, st.mn, 165, 301, o.row2 + 14, 9.5, { center: true }); put(K, st.y, 320, 399, o.row2 + 14, 9.5, { center: true });
    tick(K, 51, o.it1 + 3, 10, 10);
    if (o.top) {
      put(K, A(inp.total), 130, 242, o.it1 + 14, 10, { center: true });
      p0.drawText(note, { x: 270, y: K.H - (o.it1 + 14) + 5.0, size: 7.5, font: f2, color: INK });
    } else {
      put(K, 'เบิกล่วงหน้า', 102, 214, o.it1 + 14, 10, { center: true });
      put(K, A(inp.total), 257, 308, o.it1 + 14, 9.5, { center: true });
      p0.drawText(note, { x: 330, y: K.H - (o.it1 + 14) + 5.0, size: 7.5, font: f2, color: INK });
    }
    sign(K, sig2, 55, 158, o.sig + 14);
    put(K, name, 44, 176, o.par + 14, 9.5, { center: true });
    put(K, shortDate, 82, 190, o.sd + 14, 9.5, { center: true });
  };
  copy({ top: true, date: 87.7, name: 112.4, row1: 134.1, row2: 155.9, it1: 307.2, sig: 347.6, par: 372.9, sd: 396.9 });
  copy({ top: false, date: 488.8, name: 510.5, row1: 533.4, row2: 555.1, it1: 706.4, sig: 743.8, par: 769.0, sd: 793.7 });
  const deductOut = await dd.save();
  void boldF;

  return { contract: contractOut, deduction: deductOut };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
