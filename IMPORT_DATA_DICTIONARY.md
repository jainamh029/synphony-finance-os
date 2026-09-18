# CSV Import Data Dictionary

All bulk import happens on the **Weekly Data Entry** page (`/data-entry`), one tab per entity.
Every importer follows the same contract:

- Row-level validation — a CSV with 5 bad rows and 1 good row imports the 1 good row and
  reports exactly 5 errors (`Row N: <reason>`), never an all-or-nothing failure and never a
  silent partial write with no explanation.
- Unrecognized extra columns in a CSV are silently ignored (Zod strips unknown keys) — a
  template can be extended with notes columns etc. without breaking the parser.
- A blank cell on an *optional* column is valid ("not provided"); a blank cell on a *required*
  column is a validation error.
- Every date column must be `YYYY-MM-DD` — any other format (including `MM/DD/YYYY`) is
  rejected with `must be a valid date in YYYY-MM-DD format`.
- Every importer requires being signed in with a role that can write to that entity (see
  "Required role" per table below) — the same `requireWriteAccess()` guard the rest of the app
  uses; a Viewer/Board account cannot import anything.
- Downloadable templates live in `public/templates/*.csv`, one header row + one filled example
  row each.

Schemas live in `src/lib/validation/csvSchemas.ts`; the import actions themselves live in
`src/lib/actions/dataEntry.ts`.

---

## Customers — `customers_template.csv`
**Required role:** Admin, Sales, Finance

| Column | Required | Type | Default | Notes |
|---|---|---|---|---|
| farmName | yes | text | | |
| parentOrg | no | text | | |
| location | yes | text | | |
| cropType | no | text | `Strawberries` | |
| acres | no | number ≥ 0 | | |
| seasonStart | no | text | | Free text (e.g. `03-01`), not validated as a date |
| seasonEnd | no | text | | |
| expectedVolumeLbs | no | number ≥ 0 | | |
| manualLaborCostPerHour | no | number ≥ 0 | | |
| manualLaborCostPerLb | no | number ≥ 0 | | |
| customerOwner | no | text | | |
| lifecycleStage | no | enum | `lead` | `lead, qualified, pilot, contracted, deploying, active, renewal, paused, churned, archived` |
| notes | no | text | | |

Imported customers get `lifecycleSource: "automatic"` — the lifecycle engine will move them
forward as contracts/deployments are created for them, same as one created through the UI.

## Contracts — `contracts_template.csv`
**Required role:** Admin, Sales, Finance

| Column | Required | Type | Default | Notes |
|---|---|---|---|---|
| customerId | yes | uuid | | **FK-checked** against existing customers; unmatched rows are rejected with a readable error, not a raw DB constraint failure |
| contractType | yes | enum | | `pilot, fixed_seasonal, per_robot_hour, per_pound, per_acre, raas_subscription, software_subscription, hybrid` |
| startDate / endDate | yes | date | | |
| totalContractValue | yes | number ≥ 0 | | See FINANCIAL_LOGIC.md §6 for what this means per contract type |
| mobilizationFee | no | number ≥ 0 | 0 | |
| depositAmount | no | number ≥ 0 | 0 | |
| minimumCommitment | no | number ≥ 0 | 0 | |
| variablePricePerUnit | no | number ≥ 0 | | |
| variableUnitType | no | enum | | `lb, robot_hour, acre` |
| monthlySubscriptionAmount | no | number ≥ 0 | | |
| expectedOutputVolume | no | number ≥ 0 | | |
| robotsCommitted | no | integer ≥ 0 | 0 | |
| paymentTermsDays | no | integer > 0 | 30 | |
| status | no | enum | `active` | `draft, in_review, active, completed, cancelled, expired, archived, terminated, renewed` |
| notes | no | text | | |

**Every successfully imported contract gets a billing schedule generated automatically**
(the same `generateOrRegenerateSchedule` call a contract created through Contracts → New
contract gets) — importing a contract via CSV and then finding nothing on its Billing Schedule
tab would be a real gap, so this happens as part of the import, not as a manual follow-up step.
The customer's lifecycle stage is also re-synced for each imported contract.

Note: this schema doesn't expose `billingFrequency`/`paymentTerms` (the newer enum-based
terms fields) — imported contracts get the column defaults (`monthly` / `net_30`) for those.
`paymentTermsDays` (the field that actually drives schedule due-dates) is fully
CSV-controlled independent of that default.

## Robots — `robots_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type | Default | Notes |
|---|---|---|---|---|
| robotCode | yes | text | | |
| model | yes | text | | |
| serialNumber | no | text | | |
| acquisitionType | no | enum | `manufactured` | `purchased, manufactured, leased, customer_funded, partner_provided` |
| acquisitionDate | yes | date | | |
| purchaseCost | yes | number ≥ 0 | | |
| usefulLifeMonths | no | integer > 0 | 48 | |
| monthlyLeaseCost | no | number ≥ 0 | 0 | |
| warrantyExpiry | no | date | | |
| notes | no | text | | |

Imported robots start with `status: "available"`.

