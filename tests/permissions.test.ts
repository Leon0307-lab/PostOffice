import { describe, expect, it } from "vitest";
import {
  canAssignCourier,
  canCreateIncoming,
  canCreateShipment,
  canManageUsers,
  canPrintLabels,
  canScan,
  canViewAudit,
  canViewStatistics,
  navForRole,
} from "@/lib/permissions";
import { ROLES } from "@/lib/constants";

describe("Rollen und Berechtigungen", () => {
  it("Administrator darf alles Verwaltende", () => {
    expect(canManageUsers("administrator")).toBe(true);
    expect(canViewAudit("administrator")).toBe(true);
    expect(canViewStatistics("administrator")).toBe(true);
  });

  it("Poststelle verwaltet Sendungen, aber keine Benutzer/Audit", () => {
    expect(canAssignCourier("poststelle")).toBe(true);
    expect(canPrintLabels("poststelle")).toBe(true);
    expect(canCreateIncoming("poststelle")).toBe(true);
    expect(canManageUsers("poststelle")).toBe(false);
    expect(canViewAudit("poststelle")).toBe(false);
  });

  it("Zusteller scannt, erfasst aber nichts und druckt keine Etiketten", () => {
    expect(canScan("zusteller")).toBe(true);
    expect(canCreateShipment("zusteller")).toBe(false);
    expect(canPrintLabels("zusteller")).toBe(false);
    expect(canAssignCourier("zusteller")).toBe(false);
  });

  it("Mitarbeiter haben keinen Scan-, Etiketten- oder Verwaltungszugriff", () => {
    expect(canScan("mitarbeiter")).toBe(false);
    expect(canPrintLabels("mitarbeiter")).toBe(false);
    expect(canCreateIncoming("mitarbeiter")).toBe(false);
    expect(canViewStatistics("mitarbeiter")).toBe(false);
  });

  it("Abteilungsverantwortliche sehen Statistiken, verwalten aber nichts", () => {
    expect(canViewStatistics("abteilungsleiter")).toBe(true);
    expect(canManageUsers("abteilungsleiter")).toBe(false);
  });

  it("Navigation blendet Admin-Bereiche für Nicht-Administratoren aus", () => {
    for (const role of ROLES) {
      const hrefs = navForRole(role).map((i) => i.href);
      expect(hrefs.includes("/admin/users")).toBe(role === "administrator");
      expect(hrefs.includes("/admin/audit")).toBe(role === "administrator");
      expect(hrefs.includes("/courier")).toBe(role === "zusteller");
    }
  });
});
