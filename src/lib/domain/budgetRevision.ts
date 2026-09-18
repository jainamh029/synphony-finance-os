/** Pure budget-revision math (Gap D): material-change detection between two budget totals. */

export const MATERIAL_CHANGE_THRESHOLD_PCT = 10;

export interface BudgetVarianceResult {
  previousTotal: number;
  newTotal: number;
  varianceDollars: number;
  variancePct: number | null; // null when previousTotal is 0 (can't express a % of nothing)
  isMaterial: boolean;
}

export function computeBudgetVariance(previousTotal: number, newTotal: number): BudgetVarianceResult {
  const varianceDollars = newTotal - previousTotal;
  const variancePct = previousTotal !== 0 ? (Math.abs(varianceDollars) / previousTotal) * 100 : null;
  // A brand-new budget (previousTotal === 0) has nothing to compare against — not "material"
  // in the revision sense, since there's no prior plan being revised.
  const isMaterial = variancePct !== null && variancePct > MATERIAL_CHANGE_THRESHOLD_PCT;
  return { previousTotal, newTotal, varianceDollars, variancePct, isMaterial };
}
