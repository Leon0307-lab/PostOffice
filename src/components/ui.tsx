import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-anthracite sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  default: "border-brand-yellow",
  ok: "border-ok",
  bad: "border-bad",
  info: "border-info",
} as const;

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: keyof typeof TONES;
  hint?: string;
}) {
  return (
    <div className={`card border-l-4 ${TONES[tone]} !p-4`}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-brand-anthracite">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-brand-border bg-white p-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "ok" | "bad" | "info";
  children: ReactNode;
}) {
  const styles = {
    ok: "bg-ok-soft text-ok",
    bad: "bg-bad-soft text-bad",
    info: "bg-info-soft text-info",
  } as const;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${styles[tone]}`}>
      {children}
    </div>
  );
}
