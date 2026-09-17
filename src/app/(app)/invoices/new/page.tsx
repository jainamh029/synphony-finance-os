import { db } from "@/db/client";
import { contracts, customers, deployments, INVOICE_STATUSES } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, Button } from "@/components/ui/form";
import { createInvoice } from "@/lib/actions/invoices";

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const { contractId } = await searchParams;
  const [allContracts, allCustomers, allDeployments] = await Promise.all([
    db.select().from(contracts),
    db.select().from(customers),
    db.select().from(deployments),
  ]);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">New invoice</h1>
      <Card>
        <CardHeader title="Invoice details" />
        <CardBody>
          <form action={createInvoice} className="space-y-4">
            <Field label="Contract" htmlFor="contractId" required>
              <Select id="contractId" name="contractId" required defaultValue={typeof contractId === "string" ? contractId : ""}>
                <option value="" disabled>Select a contract...</option>
                {allContracts.map((c) => (
                  <option key={c.id} value={c.id}>{custMap.get(c.customerId)} — {c.contractType.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Deployment (optional)" htmlFor="deploymentId">
              <Select id="deploymentId" name="deploymentId" defaultValue="">
                <option value="">None</option>
                {allDeployments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice number" htmlFor="invoiceNumber" required>
              <Input id="invoiceNumber" name="invoiceNumber" required placeholder="INV-1001" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice date" htmlFor="invoiceDate" required>
                <Input id="invoiceDate" name="invoiceDate" type="date" required />
              </Field>
              <Field label="Due date" htmlFor="dueDate" required>
                <Input id="dueDate" name="dueDate" type="date" required />
              </Field>
            </div>
            <Field label="Amount ($)" htmlFor="amount" required>
              <Input id="amount" name="amount" type="number" step="0.01" required />
            </Field>
            <Field label="Status" htmlFor="status" required>
              <Select id="status" name="status" required defaultValue="sent">
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Create invoice</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
