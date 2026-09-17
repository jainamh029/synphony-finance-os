import { listScenarios, getWeeklyCashForecast, getMonthlyOperatingModel } from "@/lib/finance/cashForecast";
import { db } from "@/db/client";
import { forecastScenarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRobotRollups } from "@/lib/finance/aggregate";
import { CashForecastView, type ScenarioBundle } from "./CashForecastView";
import { PrintButton } from "@/components/ui/PrintButton";

export default async function CashForecastPage() {
  const scenarios = await listScenarios();
  const robotRollups = await getRobotRollups();
  const positiveMargins = robotRollups.filter((r) => r.contributionMarginTotal > 0);
  const avgMonthlyContributionMarginPerRobot =
    positiveMargins.length > 0
      ? positiveMargins.reduce((s, r) => s + r.contributionMarginTotal, 0) / positiveMargins.length / 4 // rough monthly estimate from ~4 months of season data
      : 0;

  const bundles: ScenarioBundle[] = await Promise.all(
    scenarios.map(async (scenario) => {
      const [weekly, monthly, [scenarioRow]] = await Promise.all([
        getWeeklyCashForecast(scenario.id, 13),
        getMonthlyOperatingModel(scenario.id, 24),
        db.select().from(forecastScenarios).where(eq(forecastScenarios.id, scenario.id)),
      ]);
      return { scenario, weekly, monthly, robotUnitCost: scenarioRow.robotUnitCost, avgMonthlyContributionMarginPerRobot };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Cash, Capex &amp; Runway</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Can we fund the next deployment wave?</p>
        </div>
        <PrintButton label="Print 13-week forecast" />
      </div>
      <CashForecastView bundles={bundles} />
    </div>
  );
}
