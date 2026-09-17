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
  "lead", "qualified", "pilot", "contracted", "deploying", "active", "renewal", "paused", "churned",
] as const;

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
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export const CONTRACT_TYPES = [
  "pilot", "fixed_seasonal", "per_robot_hour", "per_pound", "per_acre", "raas_subscription", "software_subscription", "hybrid",
] as const;
export const CONTRACT_STATUSES = ["draft", "active", "completed", "terminated", "renewed"] as const;

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
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(true),
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
  "lodging", "insurance", "cloud_compute", "data_storage", "software_tools", "customer_integration", "other",
] as const;

export const deploymentBudgetItems = pgTable("deployment_budget_items", {
  id: id(),
  deploymentId: text("deployment_id").notNull().references(() => deployments.id),
  category: text("category").$type<(typeof BUDGET_CATEGORIES)[number]>().notNull(),
  plannedAmount: doublePrecision("planned_amount").notNull().default(0),
  isUpfront: boolean("is_upfront").notNull().default(false),
  notes: text("notes"),
  ...timestamps,
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
