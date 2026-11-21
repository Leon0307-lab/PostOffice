"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/types";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function SubmitButton({
  label,
  className,
  confirm,
}: {
  label: string;
  className: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Bitte warten …" : label}
    </button>
  );
}

interface Props {
  action: Action;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  buttonClassName?: string;
  confirm?: string;
  /** Eingabefelder nach erfolgreicher Aktion leeren */
  resetOnSuccess?: boolean;
  /** Wird (nur im Client) nach erfolgreicher Aktion aufgerufen */
  onSuccess?: () => void;
}

/**
 * Formular mit Server Action, Ladezustand und Rückmeldung (Fehler/Erfolg).
 * Wird für alle Formulare verwendet, damit jede Eingabe serverseitig validiert wird.
 */
export default function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
  buttonClassName = "btn-primary",
  confirm,
  resetOnSuccess = false,
  onSuccess,
}: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false });

  useEffect(() => {
    if (state.ok && onSuccess) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state.ok ? "reset" : "form"}
    >
      {children}
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            state.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"
          }`}
        >
          {state.message}
        </p>
      )}
      {state.secret && (
        <div className="rounded-lg border-2 border-brand-yellow bg-yellow-50 p-4 text-center">
          <p className="text-xs font-semibold uppercase text-gray-600">Abholcode (nur jetzt sichtbar)</p>
          <p className="mt-1 select-all font-mono text-3xl font-bold tracking-widest">{state.secret}</p>
        </div>
      )}
      <SubmitButton label={submitLabel} className={buttonClassName} confirm={confirm} />
    </form>
  );
}
