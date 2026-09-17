import { db } from "@/db/client";
import { customers, contracts, BUDGET_CATEGORIES } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, TextArea, Button } from "@/components/ui/form";
import { createDeployment } from "@/lib/actions/deployments";

const CATEGORY_LABELS: Record<string, string> = {
  robot_depreciation: "Robot depreciation / lease",
  procurement_allocation: "Procurement allocation",
  shipping_install: "Shipping & installation",
  field_technician_labor: "Field technician labor",
  operator_labor: "Operator labor",
  engineering_support: "Engineering support",
  maintenance: "Maintenance",
  spare_parts: "Spare parts",
  repairs: "Repairs",
  travel: "Travel",
  lodging: "Lodging",
  insurance: "Insurance",
  cloud_compute: "Cloud / compute",
  data_storage: "Data storage",
  software_tools: "Software / third-party tools",
  customer_integration: "Customer integration",
  other: "Other",
};

export default async function NewDeploymentPage({ searchParams }: PageProps<"/deployments/new">) {
  const { customerId, contractId } = await searchParams;
  const [allCustomers, allContracts] = await Promise.all([db.select().from(customers), db.select().from(contracts)]);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">New deployment</h1>
      <p className="text-sm text-[var(--color-graphite-500)]">
        This builds the pre-deployment investment case: expected contribution margin and payback period, before robots and capital are committed.
      </p>
      <Card>
        <CardHeader title="Deployment plan" />
        <CardBody>
          <form action={createDeployment} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="customerId" required>
                <Select id="customerId" name="customerId" required defaultValue={typeof customerId === "string" ? customerId : ""}>
                  <option value="" disabled>Select...</option>
                  {allCustomers.map((c) => <option key={c.id} value={c.id}>{c.farmName}</option>)}
                </Select>
              </Field>
              <Field label="Contract" htmlFor="contractId" required>
                <Select id="contractId" name="contractId" required defaultValue={typeof contractId === "string" ? contractId : ""}>
                  <option value="" disabled>Select...</option>
                  {allContracts.map((c) => <option key={c.id} value={c.id}>{custMap.get(c.customerId)} — {c.contractType.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Deployment name" htmlFor="name" required>
                <Input id="name" name="name" required placeholder="e.g. North Block Deployment" />
              </Field>
              <Field label="Operations owner" htmlFor="operationsOwner">
                <Input id="operationsOwner" name="operationsOwner" />
              </Field>
              <Field label="Planned start date" htmlFor="plannedStartDate" required>
                <Input id="plannedStartDate" name="plannedStartDate" type="date" required />
              </Field>
              <Field label="Planned end date" htmlFor="plannedEndDate" required>
                <Input id="plannedEndDate" name="plannedEndDate" type="date" required />
              </Field>
              <Field label="Robots planned" htmlFor="robotsPlanned" required>
                <Input id="robotsPlanned" name="robotsPlanned" type="number" step="1" required defaultValue={2} />
              </Field>
              <Field label="Finance owner" htmlFor="financeOwner">
                <Input id="financeOwner" name="financeOwner" />
              </Field>
              <Field label="Expected operating hours" htmlFor="expectedOperatingHours">
                <Input id="expectedOperatingHours" name="expectedOperatingHours" type="number" step="1" />
              </Field>
              <Field label="Expected output volume" htmlFor="expectedOutputVolume">
                <Input id="expectedOutputVolume" name="expectedOutputVolume" type="number" step="1" />
              </Field>
              <Field label="Expected technician hours" htmlFor="expectedTechnicianHours">
                <Input id="expectedTechnicianHours" name="expectedTechnicianHours" type="number" step="1" />
              </Field>
              <Field label="Expected uptime (%)" htmlFor="expectedUptimePct" required>
                <Input id="expectedUptimePct" name="expectedUptimePct" type="number" step="1" required defaultValue={90} />
              </Field>
              <Field label="Expected utilization (%)" htmlFor="expectedUtilizationPct" required>
                <Input id="expectedUtilizationPct" name="expectedUtilizationPct" type="number" step="1" required defaultValue={70} />
              </Field>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-graphite-900)]">Planned deployment budget</h3>
              <p className="mb-3 text-xs text-[var(--color-graphite-500)]">Enter planned amounts for the categories that apply. Check &ldquo;Up-front&rdquo; for one-time investment (used in payback calculations) vs. recurring/monthly cost.</p>
              <div className="overflow-hidden rounded-lg border border-[var(--color-graphite-100)]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-right">Planned amount ($)</th>
                      <th className="px-3 py-2 text-center">Up-front</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUDGET_CATEGORIES.map((cat) => (
                      <tr key={cat} className="border-b border-[var(--color-graphite-100)] last:border-0">
                        <td className="px-3 py-1.5">{CATEGORY_LABELS[cat]}</td>
                        <td className="px-3 py-1.5">
                          <Input name={`budget_${cat}`} type="number" step="0.01" min="0" defaultValue={0} className="text-right" />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" name={`upfront_${cat}`} className="h-4 w-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Field label="Notes" htmlFor="notes">
              <TextArea id="notes" name="notes" rows={3} />
            </Field>
            <Button type="submit">Create deployment</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
