import { CONTRACT_TYPES, CONTRACT_STATUSES, BILLING_FREQUENCIES, PAYMENT_TERMS, type contracts } from "@/db/schema";
import { Field, Input, Select, TextArea, Button } from "@/components/ui/form";

type Contract = typeof contracts.$inferSelect;

export function ContractForm({
  action,
  customers,
  defaultValues,
  defaultCustomerId,
  submitLabel = "Save contract",
}: {
  action: (formData: FormData) => void | Promise<void>;
  customers: { id: string; farmName: string }[];
  defaultValues?: Partial<Contract>;
  defaultCustomerId?: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer" htmlFor="customerId" required>
          <Select id="customerId" name="customerId" required defaultValue={defaultValues?.customerId ?? defaultCustomerId ?? ""}>
            <option value="" disabled>Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.farmName}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pricing model" htmlFor="contractType" required>
          <Select id="contractType" name="contractType" required defaultValue={defaultValues?.contractType ?? "fixed_seasonal"}>
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required defaultValue={defaultValues?.startDate} />
        </Field>
        <Field label="End date" htmlFor="endDate" required>
          <Input id="endDate" name="endDate" type="date" required defaultValue={defaultValues?.endDate} />
        </Field>
        <Field label="Total contract value ($)" htmlFor="totalContractValue" required hint="Inclusive of mobilization fee + deposit for fixed/pilot contracts">
          <Input id="totalContractValue" name="totalContractValue" type="number" step="0.01" required defaultValue={defaultValues?.totalContractValue} />
        </Field>
        <Field label="Minimum seasonal commitment ($)" htmlFor="minimumCommitment">
          <Input id="minimumCommitment" name="minimumCommitment" type="number" step="0.01" defaultValue={defaultValues?.minimumCommitment ?? 0} />
        </Field>
        <Field label="Mobilization / implementation fee ($)" htmlFor="mobilizationFee">
          <Input id="mobilizationFee" name="mobilizationFee" type="number" step="0.01" defaultValue={defaultValues?.mobilizationFee ?? 0} />
        </Field>
        <Field label="Deposit amount ($)" htmlFor="depositAmount">
          <Input id="depositAmount" name="depositAmount" type="number" step="0.01" defaultValue={defaultValues?.depositAmount ?? 0} />
        </Field>
        <Field label="Variable price per unit ($)" htmlFor="variablePricePerUnit" hint="Used for per-pound / per-robot-hour / per-acre pricing">
          <Input id="variablePricePerUnit" name="variablePricePerUnit" type="number" step="0.0001" defaultValue={defaultValues?.variablePricePerUnit ?? ""} />
        </Field>
        <Field label="Variable unit type" htmlFor="variableUnitType">
          <Select id="variableUnitType" name="variableUnitType" defaultValue={defaultValues?.variableUnitType ?? ""}>
            <option value="">N/A</option>
            <option value="lb">per pound</option>
            <option value="robot_hour">per robot-hour</option>
            <option value="acre">per acre / bed</option>
          </Select>
        </Field>
        <Field label="Monthly subscription amount ($)" htmlFor="monthlySubscriptionAmount">
          <Input id="monthlySubscriptionAmount" name="monthlySubscriptionAmount" type="number" step="0.01" defaultValue={defaultValues?.monthlySubscriptionAmount ?? ""} />
        </Field>
        <Field label="Expected output volume" htmlFor="expectedOutputVolume">
          <Input id="expectedOutputVolume" name="expectedOutputVolume" type="number" step="1" defaultValue={defaultValues?.expectedOutputVolume ?? ""} />
        </Field>
        <Field label="Robots committed" htmlFor="robotsCommitted" required>
          <Input id="robotsCommitted" name="robotsCommitted" type="number" step="1" required defaultValue={defaultValues?.robotsCommitted ?? 0} />
        </Field>
        <Field label="Billing frequency" htmlFor="billingFrequency" required>
          <Select id="billingFrequency" name="billingFrequency" required defaultValue={defaultValues?.billingFrequency ?? "monthly"}>
            {BILLING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment terms" htmlFor="paymentTerms" required>
          <Select id="paymentTerms" name="paymentTerms" required defaultValue={defaultValues?.paymentTerms ?? "net_30"}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Customer-funded hardware contribution ($)" htmlFor="customerFundedHardware">
          <Input id="customerFundedHardware" name="customerFundedHardware" type="number" step="0.01" defaultValue={defaultValues?.customerFundedHardware ?? 0} />
        </Field>
        <Field label="SLA uptime target (%)" htmlFor="slaUptimeTargetPct">
          <Input id="slaUptimeTargetPct" name="slaUptimeTargetPct" type="number" step="1" defaultValue={defaultValues?.slaUptimeTargetPct ?? 90} />
        </Field>
        <Field label="Status" htmlFor="status" required>
          <Select id="status" name="status" required defaultValue={defaultValues?.status ?? "active"}>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes">
        <TextArea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
      </Field>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
