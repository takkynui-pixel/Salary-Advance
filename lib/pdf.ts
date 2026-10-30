import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { beParts, beShort, bahtText, ageFrom } from './thai';
import type { LoanProfile } from './loanTypes';

export type Loader = (url: string) => Promise<ArrayBuffer>;
export const browserLoader: Loader = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('โหลดไฟล์ไม่ได้: ' + url);
  return r.arrayBuffer();
};

export type DeductionInput = {
  refNo: string; fullName: string; empCode: string; position: string; company: string; startDate: string | null;
  signedAt: Date; amount: number; fee: number; transferFee: number; total: number; signaturePng: Uint8Array | null;
};

const INK = rgb(0.04, 0.1, 0.35);
const GRAY = rgb(0.4, 0.45, 0.55);

// A5 landscape page that shows only the top copy of the template (original coordinates are in A4 portrait, measured from page top)
const A5W = 595.276, A5H = 419.528;
const CROP = { left: 30.5, right: 564.0, topY: 26, botY: 419 }; // in points from the top of the template page
const CW = CROP.right - CROP.left, CH = CROP.botY - CROP.topY;
const OX = (A5W - CW) / 2, OY = (A5H - CH) / 2;
const DX = OX - CROP.left;        // x shift
const HC = CROP.botY + OY;        // y' = HC - top

type Ctx = { page: PDFPage; font: PDFFont };

// write text into an underscore slot [x0,x1] whose line bottom is `bot` (template coordinates)
function put(c: Ctx, text: string | undefined | null, x0: number, x1: number, bot: number, size = 9.5, center = false) {
  const t = (text ?? '').toString().trim();
  if (!t) return;
  const maxW = x1 - x0 - 3;
  let s = size;
  while (s > 6 && c.font.widthOfTextAtSize(t, s) > maxW) s -= 0.25;
  const w = c.font.widthOfTextAtSize(t, s);
  const x = center ? x0 + Math.max(0, (x1 - x0 - w) / 2) : x0 + 2;
  c.page.drawText(t, { x: x + DX, y: HC - bot + 5.0, size: s, font: c.font, color: INK });
}
function tick(c: Ctx, x: number, top: number, w = 10, h = 10) {
  const y0 = HC - top - h; const o = { thickness: 1.5, color: INK };
  c.page.drawLine({ start: { x: x + DX + w * 0.18, y: y0 + h * 0.5 }, end: { x: x + DX + w * 0.42, y: y0 + h * 0.2 }, ...o });
  c.page.drawLine({ start: { x: x + DX + w * 0.42, y: y0 + h * 0.2 }, end: { x: x + DX + w * 0.95, y: y0 + h * 0.95 }, ...o });
}

