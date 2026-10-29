import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const xf = req.headers.get('x-forwarded-for') || '';
  return NextResponse.json({ ip: xf.split(',')[0].trim() || null });
}
