import { Field, Input, Select, TextArea, Button } from "@/components/ui/form";
import { LIFECYCLE_STAGES, type customers } from "@/db/schema";

type Customer = typeof customers.$inferSelect;

export function CustomerForm({ action, defaultValues, submitLabel = "Save customer" }: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: Partial<Customer>;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Farm / customer name" htmlFor="farmName" required>
          <Input id="farmName" name="farmName" required defaultValue={defaultValues?.farmName} />
        </Field>
        <Field label="Parent organization" htmlFor="parentOrg">
          <Input id="parentOrg" name="parentOrg" defaultValue={defaultValues?.parentOrg ?? ""} />
        </Field>
        <Field label="Location" htmlFor="location" required>
          <Input id="location" name="location" required defaultValue={defaultValues?.location} />
        </Field>
        <Field label="Crop type" htmlFor="cropType" required>
          <Input id="cropType" name="cropType" required defaultValue={defaultValues?.cropType ?? "Strawberries"} />
        </Field>
        <Field label="Acres" htmlFor="acres">
          <Input id="acres" name="acres" type="number" step="0.1" defaultValue={defaultValues?.acres ?? ""} />
        </Field>
        <Field label="Expected harvest volume (lbs)" htmlFor="expectedVolumeLbs">
          <Input id="expectedVolumeLbs" name="expectedVolumeLbs" type="number" step="1" defaultValue={defaultValues?.expectedVolumeLbs ?? ""} />
        </Field>
        <Field label="Season start (MM-DD)" htmlFor="seasonStart" hint="Recurring annual harvest window">
          <Input id="seasonStart" name="seasonStart" placeholder="03-01" defaultValue={defaultValues?.seasonStart ?? ""} />
        </Field>
        <Field label="Season end (MM-DD)" htmlFor="seasonEnd">
          <Input id="seasonEnd" name="seasonEnd" placeholder="10-31" defaultValue={defaultValues?.seasonEnd ?? ""} />
        </Field>
        <Field label="Manual labor cost / hour ($)" htmlFor="manualLaborCostPerHour" hint="Grower's current baseline">
          <Input id="manualLaborCostPerHour" name="manualLaborCostPerHour" type="number" step="0.01" defaultValue={defaultValues?.manualLaborCostPerHour ?? ""} />
        </Field>
        <Field label="Manual labor cost / lb ($)" htmlFor="manualLaborCostPerLb" hint="Used as the cost-per-pound benchmark">
          <Input id="manualLaborCostPerLb" name="manualLaborCostPerLb" type="number" step="0.01" defaultValue={defaultValues?.manualLaborCostPerLb ?? ""} />
        </Field>
        <Field label="Customer owner" htmlFor="customerOwner">
          <Input id="customerOwner" name="customerOwner" defaultValue={defaultValues?.customerOwner ?? ""} />
        </Field>
        <Field label="Lifecycle stage" htmlFor="lifecycleStage" required>
          <Select id="lifecycleStage" name="lifecycleStage" required defaultValue={defaultValues?.lifecycleStage ?? "lead"}>
            {LIFECYCLE_STAGES.map((s) => (
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
