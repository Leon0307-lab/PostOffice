import { requireRole } from "@/lib/auth";
import ScanPanel from "@/components/ScanPanel";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Scannen" };

export default async function ScanPage() {
  const { profile } = await requireRole(["administrator", "poststelle", "zusteller"]);
  return (
    <div>
      <PageHeader
        title="Scannen"
        subtitle="Barcode oder QR-Code scannen oder die Sendungsnummer manuell eingeben."
      />
      <ScanPanel role={profile.role} />
    </div>
  );
}
