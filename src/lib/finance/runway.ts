import { db } from "@/db/client";
import { settings, forecastScenarios, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { monthlyNetBurn, runwayMonths } from "./calculations";

export interface CashSnapshot {
  currentCash: number;
  monthlyFixedOpex: number;
  trailingAvgMonthlyCollections: number;
  avgMonthlyNetBurn: number;
  runwayMonths: number | null;
}

/** Company-wide cash snapshot used by the Executive dashboard, the Cash Forecast page, and the alert engine. */
export async function getCompanyCashSnapshot(): Promise<CashSnapshot> {
  const settingRows = await db.select().from(settings).where(eq(settings.key, "current_cash_balance"));
  const base = (await db.select().from(forecastScenarios).where(eq(forecastScenarios.scenarioType, "base")))[0];

  const currentCash = settingRows[0] ? Number(settingRows[0].value) : base?.startingCash ?? 0;
  const monthlyFixedOpex = base
    ? base.monthlyPayroll + base.monthlyRnd + base.monthlyGna + base.monthlySalesMarketing + base.monthlyCloudData + base.monthlyInsurance + base.monthlyTravelOps
    : 0;

  const allInvoices = await db.select().from(invoices);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const recentPayments = allInvoices.filter((i) => i.paidDate && new Date(i.paidDate) >= ninetyDaysAgo);
  const trailingAvgMonthlyCollections = recentPayments.reduce((sum, i) => sum + i.amountPaid, 0) / 3;

  const avgMonthlyNetBurn = monthlyNetBurn(monthlyFixedOpex, trailingAvgMonthlyCollections);
  const runway = runwayMonths(currentCash, avgMonthlyNetBurn);

  return { currentCash, monthlyFixedOpex, trailingAvgMonthlyCollections, avgMonthlyNetBurn, runwayMonths: runway };
}