export async function buildDeduction(inp: DeductionInput, load: Loader = browserLoader): Promise<Uint8Array> {
  const [tplBytes, regular] = await Promise.all([load('/templates/deduction.pdf'), load('/fonts/Sarabun-Regular.ttf')]);
  const tpl = await PDFDocument.load(tplBytes);
  const src = tpl.getPages()[0]; const H = src.getHeight();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const sig = inp.signaturePng ? await doc.embedPng(inp.signaturePng) : null;
  const embedded = await doc.embedPage(src, { left: CROP.left, right: CROP.right, bottom: H - CROP.botY, top: H - CROP.topY });
  const page = doc.addPage([A5W, A5H]);
  page.drawPage(embedded, { x: OX, y: OY });
  const c: Ctx = { page, font };

  const d = beParts(inp.signedAt); const st = beParts(inp.startDate);
  const A = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // header
  page.drawText('เลขที่คำขอ ' + inp.refNo, { x: 52 + DX, y: HC - 101.7 + 5.0, size: 8, font, color: GRAY });
  put(c, d.d, 409, 428, 101.7, 9.5, true); put(c, d.m, 430, 449, 101.7, 9.5, true); put(c, d.y, 452, 480, 101.7, 9.5, true);
  put(c, inp.fullName, 188, 408, 126.5, 10, true); put(c, inp.empCode, 430, 537, 126.5, 10, true);
  put(c, inp.position, 82, 273, 148.2); put(c, inp.company, 393, 552, 148.2, 9.5);
  put(c, st.d, 79, 145, 169.9, 9.5, true); put(c, st.mn, 165, 301, 169.9, 9.5, true); put(c, st.y, 320, 399, 169.9, 9.5, true);

  // item 5 : advance payment
  tick(c, 50.5, 308.5, 11, 11);
  put(c, A(inp.total), 130, 242, 321.2, 10, true);
  page.drawText(`(เงินต้น ${A(inp.amount)} + ค่าธรรมเนียม ${A(inp.fee)} + ค่าโอน ${A(inp.transferFee)})`,
    { x: 268 + DX, y: HC - 321.2 + 5.0, size: 8, font, color: INK });

  // signature block (ผู้ยินยอม)
  if (sig) {
    const maxW = 100, maxH = 32; const r = sig.width / sig.height;
    let h = maxH, w = h * r; if (w > maxW) { w = maxW; h = w / r; }
    page.drawImage(sig, { x: 55 + DX + (103 - w) / 2, y: HC - 361.7 + 3, width: w, height: h });
  }
  put(c, inp.fullName, 44, 176, 386.9, 9.5, true);
  put(c, d.d, 82, 106, 411.0, 9.5, true); put(c, d.m, 108, 132, 411.0, 9.5, true); put(c, d.y, 134, 158, 411.0, 9, true);

  return doc.save();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
void beShort;


// ---------------------------------------------------------------------------------------------
// Contract package (6 pages): loan request, consent, receipt memo, loan agreement (3 pages)
// Coordinates are in points measured from the page top (A4 portrait).
// ---------------------------------------------------------------------------------------------
export type ContractInput = {
  refNo: string; fullName: string; empCode: string; position: string; company: string; startDate: string | null;
  signedAt: Date; amount: number; profile: LoanProfile; marketingConsent: boolean; signaturePng: Uint8Array | null;
};
type PCtx = { page: PDFPage; font: PDFFont; H: number };
const LIFT = 7.6; // baseline above the dotted line so text sits ON the line
function cput(c: PCtx, text: string | undefined | null, x0: number, x1: number, bot: number, size = 9.5, center = false) {
  const t = (text ?? '').toString().trim();
  if (!t) return;
  const maxW = x1 - x0 - 3; let sz = size;
  while (sz > 6 && c.font.widthOfTextAtSize(t, sz) > maxW) sz -= 0.25;
  const w = c.font.widthOfTextAtSize(t, sz);
  c.page.drawText(t, { x: center ? x0 + Math.max(0, (x1 - x0 - w) / 2) : x0 + 2, y: c.H - bot + LIFT, size: sz, font: c.font, color: INK });
}
function ctick(c: PCtx, x: number, top: number, w = 9, h = 9) {
  const y0 = c.H - top - h; const o = { thickness: 1.4, color: INK };
  c.page.drawLine({ start: { x: x + w * 0.18, y: y0 + h * 0.5 }, end: { x: x + w * 0.42, y: y0 + h * 0.2 }, ...o });
  c.page.drawLine({ start: { x: x + w * 0.42, y: y0 + h * 0.2 }, end: { x: x + w * 0.95, y: y0 + h * 0.95 }, ...o });
}
function cdot(c: PCtx, x: number, top: number, w = 6.6, h = 6) { c.page.drawCircle({ x: x + w / 2, y: c.H - top - h / 2, size: 2.2, color: INK }); }
function csign(c: PCtx, img: any, x0: number, x1: number, bot: number, hh = 30) {
  if (!img) return;
  const maxW = x1 - x0; const ratio = img.width / img.height;
  let h = hh; let w = h * ratio; if (w > maxW) { w = maxW; h = w / ratio; }
  c.page.drawImage(img, { x: x0 + (maxW - w) / 2, y: c.H - bot + 2, width: w, height: h });
}

export async function buildContract(inp: ContractInput, load: Loader = browserLoader): Promise<Uint8Array> {
  const [bytes, regular] = await Promise.all([load('/templates/contract.pdf'), load('/fonts/Sarabun-Regular.ttf')]);
  const opt = async (u: string) => { try { return await load(u); } catch { return null; } };
  const [coSig, witSig] = await Promise.all([opt('/templates/company-signature.png'), opt('/templates/witness-signature.png')]);

  const pr = inp.profile; const d = beParts(inp.signedAt);
  const fullDate = `${d.d} ${d.mn} ${d.y}`; const shortDate = beShort(inp.signedAt);
  const A = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const name = inp.fullName; const reg = pr.reg;

  const doc = await PDFDocument.load(bytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const sig = inp.signaturePng ? await doc.embedPng(inp.signaturePng) : null;
  const co = coSig ? await doc.embedPng(coSig) : null; const wit = witSig ? await doc.embedPng(witSig) : null;
  const pg = doc.getPages();
  const C = (i: number): PCtx => ({ page: pg[i], font, H: pg[i].getHeight() });

  // page 1 : loan request
  let c = C(0);
  cput(c, inp.refNo, 449, 561, 71.3, 9.5);
  cput(c, name, 145, 345, 112, 10);
  cput(c, ageFrom(pr.birthDate), 360, 387, 112, 9.5, true);
  cput(c, pr.nationality, 421, 462, 112, 9.5, true);
  cput(c, beShort(pr.birthDate), 522, 568, 112, 8.5);
  cput(c, pr.idNumber, 163, 249, 128.5, 9.5);
  if (pr.marital === 'single') cdot(c, 283.3, 116.6);
  if (pr.marital === 'married') cdot(c, 310.6, 116.6);
  if (pr.marital === 'divorced') cdot(c, 283.3, 127.8);
  cput(c, pr.children, 376, 412, 140, 9.5, true);
  cput(c, pr.phone, 95, 186, 153.5);
  cput(c, pr.email, 243, 440, 153.5, 9);
  cput(c, pr.lineId, 470, 557, 153.5);
  cdot(c, 42.8, 163.9, 8.1, 7.5);
  cput(c, reg.no, 60, 132, 196.2); cput(c, reg.moo, 153, 180, 196.2, 9.5, true); cput(c, reg.soi, 221, 298, 196.2);
  cput(c, reg.road, 58, 164, 212.7); cput(c, reg.subdistrict, 208, 298, 212.7);
  cput(c, reg.district, 82, 163, 227.7); cput(c, reg.province, 189, 297, 227.7);
  cput(c, reg.postal, 90, 166, 243.5);
  if (!pr.curSame) {
    cdot(c, 311.4, 163.9, 8.1, 7.5); const cu = pr.cur;
    cput(c, cu.no, 326, 392, 196.2); cput(c, cu.moo, 412, 439, 196.2, 9.5, true); cput(c, cu.soi, 480, 568, 196.2);
    cput(c, cu.road, 323, 405, 208.3, 8.5); cput(c, cu.subdistrict, 444, 530, 208.3, 8.5);
    cput(c, cu.district, 344, 405, 221.3, 8.5); cput(c, cu.province, 427, 529, 221.3, 8.5);
    cput(c, cu.postal, 351, 407, 235, 8.5);
  }
  const eduX = [143.5, 206.4, 259.5, 321.9];
  if (pr.education !== '') cdot(c, eduX[Number(pr.education)], pr.education === '3' ? 249.1 : 249.6);
  ctick(c, 376.5, 283.1, 9, 9);
  cput(c, inp.company, 177, 407, 327.8, 9);
  cput(c, inp.position, 71, 199, 343.6);
  cput(c, pr.workAddress, 235, 569, 343.6, 9);
  cput(c, pr.workPostal, 249, 307, 358.7);
  cput(c, beShort(inp.startDate || pr.startDate), 359, 412, 358.7, 9);
  cput(c, pr.workPhone, 456, 568, 358.7);
  const housing: Record<string, [number, number]> = { house: [112.7, 380.8], twin: [186.9, 379.9], town: [257.7, 379.7], shop: [352.1, 380.5], condo: [424.1, 380.5], flat: [112.7, 401.7], rent: [197.6, 402.4], other: [268.9, 402.4] };
  if (pr.housing && housing[pr.housing]) ctick(c, housing[pr.housing][0], housing[pr.housing][1]);
  const own: Record<string, [number, number]> = { own: [115.3, 424.9], rent: [199.8, 424.9], welfare: [257.7, 423.3], with: [411.3, 423.3] };
  if (pr.ownership && own[pr.ownership]) ctick(c, own[pr.ownership][0], own[pr.ownership][1]);
  if (pr.marital === 'married') { cput(c, pr.spouseName, 141, 311, 471.2, 9); cput(c, pr.spouseWorkplace, 168, 439, 486.2, 9); cput(c, pr.spousePhone, 300, 559, 500.6, 9); }
  ctick(c, 68.0, 522.9, 7.3, 7.3);
  cput(c, inp.position, 105, 294, 548.9); cput(c, pr.yearsHere, 132, 175, 564.6, 9.5, true);
  cput(c, inp.company, 126, 294, 579.6, 9); cput(c, pr.salary, 106, 177, 595.4);
  const ex = pr.exp;
  cput(c, ex.living, 412, 492, 548.9); cput(c, ex.housing, 412, 492, 564.6); cput(c, ex.car, 412, 492, 579.6);
  cput(c, ex.home, 412, 492, 595.4); cput(c, ex.other, 412, 492, 610.4);
  ctick(c, 42.2, 634.7, 9.7, 9.7);
  cput(c, reg.no, 95, 147, 665.8); cput(c, reg.moo, 165, 203, 665.8, 9.5, true); cput(c, reg.soi, 219, 318, 665.8);
  cput(c, reg.road, 335, 430, 665.8); cput(c, reg.subdistrict, 475, 567, 665.8);
  cput(c, reg.district, 80, 175, 681.6); cput(c, reg.province, 200, 309, 681.6); cput(c, reg.postal, 357, 432, 681.6);
  cput(c, pr.phone, 463, 565, 681.6); cput(c, pr.phone, 199, 318, 696.6);
  cput(c, pr.contactName, 143, 389, 763.3, 9); cput(c, pr.contactRel, 470, 565, 763.3, 9);
  cput(c, pr.contactPlace, 132, 391, 779.1, 9); cput(c, pr.contactPhone, 441, 565, 779.1);

  // page 2 : consents + signature
  c = C(1);
  [[48.0, 85.0, 9.7], [47.8, 146.2, 9.7], [47.8, 178.6, 9.7]].forEach(([x, t, w]) => ctick(c, x, t, w, w));
  if (inp.marketingConsent) ctick(c, 47.5, 226.7, 8.3, 8.3);
  csign(c, sig, 394, 514, 345.8);
  cput(c, name, 398, 532, 361.6, 9.5, true);
  cput(c, d.d, 433, 453, 377.3, 9.5, true); cput(c, d.m, 457, 488, 377.3, 9.5, true); cput(c, d.y, 492, 519, 377.3, 9.5, true);

  // page 3 : receipt memo
  c = C(2);
  cput(c, fullDate, 241, 379, 188.1, 10, true);
  cput(c, name, 232, 356, 213.1, 10, true);
  cput(c, fullDate, 174, 256, 238.1, 8.5, true); cput(c, inp.refNo, 300, 372, 238.1, 8.5, true); cput(c, A(inp.amount), 398, 471, 238.1, 10, true);
  cput(c, bahtText(inp.amount), 81, 189, 263.3, 7.5, true);
  cput(c, A(inp.amount), 368, 468, 288.3, 10, true); cput(c, bahtText(inp.amount), 84, 192, 313.5, 7.5, true);
  cput(c, pr.bankName, 72, 174, 347.5, 9.5, true); cput(c, pr.bankAccountName, 203, 315, 347.5, 9, true); cput(c, pr.bankAccountNo, 368, 459, 347.5, 10, true);
  csign(c, sig, 247, 376, 489.9);
  cput(c, name, 232, 399, 515.1, 9.5, true);

  // page 4 : loan agreement p.1
  c = C(3);
  cput(c, inp.refNo, 116, 230, 148.1, 10, true); cput(c, fullDate, 383, 500, 173.1, 10, true);
  cput(c, name, 312, 464, 201.5, 10, true); cput(c, ageFrom(pr.birthDate), 479, 515, 201.5, 10, true);
  cput(c, pr.idNumber, 179, 349, 225.3, 10);
  cput(c, reg.no, 388, 451, 225.3, 9.5, true); cput(c, reg.moo, 469, 523, 225.3, 9.5, true);
  cput(c, reg.soi, 113, 221, 249.1, 9.5, true); cput(c, reg.road, 238, 352, 249.1, 9.5, true); cput(c, reg.subdistrict, 396, 521, 249.1, 9.5, true);
  cput(c, reg.district, 113, 220, 272.7, 9.5, true); cput(c, reg.province, 245, 350, 272.7, 9.5, true); cput(c, reg.postal, 399, 522, 272.7, 9.5, true);
  cput(c, A(inp.amount), 283, 338, 391.5, 9.5, true); cput(c, bahtText(inp.amount), 363, 477, 391.5, 7.5, true);
  cput(c, shortDate, 419, 473, 510.1, 9, true);

  // page 6 : signatures
  c = C(5);
  csign(c, sig, 92, 226, 592.6); cput(c, name, 92, 226, 608, 9.5, true);
  csign(c, co, 344, 478, 592.6); csign(c, wit, 344, 478, 709.2);

  return doc.save();
}
