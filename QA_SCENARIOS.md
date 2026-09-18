# QA Scenarios

Automated coverage: **141 tests across 12 files**, all passing (`npm test`). `npx tsc --noEmit`
and `npx eslint .` are both clean. This document maps that coverage — plus the manual
browser/database verification actually performed while building each gap — to the required
testing categories (A–G). Nothing here is aspirational; every "verified" line below was run
against a live Postgres database and, where noted, a real browser session this session.

---

## A. Regression tests — the 5 production bugs

Every one of these has a dedicated test file asserting the *original failure mode* is now
rejected, run before and after all other work in this session (still 141/141 at the end).

| Bug | Root cause | Fix | Test file | Tests |
|---|---|---|---|---|
| #1 Robot double-booking | `assignRobot()` had zero status validation | `validateRobotAssignment()` rejects non-`available`/`idle` robots | `src/lib/domain/robotAssignment.test.ts` | 6 |
| #2 Repair/maintenance robots assignable | same root cause as #1 | same fix, same guard | `src/lib/domain/robotAssignment.test.ts` | (included above) |
| #3 CSV date / cross-field validation | no format check on date strings; no relationship checks between hour fields | `isoDate` regex + `metricSchema` cross-field `.refine()`s (`productiveHours ≤ activeHours ≤ availableHours`, `downtimeHours ≤ availableHours`) | `src/lib/validation/csvSchemas.test.ts` | 14 |
| #4 Invoice overpayment | `recordPayment()` had no cap; $999,999 accepted against a $5,000 balance | `validatePayment()` rejects any payment beyond remaining balance (±$0.01 float tolerance), used by the manual action, the CSV payments importer, and nowhere else | `src/lib/domain/payments.test.ts` | 8 |
| #5 Alert deduplication collision | all `collections_overdue` alerts shared key `"collections_overdue::::"` | added a `dedup_key` column; `selectNewAlertCandidates()` keys strictly by invoice/deployment/robot id | `src/lib/domain/alertDedup.test.ts` | 9 |

**This session's contribution to category A**: no regressions were introduced — the same
5 test files pass unchanged after every batch of Gap A–F work. One *new* regression-class bug
was found and fixed in this session (not one of the original 5, but the same discipline
applied): `optionalIsoDate` — a blank optional-date CSV cell was being rejected outright
instead of treated as "not provided," which silently broke the *shipped*
`invoices_template.csv` sample row. See `src/lib/validation/csvSchemas.test.ts` →
"regression: optional CSV date columns accept a blank cell" (5 tests), and §F below.

## B. Contract lifecycle & customer lifecycle tests (Gaps A & B)

**Gap A — invoice schedule generation** (`src/lib/domain/invoiceSchedule.test.ts`, 7 tests):
fixed-seasonal upfront billing net of mobilization/deposit; hybrid seasonal contract with
distinct deposit/mobilization/minimum/usage-overage lines; monthly RaaS billed independently of
`totalContractValue`; per-pound usage-based billing; hybrid non-double-counting; custom
milestone billing; zero-amount components produce no noise rows.

Manually verified live (this session, admin account, local Postgres):
- Generated a contract, approved an investment case, edited its budget past the 10% material
  threshold, approved the new version — confirmed the P&L's "planned" figure updated to the
  new approved total ($178,000 → $220,000) and the chart/KPI cards picked it up immediately.
- Converted a saved Pricing Lab scenario (RaaS, 7 billable months) into a draft contract —
  confirmed the generated billing schedule totalled exactly `contractValue + deposit`
  ($236,000 = $211,000 + $25,000), not a mismatched total from a naive date calculation (see
  §D below for the bug this caught).

**Gap B — customer lifecycle automation** (`src/lib/domain/customerLifecycle.test.ts`, 12 tests):
every stage transition (Contracted, Pilot, Deploying, Active, `at_risk` still counts as Active,
Renewal window, Paused not Churned, no-op with no contracts/deployments), determinism
(computing twice gives the same answer), and both contradiction-warning cases (Churned with an
active contract on file; Lead with a signed active contract on file).

Manually verified live: viewed a customer's lifecycle history table (source/trigger/actor/
reason columns all populated), confirmed the "Return to automatic lifecycle" button appears
only after a manual override, and confirmed "Mark as churned" requires a non-empty reason.

## C. Investment-case tests (Gap C)

`src/lib/finance/investmentCase.test.ts` (9 tests): expected P&L is real (not $0 vs $0) before
any actuals exist; payback correctly nets the deposit against the upfront cash requirement; a
deposit large enough to cover the upfront cost yields zero net cash requirement; negative
margin reconciles and fails its own target; outputs reconcile to the same formulas already
proven in `calculations.test.ts`; a healthy case passes all 5 thresholds; a negative-margin
case cannot pass without an override; uptime/utilization-below-minimum are reported as
*separate* threshold failures (not merged into one message); a downside scenario changes
payback/cash-requirement outputs correctly.

