import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/data";
import { navForRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { signOutAction } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const unread = await getUnreadNotificationCount();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={navForRole(profile.role)}
        userName={profile.full_name || profile.email}
        roleLabel={ROLE_LABELS[profile.role]}
        unread={unread}
        signOut={signOutAction}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
