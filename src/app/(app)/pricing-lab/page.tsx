import { db } from "@/db/client";
import { customers, pricingScenarios } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { fmtCurrency, fmtPct } from "@/lib/finance/calculations";
import { PricingLabCalculator } from "./PricingLabCalculator";
import { convertPricingScenarioToContract } from "@/lib/actions/pricing";
import { ConfirmSubmitButton } from "@/components/forms/ConfirmSubmitButton";

export default async function PricingLabPage() {
  const allCustomers = await db.select({ id: customers.id, farmName: customers.farmName }).from(customers);
  const savedScenarios = await db.select().from(pricingScenarios).orderBy(desc(pricingScenarios.createdAt)).limit(10);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  async function convert(scenarioId: string) {
    "use server";
    await convertPricingScenarioToContract(scenarioId);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Pricing &amp; Customer ROI Lab</h1>
        <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Should we accept this deal — and at what price?</p>
      </div>

      <PricingLabCalculator customers={allCustomers} />

      {savedScenarios.length > 0 && (
        <Card className="print:hidden">
          <CardHeader title="Saved scenarios" />
          <CardBody className="p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Method</th>
                  <th className="px-4 py-2 text-left">Case</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">Synphony CM%</th>
                  <th className="px-4 py-2 text-right">Customer ROI%</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {savedScenarios.map((s) => {
                  const outputs = JSON.parse(s.outputsJson);
                  const parsedInputs = JSON.parse(s.inputsJson);
                  const method = parsedInputs.pricingMethodInputs?.method as string | undefined;
                  return (
                    <tr key={s.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                      <td className="px-4 py-2.5">{s.name}</td>
                      <td className="px-4 py-2.5">{s.customerId ? custMap.get(s.customerId) ?? "—" : "Unassigned"}</td>
                      <td className="px-4 py-2.5 capitalize">{method ? method.replace(/_/g, " ") : "—"}</td>
                      <td className="px-4 py-2.5 capitalize">{s.scenarioCase}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(outputs.synphonyRevenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(outputs.synphonyContributionMarginPct)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(outputs.customerRoiPct)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {s.customerId ? (
                          <form action={async () => { "use server"; await convert(s.id); }}>
                            <ConfirmSubmitButton
                              variant="secondary"
                              confirmMessage={`Create a draft contract for ${custMap.get(s.customerId) ?? "this customer"} from "${s.name}"? You can edit dates and terms before signing.`}
                            >
                              Convert to contract
                            </ConfirmSubmitButton>
                          </form>
                        ) : (
                          <span className="text-xs text-[var(--color-graphite-500)]">Assign a customer first</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