Manually verified live (admin account): generated a base-case investment case for a real
deployment → Submit for review → Approve with a decision note → confirmed the case froze
(`isImmutable`, badge changed to "Frozen snapshot", decision form replaced by a read-only
decision note + decided-by/decided-at line) → confirmed "Recompute" relabeled to "Recompute as
new version".

## D. Pricing tests (Gap E)

`src/lib/finance/pricingEngine.test.ts` (13 tests): all 7 pricing methods' revenue formulas;
minimum-commitment flooring in both directions (usage below floor → floor applies; usage above
floor → usage value used, not double-counted with the floor); all 3 hybrid sub-cases (minimum
only, monthly-fee-replaces-minimum, mobilization+minimum with no usage component); price
changes recalculate proportionally; zero inputs never produce NaN/negative revenue.

Manually verified live: switched the Pricing Lab through fixed/per-pound/RaaS methods and
confirmed each one's computed breakdown line-by-line against the formulas in
FINANCIAL_LOGIC.md §5, including the minimum-floor case (100,000 lb × $0.65 = $65,000
estimate, below the $180,000 floor → floor line shown, correct total). Saved a scenario,
assigned it a customer, and used "Convert to contract" end-to-end.

**Bug found and fixed during this verification**: the first version of "Convert to contract"
built the new contract's date range with naive `+N×30 days` arithmetic, which lands on a
different calendar-month count than the pricing engine's `billableMonths` (7×30=210 days from
Sep 18 spans 8 calendar months, not 7) — so the generated billing schedule ($224,000 for 8
months) silently diverged from what was priced ($196,000 for 7 months). Fixed by constructing
the end date as the last day of the `(months−1)`th month after the start month, guaranteeing an
exact month count; re-verified live (screenshot-level confirmation: dates now Sep 18 → Mar 31,
exactly 7 months, schedule total = contract value + deposit exactly). See FINANCIAL_LOGIC.md §6.

## E. Budget tests (Gap D)

`src/lib/domain/budgetRevision.test.ts` (5 tests): a change under 10% is not material; over
10% is material; a *decrease* over 10% is also material (uses absolute value, not signed);
exactly 10% is not material (threshold is exclusive); a brand-new budget with no prior total is
never flagged material (nothing to compare against).

**Bug found and fixed during this work**: `getDeploymentRollups()` and `getDeploymentDetail()`
both summed *every* budget-item row regardless of version/approval status — harmless with a
single version, but as soon as a deployment got a second (draft) version, planned cost would
double- or triple-count across the P&L, KPI cards, and Fleet Economics pages. A second bug
compounded it: `seed.ts`'s budget rows never set `isApproved`/`version` at all, so after fixing
the query to filter on `isApproved`, every existing seeded deployment would have shown **$0**
planned cost until reseeded. Both fixed; confirmed via `psql` that all 54 seeded budget rows
now carry `is_approved = true, version = 1`, and via the live P&L page that "Budget vs. actual
direct cost" shows the correct planned total both before and after a revision is approved.

Manually verified live, full round trip: typed a >10% change with no reason → rejected with the
exact expected message and dollar figures → typed a change reason → resubmit → saved as draft
v2 → approved → P&L, budget table, and investment-case inputs all reflected the new total.

**Bug found and fixed during this verification**: `BudgetRevisionForm` and
`InvestmentCaseDecisionForm` used uncontrolled (`defaultValue`) inputs. React resets
uncontrolled form fields after *any* Action call that resolves without throwing — including the
validation-failure path, which deliberately returns `{ok: false, error}` instead of throwing so
the error can render inline. From React's perspective that's still a "successful" submission,
so the user's typed $90,000 silently reverted to $48,000 right after being told to add a change
reason — the resubmit then saved a wrong "0% change" revision instead of the intended one.
Fixed by making both forms' fields controlled by local component state instead of
`defaultValue`, with the form keyed to remount (and pick up fresh server data) only on a
genuine version change, not on every render. Re-verified live: typed $90,000 → rejected →
value still showed $90,000 → added a reason → resubmit → saved correctly as $90,000 with the
right reason attached, confirmed via `psql`.

## F. Import tests (Gap F)

`src/lib/validation/csvSchemas.test.ts` (34 tests) covers every CSV schema, including the 3 new
ones added this session (deployments, robot assignments, payments) and the `optionalIsoDate`
regression above.

