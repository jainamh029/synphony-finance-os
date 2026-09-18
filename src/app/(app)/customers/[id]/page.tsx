import { db } from "@/db/client";
import { customers, contracts, deployments, customerLifecycleHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, lifecycleTone, deploymentStatusTone } from "@/components/ui/Badge";
import { LinkButton, Input } from "@/components/ui/form";
import { ConfirmSubmitButton } from "@/components/forms/ConfirmSubmitButton";
import { fmtCurrency, fmtNumber } from "@/lib/finance/calculations";
import { detectLifecycleContradiction } from "@/lib/domain/customerLifecycle";
import { returnCustomerToAutomaticLifecycle, churnCustomer } from "@/lib/actions/customers";
import Link from "next/link";

export default async function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) notFound();

  const customerContracts = await db.select().from(contracts).where(eq(contracts.customerId, id));
  const customerDeployments = await db.select().from(deployments).where(eq(deployments.customerId, id));
  const lifecycleHistory = await db
    .select()
    .from(customerLifecycleHistory)
    .where(eq(customerLifecycleHistory.customerId, id))
    .orderBy(desc(customerLifecycleHistory.createdAt));

  const contradiction = detectLifecycleContradiction(customer, customerContracts);

  async function returnToAutomatic() {
    "use server";
    await returnCustomerToAutomaticLifecycle(id);
  }
  async function churn(formData: FormData) {
    "use server";
    await churnCustomer(id, formData);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">{customer.farmName}</h1>
            <Badge tone={lifecycleTone(customer.lifecycleStage)}>{customer.lifecycleStage.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-[var(--color-graphite-500)]">({customer.lifecycleSource})</span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{customer.location} · {customer.cropType} · {customer.acres ?? "—"} acres</p>
        </div>
        <div className="flex gap-2">
          {customer.lifecycleSource === "manual" && (
            <form action={returnToAutomatic}>
              <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Return to automatic lifecycle</button>
            </form>
          )}
          <LinkButton href={`/customers/${id}/edit`} variant="secondary">Edit</LinkButton>
          <LinkButton href={`/contracts/new?customerId=${id}`}>+ New contract</LinkButton>
        </div>
      </div>

      {contradiction && (
        <div className="rounded-lg border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-4 py-3 text-sm text-[var(--color-warn-text)]">
          ⚠ {contradiction}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Expected volume</p><p className="mt-1 text-lg font-semibold">{fmtNumber(customer.expectedVolumeLbs)} lb</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Manual labor / hr</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(customer.manualLaborCostPerHour)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Manual labor / lb</p><p className="mt-1 text-lg font-semibold">{customer.manualLaborCostPerLb ? `$${customer.manualLaborCostPerLb.toFixed(2)}` : "N/A"}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Owner</p><p className="mt-1 text-lg font-semibold">{customer.customerOwner ?? "—"}</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Contracts" />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Term</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {customerContracts.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-graphite-100)] last:border-0 hover:bg-[var(--color-paper)]">
                    <td className="px-4 py-2.5"><Link href={`/contracts/${c.id}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{c.contractType.replace(/_/g, " ")}</Link></td>
                    <td className="px-4 py-2.5">{c.startDate} → {c.endDate}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(c.totalContractValue)}</td>
                    <td className="px-4 py-2.5"><Badge tone={c.status === "active" ? "good" : c.status === "terminated" ? "bad" : "neutral"}>{c.status}</Badge></td>
                  </tr>
                ))}
                {customerContracts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No contracts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Deployments" />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Owner</th>
                  <th className="px-4 py-2 text-right">Robots</th>
                </tr>
              </thead>
              <tbody>
                {customerDeployments.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--color-graphite-100)] last:border-0 hover:bg-[var(--color-paper)]">
                    <td className="px-4 py-2.5"><Link href={`/deployments/${d.id}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{d.name}</Link></td>
                    <td className="px-4 py-2.5"><Badge tone={deploymentStatusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-2.5">{d.operationsOwner ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.robotsPlanned}</td>
                  </tr>
                ))}
                {customerDeployments.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No deployments yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lifecycle history" subtitle="Every automatic or manual stage change, with what triggered it" />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Change</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Actor</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lifecycleHistory.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-4 py-2.5 text-xs">{new Date(h.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 capitalize">{h.previousStage ?? "—"} → {h.newStage}</td>
                    <td className="px-4 py-2.5"><Badge tone={h.source === "manual" ? "warn" : "neutral"}>{h.source}</Badge></td>
                    <td className="px-4 py-2.5 text-xs">{h.actor ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-graphite-500)]">{h.reason ?? "—"}</td>
                  </tr>
                ))}
                {lifecycleHistory.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No lifecycle changes recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {customer.notes && (
        <Card>
          <CardHeader title="Notes" />
          <CardBody><p className="text-sm text-[var(--color-graphite-700)] whitespace-pre-wrap">{customer.notes}</p></CardBody>
        </Card>
      )}

      {customer.lifecycleStage !== "churned" && (
        <Card>
          <CardHeader title="Mark as churned" subtitle="Requires an explicit reason — the automatic lifecycle engine never sets this stage on its own." />
          <CardBody>
            <form action={churn} className="flex items-center gap-2">
              <Input name="reason" placeholder="Reason for churn" required className="flex-1" />
              <ConfirmSubmitButton variant="danger" confirmMessage={`Mark ${customer.farmName} as churned? This is a manual override and can be reversed via "Return to automatic lifecycle."`}>
                Mark churned
              </ConfirmSubmitButton>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
