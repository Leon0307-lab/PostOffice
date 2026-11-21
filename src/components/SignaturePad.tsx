"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  /** Name des versteckten Formularfeldes, das die PNG-Data-URL erhält */
  name: string;
}

/**
 * Unterschriftenfeld für Touchscreens (Pointer Events, auch Apple Pencil/Maus).
 * Die clientseitige Prüfung "nicht leer" ist nur Komfort; maßgeblich ist die
 * serverseitige PNG-Prüfung in src/lib/signature.ts.
 */
export default function SignaturePad({ name }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const strokeLength = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    if (hiddenRef.current) hiddenRef.current.value = "";
    strokeLength.current = 0;
    setHasInk(false);
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    strokeLength.current += 1;
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignorieren */
    }
    if (strokeLength.current > 8 && hiddenRef.current) {
      hiddenRef.current.value = e.currentTarget.toDataURL("image/png");
      setHasInk(true);
    }
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-gray-400 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-56 w-full touch-none sm:h-64"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Unterschriftenfeld"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-gray-400">
            Hier mit Finger oder Stift unterschreiben
          </span>
        )}
      </div>
      <input type="hidden" name={name} ref={hiddenRef} required />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-sm ${hasInk ? "text-ok" : "text-gray-500"}`}>
          {hasInk ? "Unterschrift erfasst" : "Noch keine Unterschrift"}
        </span>
        <button type="button" className="btn-secondary" onClick={setup}>
          Löschen
        </button>
      </div>
    </div>
  );
}
