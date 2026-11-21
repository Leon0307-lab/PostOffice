import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { formatDate, formatPercent } from "@/lib/format";

export const metadata = { title: "Statistiken" };
export const dynamic = "force-dynamic";

interface Rates {
  total: number;
  delivery_rate: number;
  return_rate: number;
  avg_processing_hours: number;
}
interface SeriesRow {
  period: string;
  created: number;
  delivered: number;
  returned: number;
}

function Bars({ rows, label }: { rows: SeriesRow[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.created)));
  return (
    <div className="card">
      <h3 className="mb-3 font-bold">{label}</h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.period} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-gray-600">{formatDate(r.period)}</span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-brand-grey">
              <div className="h-full bg-brand-yellow" style={{ width: `${(Number(r.created) / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right font-semibold">
              {r.created} <span className="font-normal text-gray-500">({r.delivered} zug.)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function StatisticsPage() {
  await requireRole(["administrator", "poststelle", "abteilungsleiter"]);
  const supabase = await createClient();

  // Alle Werte aus echten Datenbankabfragen (SECURITY INVOKER -> RLS begrenzt auf sichtbare Sendungen).
  const [rates, day, week, month, dept, courier] = await Promise.all([
    supabase.rpc("po_stats_rates"),
    supabase.rpc("po_stats_series", { p_unit: "day", p_periods: 14 }),
    supabase.rpc("po_stats_series", { p_unit: "week", p_periods: 12 }),
    supabase.rpc("po_stats_series", { p_unit: "month", p_periods: 12 }),
    supabase.rpc("po_stats_by_department"),
    supabase.rpc("po_stats_by_courier"),
  ]);

  const r = (rates.data ?? { total: 0, delivery_rate: 0, return_rate: 0, avg_processing_hours: 0 }) as Rates;
  const depts = (dept.data ?? []) as { department: string; total: number; delivered: number; returned: number }[];
  const couriers = (courier.data ?? []) as { courier: string; assigned: number; delivered: number; problems: number }[];
  const failed = [rates, day, week, month, dept, courier].some((x) => x.error);

  return (
    <div>
      <PageHeader title="Statistiken" subtitle="Berechnet aus den Sendungsdaten, die Sie sehen dürfen." />
      {failed && (
        <p className="mb-4 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">
          Einige Statistiken konnten nicht geladen werden.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sendungen" value={r.total} />
        <StatCard label="Zustellquote" value={formatPercent(Number(r.delivery_rate))} tone="ok" />
        <StatCard label="Rücksendequote" value={formatPercent(Number(r.return_rate))} tone="bad" />
        <StatCard
          label="Ø Bearbeitungszeit"
          value={`${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Number(r.avg_processing_hours))} h`}
          hint="Erstellung bis Zustellung"
          tone="info"
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Bars rows={(day.data ?? []) as SeriesRow[]} label="Sendungen pro Tag (14 Tage)" />
        <Bars rows={(week.data ?? []) as SeriesRow[]} label="Sendungen pro Woche (12 Wochen)" />
        <Bars rows={(month.data ?? []) as SeriesRow[]} label="Sendungen pro Monat (12 Monate)" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">Sendungen pro Abteilung</h2>
          {depts.length === 0 ? (
            <EmptyState>Keine Daten.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Abteilung</th><th>Gesamt</th><th>Zugestellt</th><th>Zurück</th></tr>
                </thead>
                <tbody>
                  {depts.map((d) => (
                    <tr key={d.department}>
                      <td className="font-semibold">{d.department}</td>
                      <td>{d.total}</td><td>{d.delivered}</td><td>{d.returned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Sendungen pro Zusteller</h2>
          {couriers.length === 0 ? (
            <EmptyState>Keine Daten.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Zusteller</th><th>Zugewiesen</th><th>Zugestellt</th><th>Probleme</th></tr>
                </thead>
                <tbody>
                  {couriers.map((c) => (
                    <tr key={c.courier}>
                      <td className="font-semibold">{c.courier}</td>
                      <td>{c.assigned}</td><td>{c.delivered}</td><td>{c.problems}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
