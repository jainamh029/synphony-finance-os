# Financial Logic Reference

Every formula below is implemented in exactly one place and reused everywhere it appears in
the UI. This document explains *why* each formula is shaped the way it is, and documents the
non-obvious modeling decisions (especially around double-counting) so a reviewer doesn't have
to reverse-engineer them from the code.

Source of truth, by module:
- `src/lib/finance/calculations.ts` — core ratios (contribution margin, payback, utilization, uptime, aging, ROI)
- `src/lib/finance/aggregate.ts` — rollups that assemble calculations.ts formulas across deployments/robots/customers
- `src/lib/finance/pricingEngine.ts` — per-pricing-method revenue formulas (Gap E)
- `src/lib/finance/investmentCase.ts` — pre-deployment investment case + approval thresholds (Gap C)
- `src/lib/domain/invoiceSchedule.ts` — contract → billing schedule generation (Gap A)
- `src/lib/domain/budgetRevision.ts` — material-change detection for budget edits (Gap D)
- `src/lib/domain/customerLifecycle.ts` — customer lifecycle stage inference (Gap B)
- `src/lib/domain/payments.ts` — payment/overpayment validation
- `src/lib/domain/robotAssignment.ts` — robot double-booking validation

All ratios that can divide by zero go through `safeDiv`/`pct`, which return `null` (rendered
as "N/A") instead of `Infinity`/`NaN` — there is no formula in this app that can silently
produce a broken number in the UI.

---

## 1. Fleet economics

| Metric | Formula | Notes |
|---|---|---|
| Fleet Utilization | `productiveHours / availableHours × 100` | |
| Uptime | `(availableHours − downtimeHours) / availableHours × 100` | |
| Revenue per Robot-Hour | `revenue / productiveHours` | |
| Cost per Robot-Hour | `directCosts / productiveHours` | |
| Cost per Pound | `directCosts / poundsHarvested` | |
| Contribution Margin per Robot | `revenueAttributable − directCostAttributable` | |
| Robot Payback (months) | `upfrontInvestment / monthlyContributionMargin` | `null` if monthly CM ≤ 0 (never pays back) |

## 2. Deployment P&L

| Metric | Formula |
|---|---|
| Gross Profit | `recognizedRevenue − directCogs` |
| Contribution Margin | `recognizedRevenue − directCosts` |
| Contribution Margin % | `contributionMargin / recognizedRevenue × 100` |
| Expected Payback (months) | `upfrontInvestment / monthlyContributionMargin` |

**Recognized revenue to date** (`aggregate.ts: recognizedToDate`) is straight-line from the
deployment's **actual** start date (not the contract's signing date) to today, capped at the
contract's total value:
- Before `actualStartDate`: **0** (nothing recognized until the deployment has actually
  started, regardless of what the contract says).
- After `endDate`: the full `totalContractValue`.
- In between: `totalContractValue × (daysElapsed / totalDays)`.

