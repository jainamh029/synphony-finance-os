import { ACQUISITION_TYPES } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, TextArea, Button } from "@/components/ui/form";
import { createRobot } from "@/lib/actions/robots";

export default function NewRobotPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Add robot to fleet</h1>
      <Card>
        <CardHeader title="Robot details" />
        <CardBody>
          <form action={createRobot} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Robot code" htmlFor="robotCode" required>
                <Input id="robotCode" name="robotCode" required placeholder="SYN-R016" />
              </Field>
              <Field label="Model" htmlFor="model" required>
                <Input id="model" name="model" required placeholder="Synphony Harvester Gen3" />
              </Field>
              <Field label="Serial number" htmlFor="serialNumber">
                <Input id="serialNumber" name="serialNumber" />
              </Field>
              <Field label="Acquisition type" htmlFor="acquisitionType" required>
                <Select id="acquisitionType" name="acquisitionType" required defaultValue="manufactured">
                  {ACQUISITION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Acquisition date" htmlFor="acquisitionDate" required>
                <Input id="acquisitionDate" name="acquisitionDate" type="date" required />
              </Field>
              <Field label="Purchase / manufacturing cost ($)" htmlFor="purchaseCost" required>
                <Input id="purchaseCost" name="purchaseCost" type="number" step="0.01" required />
              </Field>
              <Field label="Useful life (months)" htmlFor="usefulLifeMonths" required>
                <Input id="usefulLifeMonths" name="usefulLifeMonths" type="number" step="1" required defaultValue={48} />
              </Field>
              <Field label="Monthly lease cost ($)" htmlFor="monthlyLeaseCost" hint="If leased">
                <Input id="monthlyLeaseCost" name="monthlyLeaseCost" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Field label="Warranty expiry" htmlFor="warrantyExpiry">
                <Input id="warrantyExpiry" name="warrantyExpiry" type="date" />
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              <TextArea id="notes" name="notes" rows={3} />
            </Field>
            <Button type="submit">Add robot</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
