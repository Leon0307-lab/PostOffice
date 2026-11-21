import type { Role } from "@/types";

/**
 * Rollenprüfungen für die Oberfläche und Server Actions.
 * Maßgeblich sind immer Datenbankfunktionen und Row Level Security;
 * diese Helfer vermeiden nur unnötige Fehlversuche und blenden Buttons aus.
 */
export const isStaff = (role: Role): boolean => role === "administrator" || role === "poststelle";
export const isAdmin = (role: Role): boolean => role === "administrator";
export const isCourier = (role: Role): boolean => role === "zusteller";

export const canCreateIncoming = (role: Role): boolean => isStaff(role);
export const canCreateShipment = (role: Role): boolean => role !== "zusteller";
export const canAssignCourier = (role: Role): boolean => isStaff(role);
export const canPrintLabels = (role: Role): boolean => isStaff(role);
export const canManageRoutes = (role: Role): boolean => isStaff(role);
export const canViewStatistics = (role: Role): boolean =>
  isStaff(role) || role === "abteilungsleiter";
export const canViewAudit = (role: Role): boolean => isAdmin(role);
export const canManageUsers = (role: Role): boolean => isAdmin(role);
export const canScan = (role: Role): boolean => isStaff(role) || isCourier(role);
export const canHandleReturns = (role: Role): boolean => isStaff(role);

export interface NavItem {
  href: string;
  label: string;
  roles: Role[] | "all";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: "all" },
  { href: "/courier", label: "Meine Zustellungen", roles: ["zusteller"] },
  { href: "/shipments", label: "Sendungen", roles: "all" },
  { href: "/shipments/new", label: "Sendung erfassen", roles: ["administrator", "poststelle", "mitarbeiter", "abteilungsleiter"] },
  { href: "/scan", label: "Scannen", roles: ["administrator", "poststelle", "zusteller"] },
  { href: "/routes", label: "Zustellrouten", roles: ["administrator", "poststelle", "zusteller"] },
  { href: "/returns", label: "Rücksendungen", roles: ["administrator", "poststelle"] },
  { href: "/archive", label: "Archiv", roles: "all" },
  { href: "/statistics", label: "Statistiken", roles: ["administrator", "poststelle", "abteilungsleiter"] },
  { href: "/notifications", label: "Benachrichtigungen", roles: "all" },
  { href: "/admin/users", label: "Benutzer", roles: ["administrator"] },
  { href: "/admin/departments", label: "Abteilungen", roles: ["administrator"] },
  { href: "/admin/locations", label: "Standorte", roles: ["administrator", "poststelle"] },
  { href: "/admin/settings", label: "Einstellungen", roles: ["administrator"] },
  { href: "/admin/audit", label: "Audit-Protokoll", roles: ["administrator"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.includes(role));
}
