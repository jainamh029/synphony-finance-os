import { db } from "@/db/client";
import { customers, CONTRACT_TYPES, CONTRACT_STATUSES } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, TextArea, Button } from "@/components/ui/form";
import { createContract } from "@/lib/actions/contracts";

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const { customerId } = await searchParams;
  const allCustomers = await db.select().from(customers).orderBy(customers.farmName);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">New contract</h1>
      <Card>
        <CardHeader title="Deal terms" subtitle="Bookings, backlog, invoice plan, and expected collections are derived from these terms." />
        <CardBody>
          <form action={createContract} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="customerId" required>
                <Select id="customerId" name="customerId" required defaultValue={typeof customerId === "string" ? customerId : ""}>
                  <option value="" disabled>Select a customer...</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.farmName}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Pricing model" htmlFor="contractType" required>
                <Select id="contractType" name="contractType" required defaultValue="fixed_seasonal">
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Start date" htmlFor="startDate" required>
                <Input id="startDate" name="startDate" type="date" required />
              </Field>
              <Field label="End date" htmlFor="endDate" required>
                <Input id="endDate" name="endDate" type="date" required />
              </Field>
              <Field label="Total contract value ($)" htmlFor="totalContractValue" required>
                <Input id="totalContractValue" name="totalContractValue" type="number" step="0.01" required />
              </Field>
              <Field label="Minimum seasonal commitment ($)" htmlFor="minimumCommitment">
                <Input id="minimumCommitment" name="minimumCommitment" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Field label="Mobilization / implementation fee ($)" htmlFor="mobilizationFee">
                <Input id="mobilizationFee" name="mobilizationFee" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Field label="Deposit amount ($)" htmlFor="depositAmount">
                <Input id="depositAmount" name="depositAmount" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Field label="Variable price per unit ($)" htmlFor="variablePricePerUnit" hint="Used for per-pound / per-robot-hour / per-acre pricing">
                <Input id="variablePricePerUnit" name="variablePricePerUnit" type="number" step="0.0001" />
              </Field>
              <Field label="Variable unit type" htmlFor="variableUnitType">
                <Select id="variableUnitType" name="variableUnitType" defaultValue="">
                  <option value="">N/A</option>
                  <option value="lb">per pound</option>
                  <option value="robot_hour">per robot-hour</option>
                  <option value="acre">per acre / bed</option>
                </Select>
              </Field>
              <Field label="Monthly subscription amount ($)" htmlFor="monthlySubscriptionAmount">
                <Input id="monthlySubscriptionAmount" name="monthlySubscriptionAmount" type="number" step="0.01" />
              </Field>
              <Field label="Expected output volume" htmlFor="expectedOutputVolume">
                <Input id="expectedOutputVolume" name="expectedOutputVolume" type="number" step="1" />
              </Field>
              <Field label="Robots committed" htmlFor="robotsCommitted" required>
                <Input id="robotsCommitted" name="robotsCommitted" type="number" step="1" required defaultValue={0} />
              </Field>
              <Field label="Payment terms (days)" htmlFor="paymentTermsDays" required>
                <Input id="paymentTermsDays" name="paymentTermsDays" type="number" step="1" required defaultValue={30} />
              </Field>
              <Field label="Customer-funded hardware contribution ($)" htmlFor="customerFundedHardware">
                <Input id="customerFundedHardware" name="customerFundedHardware" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Field label="SLA uptime target (%)" htmlFor="slaUptimeTargetPct">
                <Input id="slaUptimeTargetPct" name="slaUptimeTargetPct" type="number" step="1" defaultValue={90} />
              </Field>
              <Field label="Status" htmlFor="status" required>
                <Select id="status" name="status" required defaultValue="active">
                  {CONTRACT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              <TextArea id="notes" name="notes" rows={3} />
            </Field>
            <Button type="submit">Create contract</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
