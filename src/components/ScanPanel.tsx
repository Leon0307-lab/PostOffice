"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import Scanner from "@/components/Scanner";
import ActionForm from "@/components/ActionForm";
import { lookupShipmentAction, type ScanResult } from "@/app/actions/scan";
import { changeStatusAction } from "@/app/actions/shipments";
import type { Role, ShipmentStatus } from "@/types";

interface QuickAction {
  label: string;
  to?: ShipmentStatus;
  href?: (id: string) => string;
}

function quickActions(role: Role, status: ShipmentStatus): QuickAction[] {
  const staff = role === "administrator" || role === "poststelle";
  const out: QuickAction[] = [];
  if (staff) {
    if (status === "erstellt") out.push({ label: "Eingang erfassen", to: "eingegangen" });
    if (status === "eingegangen" || status === "nicht_zustellbar") {
      out.push({ label: "Zusteller zuweisen", href: (id) => `/shipments/${id}` });
    }
    if (status === "abholbereit") {
      out.push({ label: "Abholung ausgeben", href: (id) => `/shipments/${id}/deliver` });
    }
  }
  if (role === "zusteller" || staff) {
    if (status === "zugewiesen" && role === "zusteller") out.push({ label: "Übernehmen", to: "uebernommen" });
    if ((status === "uebernommen" || status === "im_transport") && role === "zusteller") {
      out.push({ label: "In Zustellung setzen", to: "in_zustellung" });
    }
    if (status === "in_zustellung") {
      out.push({ label: "Zustellung mit Unterschrift", href: (id) => `/shipments/${id}/deliver` });
    }
  }
  return out;
}

export default function ScanPanel({ role }: { role: Role }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  const lookup = (raw: string) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        setResult(await lookupShipmentAction(raw));
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="text-lg font-bold">Kamera-Scan</h2>
        <Scanner onDecode={lookup} />
        <form
          className="space-y-2 border-t border-brand-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) lookup(manual);
          }}
        >
          <label htmlFor="manual" className="label">
            Sendungsnummer manuell eingeben
          </label>
          <div className="flex gap-2">
            <input
              id="manual"
              className="input font-mono uppercase"
              placeholder="PO-2026-000001"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={60}
            />
            <button type="submit" className="btn-primary" disabled={pending}>
              Suchen
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-bold">Ergebnis</h2>
        {pending && <p className="text-sm text-gray-500">Suche läuft …</p>}
        {!pending && !result && (
          <p className="text-sm text-gray-500">Scannen Sie einen Barcode/QR-Code oder geben Sie die Nummer ein.</p>
        )}
        {!pending && result && !result.found && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-3 text-sm font-medium text-bad">
            {result.message}
          </p>
        )}
        {!pending && result?.found && result.id && result.status && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-3xl font-extrabold">{result.shipmentNumber}</p>
              <p className="mt-1 text-sm text-gray-700">
                {result.subject} · {result.recipientName}
              </p>
              <p className="mt-2 inline-block rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800">
                {result.statusLabel}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {quickActions(role, result.status).map((action) =>
                action.to ? (
                  <ActionForm
                    key={action.label}
                    action={changeStatusAction}
                    submitLabel={action.label}
                    buttonClassName="btn-dark btn-lg w-full"
                    className="space-y-2"
                    onSuccess={() => lookup(result.shipmentNumber ?? "")}
                  >
                    <input type="hidden" name="shipmentId" value={result.id} />
                    <input type="hidden" name="to" value={action.to} />
                  </ActionForm>
                ) : (
                  <Link key={action.label} href={action.href!(result.id!)} className="btn-dark btn-lg">
                    {action.label}
                  </Link>
                )
              )}
              <Link href={`/shipments/${result.id}`} className="btn-secondary">
                Sendungsdetails öffnen
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
