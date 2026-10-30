import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { beParts, beShort } from './thai';

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
