import { pgTable, text, integer, doublePrecision, boolean } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
// JS-side (not DB-side) timestamp defaults: works identically regardless of DB backend,
// and keeps the format consistent with the ISO strings the app writes on every update
// (e.g. `updatedAt: new Date().toISOString()` in the Server Actions).
const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
};

// ---------------------------------------------------------------------------
// Users & auth (demo-grade: cookie session + hashed password, roles below)
// ---------------------------------------------------------------------------
export const ROLES = ["admin", "finance", "operations", "sales", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("viewer"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Customers (farms)
// ---------------------------------------------------------------------------
export const LIFECYCLE_STAGES = [
  "lead", "qualified", "pilot", "contracted", "deploying", "active", "renewal", "paused", "churned", "archived",
] as const;
export const LIFECYCLE_SOURCES = ["automatic", "manual"] as const;

export const customers = pgTable("customers", {
  id: id(),
  farmName: text("farm_name").notNull(),
  parentOrg: text("parent_org"),
  location: text("location").notNull(),
  cropType: text("crop_type").notNull().default("Strawberries"),
  acres: doublePrecision("acres"),
  seasonStart: text("season_start"), // MM-DD, recurring annually
  seasonEnd: text("season_end"),
  expectedVolumeLbs: doublePrecision("expected_volume_lbs"),
  manualLaborCostPerHour: doublePrecision("manual_labor_cost_per_hour"),
  manualLaborCostPerLb: doublePrecision("manual_labor_cost_per_lb"),
  customerOwner: text("customer_owner"),
  lifecycleStage: text("lifecycle_stage").$type<(typeof LIFECYCLE_STAGES)[number]>().notNull().default("lead"),
  // "automatic" (default): lifecycleStage is recomputed after contract/deployment changes.
  // "manual": a person explicitly set the stage; automatic recompute is skipped until
  // someone clicks "Return to automatic" on the customer page.
  lifecycleSource: text("lifecycle_source").$type<(typeof LIFECYCLE_SOURCES)[number]>().notNull().default("automatic"),
  churnReason: text("churn_reason"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

export const customerLifecycleHistory = pgTable("customer_lifecycle_history", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  previousStage: text("previous_stage").$type<(typeof LIFECYCLE_STAGES)[number] | null>(),
  newStage: text("new_stage").$type<(typeof LIFECYCLE_STAGES)[number]>().notNull(),
  source: text("source").$type<(typeof LIFECYCLE_SOURCES)[number]>().notNull(),
  triggeringRecordType: text("triggering_record_type"), // "contract" | "deployment" | "manual" | "contract_import" | ...
  triggeringRecordId: text("triggering_record_id"),
  actor: text("actor"), // user email/name, or "system" for automatic transitions
  reason: text("reason"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export const CONTRACT_TYPES = [
  "pilot", "fixed_seasonal", "per_robot_hour", "per_pound", "per_acre", "raas_subscription", "software_subscription", "hybrid",
] as const;
// "terminated" and "renewed" are kept alongside the fuller lifecycle set below for backward
// compatibility with existing seeded/demo rows — "cancelled" is the new preferred term for a
// contract ended early, "terminated" is treated as a synonym everywhere status is checked.
export const CONTRACT_STATUSES = [
  "draft", "in_review", "active", "completed", "cancelled", "expired", "archived", "terminated", "renewed",
] as const;
export const BILLING_FREQUENCIES = ["upfront", "monthly", "quarterly", "milestone", "end_of_season", "usage_based"] as const;
export const PAYMENT_TERMS = ["due_on_receipt", "net_15", "net_30", "net_45", "net_60"] as const;

export function paymentTermsDaysFor(terms: (typeof PAYMENT_TERMS)[number] | null | undefined): number {
  switch (terms) {
    case "due_on_receipt": return 0;
    case "net_15": return 15;
    case "net_45": return 45;
    case "net_60": return 60;
    case "net_30":
    default: return 30;
  }
}

export const contracts = pgTable("contracts", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  contractType: text("contract_type").$type<(typeof CONTRACT_TYPES)[number]>().notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  totalContractValue: doublePrecision("total_contract_value").notNull().default(0),
  mobilizationFee: doublePrecision("mobilization_fee").notNull().default(0),
  depositAmount: doublePrecision("deposit_amount").notNull().default(0),
  minimumCommitment: doublePrecision("minimum_commitment").notNull().default(0),
  variablePricePerUnit: doublePrecision("variable_price_per_unit").default(0),
  variableUnitType: text("variable_unit_type"), // "lb" | "robot_hour" | "acre"
  monthlySubscriptionAmount: doublePrecision("monthly_subscription_amount").default(0),
  expectedOutputVolume: doublePrecision("expected_output_volume"),
  robotsCommitted: integer("robots_committed").notNull().default(0),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  customerFundedHardware: doublePrecision("customer_funded_hardware").notNull().default(0),
  renewalLikelihoodPct: doublePrecision("renewal_likelihood_pct"),
  status: text("status").$type<(typeof CONTRACT_STATUSES)[number]>().notNull().default("active"),
  slaUptimeTargetPct: doublePrecision("sla_uptime_target_pct").default(85),
  billingFrequency: text("billing_frequency").$type<(typeof BILLING_FREQUENCIES)[number]>().notNull().default("monthly"),
  paymentTerms: text("payment_terms").$type<(typeof PAYMENT_TERMS)[number]>().notNull().default("net_30"),
  depositPct: doublePrecision("deposit_pct"), // alternative to a flat depositAmount; if set, deposit = totalContractValue * depositPct/100
  // Bumped on any change to terms that would materially change the billing schedule
  // (value, dates, fees, pricing) — schedule items store the version they were generated
  // from, so a stale schedule can be detected without a full contract-history table.
  contractVersion: integer("contract_version").notNull().default(1),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Invoice schedule (Gap A) — a forward-looking billing plan derived from contract terms.
// Scheduled/draft lines are NOT revenue, invoiced amount, or cash collected; only a row in
// `invoices` (linked via issuedInvoiceId once issued) counts toward those.
// ---------------------------------------------------------------------------
export const SCHEDULE_LINE_TYPES = ["deposit", "mobilization", "recurring", "minimum", "usage", "milestone", "other"] as const;
export const SCHEDULE_ITEM_STATUSES = ["scheduled", "draft", "issued", "paid", "void", "cancelled", "superseded"] as const;

export const invoiceScheduleItems = pgTable("invoice_schedule_items", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => contracts.id),
  lineType: text("line_type").$type<(typeof SCHEDULE_LINE_TYPES)[number]>().notNull(),
  description: text("description").notNull(),
  plannedAmount: doublePrecision("planned_amount").notNull(),
  plannedInvoiceDate: text("planned_invoice_date").notNull(),
  plannedDueDate: text("planned_due_date").notNull(),
  status: text("status").$type<(typeof SCHEDULE_ITEM_STATUSES)[number]>().notNull().default("scheduled"),
  issuedInvoiceId: text("issued_invoice_id"), // set once "Issue Invoice" is used on this line
  scheduleVersion: integer("schedule_version").notNull().default(1),
  sourceContractVersion: integer("source_contract_version").notNull(),
  generatedBy: text("generated_by"), // user email, or "system"
  generatedAt: text("generated_at").notNull().$defaultFn(() => new Date().toISOString()),
  notes: text("notes"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export const INVOICE_STATUSES = ["draft", "sent", "paid", "partial", "overdue", "void"] as const;

export const invoices = pgTable("invoices", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => contracts.id),
  deploymentId: text("deployment_id"),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  dueDate: text("due_date").notNull(),
  amount: doublePrecision("amount").notNull(),
  status: text("status").$type<(typeof INVOICE_STATUSES)[number]>().notNull().default("sent"),
  paidDate: text("paid_date"),
  amountPaid: doublePrecision("amount_paid").notNull().default(0),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Deployments (the unit of financial accountability)
// ---------------------------------------------------------------------------
export const DEPLOYMENT_STATUSES = [
  "planned", "financial_review", "approved", "deploying", "active", "at_risk", "paused", "completed",
] as const;

export const deployments = pgTable("deployments", {
  id: id(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  contractId: text("contract_id").notNull().references(() => contracts.id),
  name: text("name").notNull(),
  status: text("status").$type<(typeof DEPLOYMENT_STATUSES)[number]>().notNull().default("planned"),
  plannedStartDate: text("planned_start_date").notNull(),
  plannedEndDate: text("planned_end_date").notNull(),
  actualStartDate: text("actual_start_date"),
  actualEndDate: text("actual_end_date"),
  robotsPlanned: integer("robots_planned").notNull().default(0),
  expectedOperatingHours: doublePrecision("expected_operating_hours"),
  expectedOutputVolume: doublePrecision("expected_output_volume"),
  expectedTechnicianHours: doublePrecision("expected_technician_hours"),
  expectedUptimePct: doublePrecision("expected_uptime_pct").default(90),
  expectedUtilizationPct: doublePrecision("expected_utilization_pct").default(70),
  operationsOwner: text("operations_owner"),
  financeOwner: text("finance_owner"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// Planned budget line items for a deployment (pre-deployment investment case)
export const BUDGET_CATEGORIES = [
  "robot_depreciation", "procurement_allocation", "shipping_install", "field_technician_labor",
  "operator_labor", "engineering_support", "maintenance", "spare_parts", "repairs", "travel",
  "lodging", "insurance", "cloud_compute", "data_storage", "software_tools", "customer_integration",
  "contingency", "other",
] as const;

// Budgets are versioned copy-on-write (Gap D): editing never mutates an approved version's
// rows in place — it inserts a new draft version. `isApproved` marks the version currently
// treated as "the plan" for P&L/investment-case comparisons; at most one version per
// deployment should be approved at a time (enforced in the action layer, not a DB
// constraint, since a version is a set of rows, not a single row).
export const deploymentBudgetItems = pgTable("deployment_budget_items", {
  id: id(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  category: text("category").$type<(typeof BUDGET_CATEGORIES)[number]>().notNull(),
  plannedAmount: doublePrecision("planned_amount").notNull().default(0),
  isUpfront: boolean("is_upfront").notNull().default(false),
  version: integer("version").notNull().default(1),
  isApproved: boolean("is_approved").notNull().default(false),
  supersededAt: text("superseded_at"),
  changeReason: text("change_reason"),
  createdBy: text("created_by"),
  notes: text("notes"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Pre-deployment investment case & approval workflow (Gap C)
// ---------------------------------------------------------------------------
export const INVESTMENT_CASE_STATUSES = [
  "draft", "submitted", "needs_repricing", "needs_revision", "approved", "rejected", "deferred", "superseded",
] as const;

export const deploymentInvestmentCases = pgTable("deployment_investment_cases", {
  id: id(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  version: integer("version").notNull().default(1),
  status: text("status").$type<(typeof INVESTMENT_CASE_STATUSES)[number]>().notNull().default("draft"),
  scenario: text("scenario").$type<"conservative" | "base" | "aggressive">().notNull().default("base"),
  // Assumptions (inputs) and computed outputs are stored as JSON snapshots rather than one
  // column per field — the same tradeoff calculations.ts's RoiInputs/RoiOutputs already
  // makes for pricing scenarios. Once approved, both are frozen (see `isImmutable`).
  assumptionsJson: text("assumptions_json").notNull(),
  outputsJson: text("outputs_json").notNull(),
  isImmutable: boolean("is_immutable").notNull().default(false),
  submittedBy: text("submitted_by"),
  submittedAt: text("submitted_at"),
  decidedBy: text("decided_by"),
  decidedAt: text("decided_at"),
  overrideReason: text("override_reason"), // required when approved despite failing a threshold
  thresholdFailuresJson: text("threshold_failures_json"), // which finance rules failed at decision time, if any
  decisionNote: text("decision_note"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// Robots & fleet
// ---------------------------------------------------------------------------
export const ROBOT_STATUSES = ["available", "assigned", "operating", "idle", "maintenance", "repair", "retired"] as const;
export const ACQUISITION_TYPES = ["purchased", "manufactured", "leased", "customer_funded", "partner_provided"] as const;

export const robots = pgTable("robots", {
  id: id(),
  robotCode: text("robot_code").notNull().unique(),
  model: text("model").notNull(),
  serialNumber: text("serial_number"),
  acquisitionType: text("acquisition_type").$type<(typeof ACQUISITION_TYPES)[number]>().notNull().default("manufactured"),
  acquisitionDate: text("acquisition_date").notNull(),
  purchaseCost: doublePrecision("purchase_cost").notNull().default(0),
  usefulLifeMonths: integer("useful_life_months").notNull().default(48),
  monthlyLeaseCost: doublePrecision("monthly_lease_cost").default(0),
  status: text("status").$type<(typeof ROBOT_STATUSES)[number]>().notNull().default("available"),
  warrantyExpiry: text("warranty_expiry"),
  lastMaintenanceDate: text("last_maintenance_date"),
  nextMaintenanceDate: text("next_maintenance_date"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

export const robotAssignments = pgTable("robot_assignments", {
  id: id(),
  robotId: text("robot_id").notNull().references(() => robots.id),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  assignmentStart: text("assignment_start").notNull(),
  assignmentEnd: text("assignment_end"),
});

// Daily/weekly robot operational metrics
export const robotMetrics = pgTable("robot_metrics", {
  id: id(),
  date: text("date").notNull(),
  robotId: text("robot_id").notNull().references(() => robots.id),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  availableHours: doublePrecision("available_hours").notNull().default(0),
  activeHours: doublePrecision("active_hours").notNull().default(0),
  productiveHours: doublePrecision("productive_hours").notNull().default(0),
  downtimeHours: doublePrecision("downtime_hours").notNull().default(0),
  interventionHours: doublePrecision("intervention_hours").notNull().default(0),
  outputUnits: doublePrecision("output_units").notNull().default(0),
  poundsHarvested: doublePrecision("pounds_harvested").notNull().default(0),
  maintenanceIncidents: integer("maintenance_incidents").notNull().default(0),
  repairCost: doublePrecision("repair_cost").notNull().default(0),
  sparePartsCost: doublePrecision("spare_parts_cost").notNull().default(0),
  technicianHours: doublePrecision("technician_hours").notNull().default(0),
  technicianLaborCost: doublePrecision("technician_labor_cost").notNull().default(0),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Costs & labor (actuals ledger)
// ---------------------------------------------------------------------------
export const COST_TYPES = [
  "field_technician_labor", "operator_labor", "engineering_support", "maintenance", "spare_parts",
  "repairs", "travel", "lodging", "insurance", "cloud_compute", "data_storage", "software_tools",
  "customer_integration", "robot_depreciation", "shipping_install", "other",
] as const;

export const costs = pgTable("costs", {
  id: id(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  robotId: text("robot_id"),
  date: text("date").notNull(),
  costType: text("cost_type").$type<(typeof COST_TYPES)[number]>().notNull(),
  amount: doublePrecision("amount").notNull(),
  vendor: text("vendor"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

export const laborLogs = pgTable("labor_logs", {
  id: id(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  employeeRole: text("employee_role").notNull(),
  date: text("date").notNull(),
  hours: doublePrecision("hours").notNull(),
  hourlyCost: doublePrecision("hourly_cost").notNull(),
  taskType: text("task_type"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Alerts & actions
// ---------------------------------------------------------------------------
export const ALERT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const ALERT_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "dismissed"] as const;

export const alerts = pgTable("alerts", {
  id: id(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").$type<(typeof ALERT_SEVERITIES)[number]>().notNull(),
  module: text("module").notNull(),
  customerId: text("customer_id"),
  deploymentId: text("deployment_id"),
  robotId: text("robot_id"),
  // Extra uniqueness for alert types where deploymentId+robotId alone can't tell two
  // candidates apart (e.g. per-invoice overdue alerts). Null for every other alert type.
  dedupKey: text("dedup_key"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  estimatedImpact: doublePrecision("estimated_impact"),
  owner: text("owner"),
  status: text("status").$type<(typeof ALERT_STATUSES)[number]>().notNull().default("open"),
  resolutionNote: text("resolution_note"),
  resolutionDate: text("resolution_date"),
  triggeredAt: text("triggered_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ---------------------------------------------------------------------------
// Pricing / ROI scenarios (Module E)
// ---------------------------------------------------------------------------
export const pricingScenarios = pgTable("pricing_scenarios", {
  id: id(),
  name: text("name").notNull(),
  customerId: text("customer_id"),
  scenarioCase: text("scenario_case").$type<"conservative" | "base" | "aggressive">().notNull().default("base"),
  inputsJson: text("inputs_json").notNull(),
  outputsJson: text("outputs_json").notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Cash / capex forecast (Module F)
// ---------------------------------------------------------------------------
export const FORECAST_SCENARIO_TYPES = ["base", "downside", "growth"] as const;

export const forecastScenarios = pgTable("forecast_scenarios", {
  id: id(),
  name: text("name").notNull(),
  scenarioType: text("scenario_type").$type<(typeof FORECAST_SCENARIO_TYPES)[number]>().notNull(),
  startingCash: doublePrecision("starting_cash").notNull(),
  monthlyPayroll: doublePrecision("monthly_payroll").notNull(),
  monthlyRnd: doublePrecision("monthly_rnd").notNull().default(0),
  monthlyGna: doublePrecision("monthly_gna").notNull().default(0),
  monthlySalesMarketing: doublePrecision("monthly_sales_marketing").notNull().default(0),
  monthlyCloudData: doublePrecision("monthly_cloud_data").notNull().default(0),
  monthlyInsurance: doublePrecision("monthly_insurance").notNull().default(0),
  monthlyTravelOps: doublePrecision("monthly_travel_ops").notNull().default(0),
  robotUnitCost: doublePrecision("robot_unit_cost").notNull().default(45000),
  robotsPlannedPerMonthJson: text("robots_planned_per_month_json").notNull().default("{}"),
  collectionsDelayDays: integer("collections_delay_days").notNull().default(30),
  utilizationAdjustmentPct: doublePrecision("utilization_adjustment_pct").notNull().default(0),
  financingInflowJson: text("financing_inflow_json").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Company-wide key/value settings (current cash balance override etc.)
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
