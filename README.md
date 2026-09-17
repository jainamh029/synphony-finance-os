# Synphony Deployment Finance OS

**A finance-and-operations decision system for agricultural robotics deployments.**

It connects grower contracts, fleet deployment data, labor and maintenance costs, revenue,
invoices, and cash flow to calculate contribution margin, robot utilization, cost per pound,
customer ROI, deployment payback, and runway — so management can decide which deployments to
scale, reprice, improve, or pause before committing more robots and capital.

> **⚠️ All data in this repository is DEMO / ILLUSTRATIVE.** Every customer, contract, robot,
> cost, and dollar figure is fictional, generated to exercise the required scenarios (a
> profitable deployment, a loss-making one, an overdue invoice, a low-uptime fleet, a pilot
> about to expire, and a capacity-constrained opportunity). Nothing here represents Synphony's
> actual customers, pricing, or financials. See [Replacing demo data](#replacing-demo-data-with-real-synphony-data) below.

---

## Contents

- [Quick start](#quick-start)
- [Demo login credentials](#demo-login-credentials)
- [Architecture](#architecture)
- [The five modules](#the-five-modules)
- [Data dictionary](#data-dictionary)
- [Calculation methodology](#calculation-methodology)
- [Role-based access](#role-based-access)
- [Replacing demo data with real Synphony data](#replacing-demo-data-with-real-synphony-data)
- [Testing](#testing)
- [Known assumptions & limitations](#known-assumptions--limitations)
- [Feature checklist vs. acceptance criteria](#feature-checklist-vs-acceptance-criteria)
- [Next three highest-value integrations](#next-three-highest-value-integrations)

---

## Quick start

Requirements: Node.js 20.9+ (the app was built and tested on Node 25), npm.

```bash
npm install
npm run db:push      # creates ./data/synphony.db from the Drizzle schema
npm run db:seed      # loads 6 customers, 8 contracts, 15 robots, 120+ days of metrics, etc.
npm run dev          # http://localhost:3000
```

Then sign in with any account from [Demo login credentials](#demo-login-credentials).

Other useful commands:

```bash
npm test             # run the calculation-engine unit tests (vitest)
npm run build        # production build (Turbopack)
npm run db:reset     # push schema + reseed in one step (wipes and recreates all demo data)
```

There is nothing else to configure — no `.env` is required to run locally. `.env.example`
documents the variables you'd add if you swap in Postgres or a production auth provider (see
[Next integrations](#next-three-highest-value-integrations)).

## Demo login credentials

Seeded by `npm run db:seed`, password **`synphony2026`** for all of them:

| Role | Email | What they can do |
|---|---|---|
| Admin / CEO | `ceo@synphony.demo` | Full access to everything |
| Finance | `finance@synphony.demo` | Full financial + contract + billing access |
| Operations | `ops@synphony.demo` | Deployments, robots, costs, labor, metrics |
| Sales | `sales@synphony.demo` | Customers, contracts, pricing scenarios |
| Viewer / Board | `board@synphony.demo` | Read-only everywhere |

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack, React 19) + TypeScript, Tailwind CSS v4,
Drizzle ORM over SQLite (`better-sqlite3`), Zod validation, Recharts, Vitest.

This is a deliberately simpler stack than the "Next.js + Postgres + Supabase Auth" target
architecture described in the original brief — chosen because it removes every external
service dependency (no database server, no auth provider, no cloud account) while keeping
the same data model and calculation logic, so it runs from a cold clone with three commands.
The schema and finance-calculation layer were both written to be swapped onto Postgres +
Supabase Auth without a rewrite — see [Next integrations](#next-three-highest-value-integrations).

```
src/
  db/
    schema.ts          Drizzle schema — every table in the data dictionary below
    client.ts           SQLite connection (swap for a Postgres client here)
    seed.ts              Demo data generator (deterministic — same seed every run)
  lib/
    finance/
      calculations.ts    PURE calculation functions — the single source of truth for every
                          formula in the app (contribution margin, payback, utilization,
                          uptime, ROI, cash/runway, AR aging...). Unit-tested in
                          calculations.test.ts. UI components never compute financial
                          logic themselves — they call into here.
      aggregate.ts        Rolls raw DB rows (costs, robot_metrics, invoices...) up into the
                          per-deployment / per-robot / AR-aging shapes the calculations need.
      alerts-engine.ts    Pure alert-trigger rules (evaluate*) over aggregated data.
                          Unit-tested in alerts-engine.test.ts.
      alerts-sync.ts       DB-touching wrapper: recomputes all alert rules and inserts any
                          newly-triggered one that isn't already open.
      dashboard.ts        Executive Command Center aggregation
      cashForecast.ts      13-week weekly + 24-month monthly cash forecast, per scenario
      runway.ts            Shared cash/burn/runway snapshot (dashboard + alerts + cash page)
    actions/              Server Actions — all mutations, one file per module, each guarded
                          by requireWriteAccess() (see Role-based access)
    auth/session.ts        Cookie-session auth + role helpers
    csv/                    Client-side CSV export helper
  components/
    ui/                    Design-system primitives (Card, Badge, DataTable, form fields...)
    charts/                Recharts wrappers, one file per module
    layout/                Sidebar / Topbar
    forms/                  Shared multi-field forms (CustomerForm, CsvUploader)
  app/
    login/                 Sign-in page + action
    (app)/                 Everything behind auth, one folder per module (see below)
      dashboard/            Module A — Executive Command Center
      customers/, contracts/, invoices/   Module B — Customers, Contracts & Billing
      deployments/           Module C — Deployment planning & P&L
      robots/                Module D — Fleet Economics
      pricing-lab/           Module E — Pricing & Customer ROI Lab
      cash-forecast/         Module F — Cash, Capex & Runway
      alerts/                Module G — Alerts & Actions
      data-entry/             Weekly data entry (manual forms + CSV upload)
      reports/                Module H — Reports & Exports
```

**Why the finance logic lives outside components:** every formula in the spec
(`calculations.ts`) is a plain, side-effect-free function of its inputs — no database, no
React. That's what makes it possible to unit-test contribution margin, payback, utilization,
runway, and the ROI model without spinning up a database or rendering a page, and it's why the
same functions back the dashboard, the deployment P&L, the pricing lab, and the reports.

## The five modules

Matches the "Start here" scope in the brief:

1. **Executive Command Center** (`/dashboard`) — cash, burn, runway, backlog, recognized
   revenue, collections, fleet status, deployment risk heatmap, top-5 customers by
   value/margin, AR aging chart, and the ranked "needs attention" queue.
2. **Deployment P&L** (`/deployments/[id]`) — the most important page. Budget-vs-actual by
   cost category, revenue/cost/contribution-margin by month, robot roster with per-robot
   economics, invoices, related alerts, and an editable notes/owner field. `/deployments` is
   the sortable/filterable list; `/deployments/new` builds the pre-deployment investment case
   (planned budget by category → expected contribution margin & payback) *before* a deployment
   is approved.
3. **Fleet Economics** (`/robots`) — fleet-wide utilization/uptime, best/worst robots by
   contribution margin, overdue-maintenance and idle-robot flags, and a full sortable table.
   `/robots/[id]` drills into one robot's weekly output and assignment history.
4. **Pricing & Customer ROI Lab** (`/pricing-lab`) — fully client-side interactive calculator
   (every keystroke recomputes live) showing customer ROI and Synphony economics side by side,
   a ±20% sensitivity table per lever, scenario save, and a print-friendly proposal view.
5. **Cash, Capex & Runway** (`/cash-forecast`) — 13-week weekly forecast and 24-month monthly
   operating model, switchable across the three seeded scenarios (Base / Downside / Growth),
   plus a "deploy N more robots" capital-and-payback calculator.

Everything else (Customers, Contracts, Billing & Collections, Alerts & Actions, Weekly Data
Entry, Reports & Exports) is the supporting CRUD and workflow the five modules above depend on.

## Data dictionary

All tables are in `src/db/schema.ts`. UUID primary keys, `created_at`/`updated_at` timestamps
on every mutable table, `is_demo` boolean on every table seeded with sample data (so a real
deployment can filter demo rows out once real data is loaded).

| Table | Purpose | Key fields |
|---|---|---|
| `users` | Demo accounts | email, name, password_hash, role |
| `customers` | Farms/growers | farm_name, location, crop_type, acres, season_start/end, manual_labor_cost_per_hour/lb, lifecycle_stage |
| `contracts` | Deal terms | customer_id, contract_type, total_contract_value, mobilization_fee, deposit_amount, variable_price_per_unit, monthly_subscription_amount, robots_committed, payment_terms_days, status |
| `invoices` | Billing & collections | contract_id, deployment_id, invoice_date, due_date, amount, amount_paid, paid_date, status |
| `deployments` | Unit of financial accountability | customer_id, contract_id, status, planned/actual dates, robots_planned, expected_uptime/utilization_pct, operations/finance_owner |
| `deployment_budget_items` | Pre-deployment budget | deployment_id, category (17 cost categories), planned_amount, is_upfront |
| `robots` | Fleet | robot_code, model, acquisition_type/date/cost, useful_life_months, status, maintenance dates |
| `robot_assignments` | Which robot is on which deployment, when | robot_id, deployment_id, assignment_start/end |
| `robot_metrics` | Weekly actuals per robot | date, available/active/productive/downtime/intervention_hours, output_units, pounds_harvested, repair/spare_parts_cost, technician_hours/cost |
| `costs` | Direct deployment cost ledger | deployment_id, date, cost_type (16 categories), amount, vendor |
| `labor_logs` | Labor hours ledger | deployment_id, employee_role, date, hours, hourly_cost, task_type |
| `alerts` | Auto-generated action queue | alert_type, severity, module, customer/deployment/robot_id, recommended_action, estimated_impact, owner, status |
| `pricing_scenarios` | Saved ROI Lab runs | customer_id, scenario_case, inputs_json, outputs_json |
| `forecast_scenarios` | Base/Downside/Growth cash assumptions | starting_cash, monthly opex lines, robot_unit_cost, robots_planned_per_month_json, collections_delay_days, utilization_adjustment_pct, financing_inflow_json |
| `settings` | Company-wide KV (e.g. current cash balance) | key, value |

## Calculation methodology

Every formula lives in `src/lib/finance/calculations.ts` (with `aggregate.ts` doing the
rollups that feed it) and is exercised by `calculations.test.ts` / `alerts-engine.test.ts`
(34 tests, `npm test`). The headline ones:

- **Contribution Margin** = Recognized Revenue − (field labor + maintenance + spare parts +
  repairs + travel + lodging + cloud/compute + data + insurance + robot depreciation + other).
- **Recognized revenue** is straight-line over the contract term, gated on the *deployment*
  having actually started (`actualStartDate` set) — a signed-but-undeployed contract
  (Pacific Berry in the demo data) recognizes $0, even though its contract term has begun.
- **Expected/Actual Payback Period** = up-front deployment investment ÷ **monthly**
  contribution margin (the actual-to-date run rate is annualized by months elapsed since
  `actualStartDate`, never total-to-date margin — dividing upfront cost by *cumulative* margin
  understates payback dramatically the longer a deployment has been running).
- **Fleet Utilization** = Productive Hours ÷ Available Hours. **Uptime** = (Available −
  Downtime) ÷ Available. Both return `null` ("N/A") rather than dividing by zero.
- **Cost per Pound** = Direct Deployment Cost ÷ Pounds Harvested, compared against the
  customer's manual-labor-cost-per-pound benchmark to test Synphony's core value claim.
- **Customer ROI** = (avoided labor cost, burden-loaded, + yield/quality benefit) − Synphony
  fees, with payback = customer up-front cost ÷ monthly net benefit.
- **Runway** = current cash ÷ average forward monthly net burn; shown as "Cash-flow positive"
  rather than a runway figure whenever burn is ≤ 0 (never a negative or infinite runway).
- **Cash forecast collections**: outstanding invoices are anchored at `max(today, due_date) +
  scenario_slip_days`, never at `invoice_date + slip` — anchoring on invoice date would let a
  longer delay assumption drag already-overdue backlog *forward* into the visible window
  (since a shorter delay would already have "used up" that cash before the window even
  started), which perversely made the Downside scenario look better in the near term during
  development. This is covered by the model's design note in `cashForecast.ts`.

## Role-based access

Enforced in `src/lib/auth/session.ts` (`requireWriteAccess`) and called as the **first line**
of every mutating Server Action — not just hidden in the UI. A signed-in Viewer/Board account
that navigates directly to a write URL and submits a form gets a server-side `Forbidden`
error; nothing is written. Role groups:

- **Admin**: everything.
- **Finance**: everything except (nothing is currently finance-only-restricted from admin).
- **Operations**: deployments, robots, costs, labor, metrics.
- **Sales**: customers, contracts, pricing scenarios.
- **Viewer**: read-only everywhere.

See [Known assumptions & limitations](#known-assumptions--limitations) for what this does
*not* yet cover.

## Replacing demo data with real Synphony data

No code changes are needed:

1. Go to **Reports & Exports → CSV import templates** and download the template for each
   entity (customers, contracts, robots, costs, labor logs, robot metrics, invoices).
2. Delete the demo rows you don't want (Customers/Robots pages, or wipe everything with
   `npm run db:reset` and re-seed with your own script based on `src/db/seed.ts`).
3. Fill in the templates with real values — customer/contract/deployment/robot IDs referenced
   by cost, labor, and metrics rows are UUIDs you'll copy from each entity's detail page URL,
   or from a CSV export of that table (Reports → Raw data export).
4. Use **Weekly Data Entry** to bulk-upload costs, labor, robot metrics, and invoices; use
   **Customers → New**, **Contracts → New**, **Robots → New** for the smaller reference tables
   (no CSV import wired up for those three yet — see limitations below).
5. Every seeded row has `is_demo = true`; every row you add through the UI/CSV import has
   `is_demo = false`, so a future "hide demo data" toggle is a one-line filter away.

## Testing

```bash
npm test
```

34 tests across two files:

- `src/lib/finance/calculations.test.ts` — every formula (safe division, fleet economics,
  deployment P&L, AR aging, cash/runway, pricing & ROI), including the two timezone bugs and
  one payback-period bug that were caught and fixed during development (documented in the
  file's comments would be redundant — see git history / the fixes below).
- `src/lib/finance/alerts-engine.test.ts` — every alert trigger rule, including that a
  pre-revenue deployment doesn't get flagged for margin, and that runway severity escalates
  correctly through the 9/6/3-month thresholds.

`npm run build` (production Turbopack build) and `npx tsc --noEmit` both pass cleanly.

## Known assumptions & limitations

Read this before treating any number as load-bearing — these are the calls made to ship a
working MVP, not gaps hidden from you:

- **"Season-to-date" = calendar-year-to-date.** There's no per-customer season-boundary
  rollup yet; the dashboard's STD figures use Jan 1 of the current year as the anchor.
- **Payback in the Deployment P&L is *mobilization cost* payback, not fleet capex payback.**
  Robot purchase cost is modeled as a recurring monthly depreciation line (already inside
  contribution margin), so "up-front investment" in that payback formula is only the
  one-time shipping/install/integration budget items marked `is_upfront`. Company-wide fleet
  capex recovery is what the Cash & Capex Planner's "fleet expansion" calculator is for.
- **Per-robot contribution margin (Fleet Economics) ≠ deployment contribution margin.**
  The former allocates revenue pro-rata by productive hours and subtracts only
  robot-attributable costs (repairs, spare parts, that robot's technician labor) — it
  deliberately excludes deployment-level shared overhead (travel, lodging, insurance, cloud,
  depreciation), which only shows up in the deployment-level number. Both are individually
  correct; they answer different questions.
- **Role-based UI hiding is incomplete.** The security boundary (`requireWriteAccess` in every
  Server Action) is real and tested manually — a Viewer account cannot mutate anything even by
  navigating to a raw form URL. But most "+ New" buttons and forms are still *visible* to a
  Viewer today; only the write path is blocked. Hiding the controls themselves is cosmetic
  polish, not a security fix, and was deprioritized to finish the five core modules.
- **No CSV import yet for customers, contracts, or robots** (only costs, labor, robot metrics,
  and invoices — the four "weekly actuals" entities the brief calls out explicitly). Templates
  for all seven are provided; the other three go through the New-record forms today.
- **Cash forecast is a run-rate model**, not a full invoice-schedule simulator. Future
  recurring billings are projected from each active contract's straight-line monthly revenue
  spread evenly across weeks, not from an explicit generated invoice schedule per contract.
- **No PDF generation** — "printable" reports use `window.print()` with print-specific CSS
  (navigation chrome hidden), which produces a clean PDF via any browser's "Save as PDF," but
  there's no server-rendered PDF file you can email programmatically.
- **No audit log table** despite being in the original schema wishlist — every table has
  `created_at`/`updated_at`, but there's no separate `audit_logs` table recording who changed
  what field from what value. Add one before this touches real financial data multiple people
  edit concurrently.
- **Auth is demo-grade by design**: a cookie holding the user ID directly, checked against a
  `users` table with bcrypt-hashed passwords — no JWT, no session expiry rotation, no MFA. It
  is *not* production-hardened; see the first integration below.

## Feature checklist vs. acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Log in with a demo account, role-appropriate access | ✅ (write-path enforced server-side; UI hiding partial — see limitations) |
| 2 | Create a customer, contract, and deployment | ✅ |
| 3 | Assign robots to a deployment | ✅ (`/deployments/[id]` robot roster) |
| 4 | Set deployment budget assumptions | ✅ (`/deployments/new`, 17 cost categories, upfront flag) |
| 5 | Upload/enter cost, labor, robot-performance, invoice, payment data | ✅ (`/data-entry` manual forms + CSV; payments via `/invoices`) |
| 6 | Real-time planned-vs-actual deployment P&L | ✅ (`/deployments/[id]`) |
| 7 | Utilization, uptime, output, revenue/robot-hr, cost/lb, CM, payback | ✅ |
| 8 | Pricing calculator for a new opportunity | ✅ (`/pricing-lab`) |
| 9 | Customer ROI and Synphony economics simultaneously | ✅ (side-by-side cards) |
| 10 | Base/Downside/Growth cash scenarios | ✅ (`/cash-forecast`) |
| 11 | 13-week cash forecast and runway | ✅ |
| 12 | Trigger, assign, and resolve alerts | ✅ (`/alerts`, 36 alerts on seed) |
| 13 | Generate and download reports | ✅ (`/reports`, print + CSV) |
| 14 | Replace demo data via CSV without code changes | ✅ for costs/labor/metrics/invoices; ⚠️ partial for customers/contracts/robots (see limitations) |
| 15 | Run locally from documented instructions | ✅ (`npm install && npm run db:push && npm run db:seed && npm run dev`) |

## Next three highest-value integrations

Once Synphony confirms system access, in priority order:

1. **A real accounting/billing system (QuickBooks, NetSuite, or Stripe Billing).** Right now
   invoices and payments are entered/imported manually. Wiring this in replaces the entire
   Billing & Collections manual-entry path with a synced source of truth and unblocks
   automatic AR aging that matches the actual GL, not a parallel ledger.
2. **Fleet telemetry (Synphony's robot logs / data warehouse).** The single biggest manual
   burden in this MVP is the weekly robot-metrics entry form and CSV upload. A direct feed
   from wherever robot uptime/output/intervention data already lands turns Fleet Economics
   and the Deployment P&L from a weekly-lag view into a live one — the highest-leverage
   integration for the "operating claims into verifiable economics" goal.
3. **A production auth provider (Supabase Auth or Clerk).** The current cookie-session auth
   is fine for a demo but not for real customer financial data. `src/lib/auth/session.ts` is
   already isolated behind a small interface (`getSession`, `createSession`,
   `requireWriteAccess`) specifically so this swap doesn't touch any page or Server Action —
   only that one file.