## Deployments — `deployments_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type | Default | Notes |
|---|---|---|---|---|
| customerId | yes | uuid | | **FK-checked** |
| contractId | yes | uuid | | **FK-checked** |
| name | yes | text | | |
| status | no | enum | `planned` | any `DEPLOYMENT_STATUSES` value |
| plannedStartDate / plannedEndDate | yes | date | | |
| actualStartDate / actualEndDate | no | date | | |
| robotsPlanned | no | integer ≥ 0 | 0 | |
| expectedOperatingHours | no | number ≥ 0 | | |
| expectedOutputVolume | no | number ≥ 0 | | |
| expectedTechnicianHours | no | number ≥ 0 | | |
| expectedUptimePct | no | 0–100 | 90 | |
| expectedUtilizationPct | no | 0–100 | 70 | |
| operationsOwner / financeOwner | no | text | | |
| notes | no | text | | |

Imported deployments do **not** get a planned budget (unlike one created through Deployments →
New deployment, which has inline budget-line fields) — add its budget afterward from the
deployment page's Planned Budget editor. The customer's lifecycle stage is re-synced for each
imported deployment.

## Robot assignments — `robot_assignments_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type | Default | Notes |
|---|---|---|---|---|
| robotId | yes | uuid | | Must exist; **same double-booking guard as the manual "Assign a robot" action** — a robot not currently `available`/`idle` is rejected with the exact same error message the UI shows |
| deploymentId | yes | uuid | | **FK-checked** |
| assignmentStart | yes | date | | |
| assignmentEnd | no | date | | Leaving this blank creates an **open** (current) assignment and flips the robot's status to `operating`; providing it creates a closed historical assignment and leaves the robot's status untouched |

Any existing open assignment for the same robot is closed as of `assignmentStart` before the
new row is inserted — the same defensive cleanup the manual action does.

## Robot metrics — `robot_metrics_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type | Default |
|---|---|---|---|
| date | yes | date | |
| robotId / deploymentId | yes | text | |
| availableHours / activeHours / productiveHours | yes | number ≥ 0 | |
| downtimeHours / interventionHours / outputUnits / poundsHarvested | no | number ≥ 0 | 0 |
| maintenanceIncidents | no | integer ≥ 0 | 0 |
| repairCost / sparePartsCost / technicianHours / technicianLaborCost | no | number ≥ 0 | 0 |
| notes | no | text | |

**Cross-field validation** (regression-tested against production bug #3): `productiveHours ≤
activeHours ≤ availableHours`, and `downtimeHours ≤ availableHours`. A row that violates any of
these is rejected with a specific message, not silently written and left to corrupt downstream
utilization/uptime math.

## Costs — `costs_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type |
|---|---|---|
| deploymentId | yes | text |
| date | yes | date |
| costType | yes | enum (any `COST_TYPES` value) |
| amount | yes | number > 0 |
| vendor / notes | no | text |

## Labor — `labor_logs_template.csv`
**Required role:** Admin, Operations, Finance

| Column | Required | Type |
|---|---|---|
| deploymentId | yes | text |
| employeeRole | yes | text |
| date | yes | date |
| hours | yes | number > 0 |
| hourlyCost | yes | number > 0 |
| taskType | no | text |

## Invoices — `invoices_template.csv`
**Required role:** Admin, Finance

| Column | Required | Type | Default |
|---|---|---|---|
| contractId | yes | text | |
| deploymentId | no | text | |
| invoiceNumber | yes | text | |
| invoiceDate / dueDate | yes | date | |
| amount | yes | number > 0 | |
| status | no | enum | `sent` (`draft, sent, paid, partial, overdue, void`) |
| amountPaid | no | number ≥ 0 | 0 |
| paidDate | no | date | |

For one-off invoices, use Billing & Collections → New invoice instead — this importer creates
new invoice rows, it does not generate them from a contract's billing schedule (see
FINANCIAL_LOGIC.md §6 for the schedule-driven path).

## Payments — `payments_template.csv`
**Required role:** Admin, Finance

| Column | Required | Type |
|---|---|---|
| invoiceNumber | yes | text — must match an existing invoice's `invoiceNumber` exactly |
| amountPaid | yes | number > 0 |
| paidDate | yes | date |

Applies a payment to an **existing** invoice (looked up by `invoiceNumber`), through the exact
same overpayment guard as recording a payment manually (regression-tested against production
bug #4): a payment that would push the invoice's `amountPaid` past its `amount` is rejected
with the exact remaining balance in the error message, not silently capped. Two payment rows
for the same invoice in one file are applied in order against each other's running balance, not
both checked against the same pre-import snapshot.

---

## What's intentionally not CSV-importable

- **Budget revisions** (Gap D) — always created through the deployment page's editor, since a
  revision beyond the 10% material-change threshold requires a human-written reason.
- **Investment case decisions** (Gap C) — approval is a finance sign-off action, not bulk data.
- **Customer lifecycle overrides** — a manual override always requires an explicit actor and
  (for churn) a reason; bulk-overriding lifecycle stages via CSV would defeat the audit trail
  the lifecycle history table exists to provide.
