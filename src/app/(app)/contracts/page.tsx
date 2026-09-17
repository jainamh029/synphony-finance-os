import { db } from "@/db/client";
import { contracts, customers } from "@/db/schema";
import { LinkButton } from "@/components/ui/form";
import { ContractsTable, type ContractRow } from "./ContractsTable";

export default async function ContractsPage() {
  const [allContracts, allCustomers] = await Promise.all([db.select().from(contracts), db.select().from(customers)]);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  const rows: ContractRow[] = allContracts.map((c) => ({
    id: c.id,
    customerName: custMap.get(c.customerId) ?? "Unknown",
    contractType: c.contractType,
    startDate: c.startDate,
    endDate: c.endDate,
    totalContractValue: c.totalContractValue,
    robotsCommitted: c.robotsCommitted,
    status: c.status,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Contracts</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{rows.length} contracts across pilot, seasonal, per-pound, RaaS, and hybrid pricing models</p>
        </div>
        <LinkButton href="/contracts/new">+ New contract</LinkButton>
      </div>
      <ContractsTable rows={rows} />
    </div>
  );
}