**Monthly recognized revenue** (`straightLineMonthlyRevenue`) divides `totalContractValue` by
the inclusive month count between `startDate` and `endDate` (minimum 1 month, so a same-month
contract doesn't divide by zero).

**Payback uses a run-rate, not a cumulative total.** `elapsedMonths` since `actualStartDate`
(floored at 1) divides cumulative actual cost/revenue into a monthly run rate, then payback is
computed from that monthly contribution margin — otherwise a deployment three months in would
show an artificially long payback (cumulative cost ÷ one month's margin).

## 3. Budget vs. actual (Gap D)

**Only `isApproved = true` budget rows count as "the plan."** Budget items are versioned
copy-on-write (see §6) — every draft and superseded version's rows stay in the table for
history. Summing every row regardless of version, as an earlier version of this code did,
double- or triple-counts planned cost as soon as a deployment gets more than one budget
version. `getDeploymentRollups()` and `getDeploymentDetail()` both filter to `isApproved` rows
before summing `plannedDirectCost`/`plannedUpfrontCost` per category.

**Material-change threshold**: a new budget total that differs from the current approved total
by **more than 10%** requires a non-empty `changeReason` before it can be saved as a draft
(`computeBudgetVariance`, `MATERIAL_CHANGE_THRESHOLD_PCT = 10`). A brand-new budget
(`previousTotal === 0`) is never "material" — there's no prior plan to compare against.

## 4. Accounts receivable

| | |
|---|---|
| Outstanding balance | `max(0, amount − amountPaid)` |
| Aging bucket | days overdue: ≤0 = current, 1–30, 31–60, 61–90, 90+ |

**Payment cap** (`validatePayment`, regression-tested against production bug #4): a payment
that would push `amountPaid` past `amount` (beyond a $0.01 floating-point tolerance) is
rejected outright with the exact remaining balance in the error message — never silently
capped. The same function backs the manual "Record payment" UI action, the CSV payments
importer, and the unit tests, so there is exactly one place this rule can drift.

## 5. Customer ROI / Pricing Lab (`calculateRoi`)

This is the "should we do this deal" calculator — separate from a signed contract's own P&L.

- **Avoided labor cost** = `laborCostPerHour × (1 + burdenPct/100) × hoursReplaced`
- **Customer gross benefit** = avoided labor cost + expected yield/quality benefit
- **Customer net savings** = gross benefit − Synphony's fees (the contract price)
- **Customer ROI %** = net savings / fees paid
- **Synphony contribution margin** = contract price − Synphony direct costs
- **Break-even price/lb** = direct costs / expected pounds harvested
- **Synphony payback** = up-front cash requirement / monthly contribution margin

**Sensitivity analysis** perturbs one lever ±20% at a time and reports whichever output that
lever actually moves — uptime/utilization/output only affect break-even pricing in this model
(price and direct cost are independent top-line inputs), so showing contribution margin for
those levers would just repeat the same base number three times.

### Pricing-method revenue formulas (Gap E — `pricingEngine.ts`)

The Pricing Lab does **not** treat every deal as one flat price. Revenue is computed
per-method and fed into `calculateRoi` as `contractPrice`:

| Method | Revenue formula |
|---|---|
| `fixed_seasonal` | `fixedPrice` |
| `per_pound` / `per_robot_hour` / `per_acre` | `max(pricePerUnit × expectedUnits, minimumCommitment)` |
| `raas_subscription` | `monthlySubscriptionAmount × billableMonths + mobilizationFee` |
| `software_subscription` | `monthlySubscriptionAmount × billableMonths + implementationFee` |
| `hybrid` | `mobilizationFee + (monthlyFee > 0 ? monthlyFee×months : minimumCommitment) + max(0, usageValue − minimumCommitment)` |

For the usage-based methods, the raw usage estimate (`pricePerUnit × expectedUnits`) is
floored at `minimumCommitment` — never both counted (the breakdown line shows which one
applied). For hybrid, a monthly fee *substitutes* for the flat minimum (never both), and
overage is usage beyond the minimum only, never double-counted with the base.

A conservative/aggressive scenario case scales `expectedUnits` the same direction as
uptime/utilization (±10%) for usage-based revenue — a discounted-performance scenario that
left usage-based revenue untouched would be internally inconsistent. Flat methods (fixed/RaaS/
software) are unaffected, matching how a subscription doesn't fluctuate with output.

**Deposit is deliberately excluded from "revenue"** in every method — it's a cash-timing
concept (an early collection credited against revenue counted elsewhere), not incremental
revenue. It still flows into the ROI calculator's `depositAmount`/up-front-cash-requirement
math separately. See §6 for how this reconciles with the billing schedule, where deposit
*is* a real invoiced line for some contract types.

## 6. Contract-driven billing schedule (Gap A — `invoiceSchedule.ts`)

`generateScheduleLines(contract)` produces schedule *lines* (not issued invoices) with an
explicit non-double-counting model per contract type:

- **`fixed_seasonal` / `pilot`**: `totalContractValue` is **inclusive** of mobilization fee and
  deposit. The remaining balance (`total − mobilization − deposit`) is what actually gets
  billed as the recurring/upfront line(s), split evenly across the billing frequency.
- **`raas_subscription` / `software_subscription`**: the recurring line is
  `monthlySubscriptionAmount × months`, **independent** of `totalContractValue`. Mobilization
  and deposit are separate add-on lines on top — so the schedule's grand total can legitimately
  exceed `totalContractValue` by the deposit amount for these two types. This is intentional:
  `totalContractValue` for a subscription is the recurring-revenue baseline, not a cash total.
- **`per_pound` / `per_robot_hour` / `per_acre` / `hybrid`**: minimum-commitment and
  usage/overage are complementary by construction (`overage = max(0, usageValue − minimum)`),
  so they never overlap. Mobilization/deposit are separate lines on top.

**Month-count precision matters.** `monthStarts(startDate, endDate)` counts inclusive calendar
months between two dates — e.g. `2026-09-18 → 2027-03-31` is exactly 7 months
(Sep–Oct–Nov–Dec–Jan–Feb–Mar), but naively adding "N × 30 days" to a start date drifts to a
different month count (7 × 30 = 210 days from Sep 18 lands in mid-April — an 8-month span).
Any code that derives a contract's date range from a target recurring-month count (e.g. the
Pricing Lab's "Convert to contract" flow) must construct `endDate` as the last day of the
`(months − 1)`th month after `startDate`'s month, or the generated schedule's recurring total
will silently diverge from what was priced.

**Editing a contract's material terms** (value, dates, fees, pricing, billing terms) bumps
`contractVersion`. The Billing Schedule tab compares `sourceContractVersion` on the latest
schedule lines against the contract's current version and flags itself as stale until someone
explicitly regenerates — no silent auto-regeneration, since that could reissue lines a user is
actively reviewing.

**Regenerating** supersedes only lines still in a regeneratable status (`scheduled`/`draft`) —
already-`issued`/`paid` lines are left alone, since those correspond to real invoices that
already exist.

## 7. Pre-deployment investment case (Gap C — `investmentCase.ts`)

Reuses the exact same formulas as §2 (contribution margin, payback, cost/revenue per unit) —
this is what a deployment's page shows *before* any actuals exist, using its currently
**approved** budget (§3) as the cost assumption, instead of a flat $0-vs-$0 table.

`expectedUpfrontCashRequirement = max(0, plannedUpfrontCostTotal − depositCollected)` — a large
enough deposit can fully fund the upfront cost, meaning no net cash requirement at all.

**Approval thresholds** (`checkInvestmentCaseThresholds`, defaults in
`DEFAULT_FINANCE_THRESHOLDS`, overridable via the `settings` table key
`investment_case_thresholds`):

| Rule | Default |
|---|---|
| Minimum contribution margin % | 20% |
| Maximum payback | 12 months |
| Maximum up-front cash requirement | $100,000 |
| Minimum expected uptime | 80% |
| Minimum expected utilization | 60% |

Approving a case that fails one or more thresholds requires a non-empty `overrideReason`
(finance/admin only). Every decision — passed or overridden — freezes the threshold-failure
list at decision time (`thresholdFailuresJson`), so the record of *why* an override happened
never depends on thresholds that might change later. An **approved** case is immutable
(`isImmutable`); any further repricing creates a new version rather than editing the frozen
one, and approving a new version automatically supersedes the prior approved one.

## 8. Customer lifecycle inference (Gap B — `customerLifecycle.ts`)

Stage precedence, evaluated top to bottom (`computeLifecycleStage`):

1. **Active/Renewal** — a deployment exists with status `active` or `at_risk` (not just any
   signed contract — see the note below).
2. **Deploying** — a deployment exists but none are yet `active`/`at_risk`.
3. **Pilot** — a signed `pilot`-type contract exists, no deployment yet.
4. **Contracted** — a signed *non-pilot* contract exists, no deployment yet.
5. **Paused** — every contract is expired/cancelled/terminated with no live deployment.
6. Otherwise unchanged (manual stages like `lead`/`qualified` are never auto-assigned).

**A documented resolution of a spec tension**: a literal reading of "Active" as "a live
deployment *or* a signed non-pilot contract" would make "Contracted" unreachable (any signed
contract would immediately jump straight to Active without a deployment). This implementation
keys "Active" strictly off deployment status, so "Contracted" (signed, not yet deploying) stays
a real, reachable stage — matching the plain-English intent of the two labels.

**Automatic vs. manual**: any direct edit to `lifecycleStage` (customer edit form) marks the
customer `lifecycleSource: "manual"` and the automatic engine stops touching it until someone
explicitly clicks "Return to automatic lifecycle." Churn always requires a written reason and
is always manual — the automatic engine never assigns `churned` on its own. Every transition,
automatic or manual, is appended to `customer_lifecycle_history` with its source, trigger,
actor, and reason.

## 9. Double-booking prevention (`robotAssignment.ts`)

`validateRobotAssignment(robot)` rejects assigning any robot whose current status isn't
`available` or `idle` — this is the single source of truth used by the manual "Assign a robot"
UI action *and* the CSV robot-assignments importer, so a CSV can't be used to bypass a rule the
UI enforces.

## 10. Cash & runway (13-week forecast)

| | |
|---|---|
| Monthly net burn | `outflows − inflows` |
| Runway (months) | `currentCash / avgMonthlyNetBurn`, `null` (i.e. "not burning") if burn ≤ 0 |
| Weighted pipeline | `opportunityValue × winProbabilityPct / 100` |

Closing cash for a forecast period rolls forward: `startingCash + inflows − outflows`, chained
period to period (`closingCash`).
