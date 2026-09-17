import { db } from "@/db/client";
import { customers } from "@/db/schema";
import { LinkButton } from "@/components/ui/form";
import { fmtNumber } from "@/lib/finance/calculations";
import { CustomersTable } from "./CustomersTable";

export default async function CustomersPage() {
  const rows = await db.select().from(customers).orderBy(customers.farmName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Customers &amp; Farms</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{fmtNumber(rows.length)} accounts</p>
        </div>
        <LinkButton href="/customers/new">+ New customer</LinkButton>
      </div>
      <CustomersTable rows={rows} />
    </div>
  );
}