The importers themselves (`src/lib/actions/dataEntry.ts`) can't be driven through this
session's sandboxed browser — its file-input elements can't be set programmatically (a hard
browser security restriction, not an app bug). Rather than skip verification, each new
importer's actual logic (CSV parse → FK check → domain guard → DB write) was run directly
against the live local database via standalone scripts that exercise the identical code path:

- **Robot assignments**: available robot → assigned successfully, robot status flipped to
  `operating`, assignment row inserted. Already-operating robot → rejected with the *exact*
  double-booking error message the manual "Assign a robot" UI produces (same
  `validateRobotAssignment()` call). Unknown robot id → rejected ("Robot not found").
- **Payments**: valid partial payment → invoice `amountPaid`/`status` updated correctly
  (`partial`). Overpayment attempt ($999,999 against a $32,500 invoice) → rejected with the
  exact remaining-balance message, invoice **left completely unchanged** (verified via a
  second read). Unknown invoice number → rejected.
- **Deployments**: valid row with real customer/contract ids → inserted with all fields
  correct. Unknown customerId / unknown contractId → each rejected with a specific row-level
  error, one row still succeeds (partial-import-of-valid-rows behavior, same as every other
  importer).
- **Contracts**: confirmed (via the pre-existing December `importContractsCsv` code path,
  fixed this session) that a successfully imported contract now gets a billing schedule
  generated automatically — previously it did not, which would have made every CSV-imported
  contract's Billing Schedule tab silently empty.

All test-script mutations were made against the local dev database and then removed by
re-running `npm run db:seed`, leaving no residue in the demo dataset.

## G. Security / permissions tests

`src/lib/auth/permissions.test.ts` (6 tests, new this session) — the pure role-capability
matrix every mutating server action's `requireWriteAccess()` call reduces to
(`canEditFinanceAssumptions`, `canEditOperations`, `canEditSales`, `isReadOnly`), exercised
against all 5 roles (`admin, finance, operations, sales, viewer`):
- Only `viewer` is read-only.
- Finance-assumption actions (investment case decisions, budget approval) are `admin`/`finance`
  only.
- Operations actions (robot assignment, deployment status, budget drafts) exclude `sales` and
  `viewer`.
- Sales actions (customers, contracts, pricing scenarios) exclude `operations` and `viewer`.
- `admin` passes every capability check; `viewer` fails every one.

This was extracted from `src/lib/auth/session.ts` into a pure `permissions.ts` module (no
`db`/`cookies` import) specifically so it could be unit-tested without a live database or
request context — the same pure/DB-touching split pattern used throughout this codebase's
domain layer (`src/lib/domain/*.ts` vs. `*Sync.ts`).

**`requireWriteAccess()` itself** (the guard, not just the matrix) is exercised indirectly by
every action in the app and was spot-checked manually this session by exercising the
Investment Case / Budget flows as an **admin** account (full access) — every gated button
rendered and every action succeeded. Not separately re-verified this session as a
lower-privileged account (e.g. confirming a `sales` login sees the Finance Decision panel
replaced by "Only Finance/Admin accounts can record an approval decision") — this was verified
for the equivalent Gap B/C UI patterns in the acceptance-test phase that preceded this session's
work, and the same `canEditFinanceAssumptions(role)`/`canEditOperations(role)` calls gate the
new Gap C/D UI identically. **Recommended before sign-off**: log in as `ops@synphony.demo` and
`sales@synphony.demo` and confirm the Investment Case decision form and Planned Budget editor
are hidden/shown exactly as the permission matrix above predicts.

---

## Full test suite

```
npm test
```
```
Test Files  12 passed (12)
     Tests  141 passed (141)
```

## Founder acceptance walkthrough (manual, ~10 minutes)

1. Sign in as `ceo@synphony.demo` / `synphony2026`.
2. Open a deployment → generate an investment case → submit for review → approve with a
   decision note. Confirm the case badge shows "approved" and "Frozen snapshot", and that
   "Recompute" now reads "Recompute as new version".
3. On the same deployment, expand "Edit budget" → change one line by more than 10% → try to
   save with no reason (expect a rejection naming the exact percentage and dollar change) →
   add a reason → save → approve the new version. Confirm the P&L's "Budget vs. actual" total
   updates to match.
4. Open Pricing & ROI Lab → switch pricing method to "Monthly RaaS subscription" → assign a
   customer → Save scenario → find it in "Saved scenarios" → Convert to contract. Confirm the
   new draft contract's dates, billing schedule, and totals match FINANCIAL_LOGIC.md §6's
   raas_subscription model (schedule total = contract value + deposit).
5. Open Weekly Data Entry → Robot assignments tab → download the template → confirm the column
   headers match IMPORT_DATA_DICTIONARY.md.
6. Open a customer with a lifecycle contradiction (or manually override one's stage, then edit
   its contract to create one) → confirm the warning banner appears and names the contradiction.
