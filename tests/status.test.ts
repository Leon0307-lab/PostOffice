import { describe, expect, it } from "vitest";
import { canTransition, FINAL_STATUSES, SPECIAL_PROCESS_STATUSES, TRANSITIONS } from "@/lib/status";
import { STATUS_ORDER } from "@/lib/constants";

describe("Statusübergänge", () => {
  it("deckt alle Status ab", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it("erlaubt den regulären Ablauf", () => {
    const path = ["erstellt", "eingegangen", "zugewiesen", "uebernommen", "in_zustellung", "zugestellt"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("verbietet Abkürzungen", () => {
    expect(canTransition("erstellt", "zugestellt")).toBe(false);
    expect(canTransition("eingegangen", "zugestellt")).toBe(false);
    expect(canTransition("zugewiesen", "zugestellt")).toBe(false);
    expect(canTransition("uebernommen", "zugestellt")).toBe(false);
  });

  it("abgeschlossene Sendungen haben keine Folgestatus", () => {
    for (const s of FINAL_STATUSES) expect(TRANSITIONS[s]).toEqual([]);
  });

  it("Zustellung erfolgt nur aus in_zustellung oder abholbereit", () => {
    const sources = STATUS_ORDER.filter((s) => canTransition(s, "zugestellt"));
    expect(sources.sort()).toEqual(["abholbereit", "in_zustellung"]);
  });

  it("Rücksendung: nicht_zustellbar -> rueckgabe_eingeleitet -> zurueckgesendet", () => {
    expect(canTransition("nicht_zustellbar", "rueckgabe_eingeleitet")).toBe(true);
    expect(canTransition("rueckgabe_eingeleitet", "zurueckgesendet")).toBe(true);
    expect(canTransition("zurueckgesendet", "eingegangen")).toBe(false);
  });

  it("zugestellt und zugewiesen laufen über eigene Prozesse", () => {
    expect(SPECIAL_PROCESS_STATUSES).toEqual(["zugestellt", "zugewiesen"]);
  });
});
