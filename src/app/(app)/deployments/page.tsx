import { getDeploymentRollups } from "@/lib/finance/aggregate";
import { LinkButton } from "@/components/ui/form";
import { DeploymentsTable } from "./DeploymentsTable";

export default async function DeploymentsPage() {
  const rollups = await getDeploymentRollups();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Deployments (P&amp;L)</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Are deployed robots productive and profitable?</p>
        </div>
        <LinkButton href="/deployments/new">+ New deployment</LinkButton>
      </div>
      <DeploymentsTable rows={rollups} />
    </div>
  );
}
