"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onDecode: (text: string) => void;
}

const ELEMENT_ID = "po-scanner-region";

/**
 * Kamera-Scanner für QR- und Code-128-Barcodes (html5-qrcode).
 * - Die Kamera wird erst nach ausdrücklichem Klick auf "Kamera starten" angefragt.
 * - Funktioniert nur in sicheren Kontexten (HTTPS oder localhost).
 * - Doppelte Treffer desselben Codes innerhalb weniger Sekunden werden ignoriert.
 */
export default function Scanner({ onDecode }: Props) {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secure, setSecure] = useState(true);

  useEffect(() => {
    setSecure(window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      /* Kamera war bereits beendet */
    }
    setRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const start = async () => {
    setError(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ],
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text) => {
          const now = Date.now();
          const last = lastRef.current;
          if (last && last.text === text && now - last.at < 4000) return;
          lastRef.current = { text, at: now };
          onDecode(text);
        },
        () => {
          /* Einzelbild ohne Treffer: ignorieren */
        }
      );
      setRunning(true);
    } catch (e) {
      scannerRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      if (/permission|denied|NotAllowed/i.test(msg)) {
        setError("Kamerazugriff wurde nicht erlaubt. Bitte in den Browsereinstellungen freigeben.");
      } else if (/NotFound|no camera|Requested device not found/i.test(msg)) {
        setError("Keine Kamera gefunden. Nutzen Sie die manuelle Eingabe.");
      } else {
        setError("Die Kamera konnte nicht gestartet werden. Nutzen Sie die manuelle Eingabe.");
      }
      setRunning(false);
    }
  };

  if (!secure) {
    return (
      <div className="rounded-lg bg-bad-soft p-4 text-sm text-bad" role="alert">
        Der Kamerazugriff ist nur über eine sichere HTTPS-Verbindung möglich. Bitte rufen Sie die App
        über https:// auf oder nutzen Sie die manuelle Eingabe.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        id={ELEMENT_ID}
        className={`overflow-hidden rounded-lg bg-black ${running ? "min-h-[280px]" : "hidden"}`}
      />
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
          {error}
        </p>
      )}
      {running ? (
        <button type="button" className="btn-secondary w-full" onClick={() => void stop()}>
          Kamera stoppen
        </button>
      ) : (
        <button type="button" className="btn-dark btn-lg w-full" onClick={() => void start()}>
          Kamera starten
        </button>
      )}
    </div>
  );
}
