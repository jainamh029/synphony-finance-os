import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { alerts } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const openAlerts = await db.select().from(alerts).where(inArray(alerts.status, ["open", "acknowledged", "in_progress"]));

  return (
    <div className="flex h-screen w-full overflow-hidden print:h-auto print:overflow-visible">
      <Sidebar openAlertCount={openAlerts.length} />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Topbar user={session} />
        <main className="flex-1 overflow-y-auto bg-[var(--color-paper)] p-6 print:overflow-visible print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}
