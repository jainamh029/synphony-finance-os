import { db } from "@/db/client";
import { deployments, robots, customers } from "@/db/schema";
import { DataEntryTabs } from "./DataEntryTabs";

export default async function DataEntryPage() {
  const [allDeployments, allRobots, allCustomers] = await Promise.all([
    db.select().from(deployments),
    db.select().from(robots),
    db.select().from(customers),
  ]);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  const deploymentOptions = allDeployments.map((d) => ({ id: d.id, label: `${custMap.get(d.customerId) ?? "?"} — ${d.name}` }));
  const robotOptions = allRobots.map((r) => ({ id: r.id, label: `${r.robotCode} (${r.model})` }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Weekly Data Entry</h1>
        <p className="mt-1 text-sm text-[var(--color-graphite-500)]">
          Log robot performance, costs, and labor hours weekly — or import any entity in bulk via CSV: customers, contracts, robots, deployments,
          robot assignments, metrics, costs, labor, invoices, and payments. Downloadable templates are pre-formatted for each entity — see
          IMPORT_DATA_DICTIONARY.md in the repo for exact field rules and required columns.
        </p>
      </div>
      <DataEntryTabs deployments={deploymentOptions} robots={robotOptions} />
    </div>
  );
}
