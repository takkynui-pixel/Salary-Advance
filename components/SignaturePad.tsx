'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type PadHandle = { clear: () => void; isEmpty: () => boolean; toPng: () => string };

const SignaturePad = forwardRef<PadHandle, { onChange?: (empty: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = cv.current!; const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const g = c.getContext('2d')!; g.scale(ratio, ratio); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0b1b4d';
  }, []);

  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; cv.current!.setPointerCapture(e.pointerId); const g = cv.current!.getContext('2d')!; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = cv.current!.getContext('2d')!; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); if (empty) { setEmpty(false); onChange?.(false); } };
  const up = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    clear: () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange?.(true); },
    isEmpty: () => empty,
    toPng: () => cv.current!.toDataURL('image/png'),
  }));

  return <canvas ref={cv} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="พื้นที่เซ็นชื่อ" />;
});
export default SignaturePad;
