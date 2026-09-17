/**
 * DEMO DATA SEED — Synphony Deployment Finance OS
 *
 * Everything created here is fictional / illustrative (isDemo: true on every
 * row that supports it). It is designed to exercise every required MVP
 * scenario: a profitable scale-ready deployment, a high-revenue-but-loss-making
 * one, an overdue invoice, a low-uptime/high-maintenance fleet, a pilot about
 * to expire, and an opportunity that exceeds available fleet capacity.
 *
 * Run with: npm run db:seed
 */
import { sqlite, db } from "./client";
import * as schema from "./schema";
import { hashPassword } from "@/lib/auth/session";
import { syncAlerts } from "@/lib/finance/alerts-sync";

// Deterministic PRNG (mulberry32) so re-seeding produces identical demo data.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const jitter = (base: number, pct: number) => base * (1 + (rand() * 2 - 1) * pct);

const id = () => crypto.randomUUID();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

function weeklyDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur = addDays(cur, 7);
  }
  return out;
}

async function main() {
  console.log("Resetting database...");
  const tableNames = [
    "alerts", "costs", "labor_logs", "robot_metrics", "robot_assignments", "invoices",
    "deployment_budget_items", "deployments", "pricing_scenarios", "contracts", "robots",
    "customers", "forecast_scenarios", "users", "settings",
  ];
  for (const t of tableNames) sqlite.exec(`DELETE FROM ${t};`);

  const today = new Date("2026-09-17");

  // ---------------------------------------------------------------------
  // Users (demo accounts — see README for credentials)
  // ---------------------------------------------------------------------
  console.log("Seeding users...");
  const demoUsers: { email: string; name: string; role: schema.Role }[] = [
    { email: "ceo@synphony.demo", name: "Alex Rivera (CEO)", role: "admin" },
    { email: "finance@synphony.demo", name: "Priya Nair (Finance)", role: "finance" },
    { email: "ops@synphony.demo", name: "Marcus Webb (Operations)", role: "operations" },
    { email: "sales@synphony.demo", name: "Dana Kim (Sales)", role: "sales" },
    { email: "board@synphony.demo", name: "Board Observer", role: "viewer" },
  ];
  const passwordHash = hashPassword("synphony2026");
  await db.insert(schema.users).values(demoUsers.map((u) => ({ id: id(), ...u, passwordHash })));

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------
  await db.insert(schema.settings).values([
    { key: "current_cash_balance", value: "2450000" },
    { key: "company_name", value: "Synphony" },
  ]);

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  console.log("Seeding customers...");
  const cValleyCrest = id();
  const cGoldenCoast = id();
  const cSantaMaria = id();
  const cCoastalHarvest = id();
  const cRedwoodBerry = id();
  const cPacificBerry = id();

  await db.insert(schema.customers).values([
    {
      id: cValleyCrest, farmName: "Valley Crest Farms", location: "Watsonville, CA", cropType: "Strawberries",
      acres: 140, seasonStart: "03-01", seasonEnd: "10-31", expectedVolumeLbs: 2_800_000,
      manualLaborCostPerHour: 19.5, manualLaborCostPerLb: 0.42, customerOwner: "Dana Kim",
      lifecycleStage: "active", notes: "DEMO DATA. Flagship account — highest utilization in the fleet.",
    },
    {
      id: cGoldenCoast, farmName: "Golden Coast Produce", location: "Salinas, CA", cropType: "Strawberries",
      acres: 95, seasonStart: "03-15", seasonEnd: "10-15", expectedVolumeLbs: 1_900_000,
      manualLaborCostPerHour: 20.25, manualLaborCostPerLb: 0.45, customerOwner: "Dana Kim",
      lifecycleStage: "active", notes: "DEMO DATA. Field technician time and travel have run well above budget.",
    },
    {
      id: cSantaMaria, farmName: "Santa Maria Strawberries", location: "Santa Maria, CA", cropType: "Strawberries",
      acres: 110, seasonStart: "03-01", seasonEnd: "10-31", expectedVolumeLbs: 2_200_000,
      manualLaborCostPerHour: 18.75, manualLaborCostPerLb: 0.40, customerOwner: "Priya Nair",
      lifecycleStage: "active", notes: "DEMO DATA. AP has gone quiet — invoice materially overdue.",
    },
    {
      id: cCoastalHarvest, farmName: "Coastal Harvest Partners", location: "Oxnard, CA", cropType: "Strawberries",
      acres: 80, seasonStart: "02-15", seasonEnd: "09-30", expectedVolumeLbs: 1_600_000,
      manualLaborCostPerHour: 19.0, manualLaborCostPerLb: 0.41, customerOwner: "Marcus Webb",
      lifecycleStage: "active", notes: "DEMO DATA. Fleet reliability has been the recurring issue this season.",
    },
    {
      id: cRedwoodBerry, farmName: "Redwood Berry Company", location: "Arroyo Grande, CA", cropType: "Strawberries",
      acres: 45, seasonStart: "06-01", seasonEnd: "10-05", expectedVolumeLbs: 700_000,
      manualLaborCostPerHour: 18.5, manualLaborCostPerLb: 0.39, customerOwner: "Dana Kim",
      lifecycleStage: "active", notes: "DEMO DATA. Pilot; renewal decision needed before term end.",
    },
    {
      id: cPacificBerry, farmName: "Pacific Berry Collective", location: "Santa Cruz, CA", cropType: "Strawberries",
      acres: 210, seasonStart: "04-01", seasonEnd: "10-31", expectedVolumeLbs: 4_100_000,
      manualLaborCostPerHour: 21.0, manualLaborCostPerLb: 0.46, customerOwner: "Dana Kim",
      lifecycleStage: "contracted", notes: "DEMO DATA. Signed but capacity-constrained — needs additional fleet before deploying.",
    },
  ]);

  // ---------------------------------------------------------------------
  // Contracts
  // ---------------------------------------------------------------------
  console.log("Seeding contracts...");
  const contractValleyCrest = id();
  const contractGoldenCoastRaas = id();
  const contractGoldenCoastSoftware = id();
  const contractSantaMaria = id();
  const contractSantaMariaPilot = id();
  const contractCoastalHarvest = id();
  const contractRedwoodBerry = id();
  const contractPacificBerry = id();

  await db.insert(schema.contracts).values([
    {
      id: contractValleyCrest, customerId: cValleyCrest, contractType: "per_pound",
      startDate: "2026-03-15", endDate: "2026-10-31", totalContractValue: 420_000,
      mobilizationFee: 25_000, depositAmount: 40_000, minimumCommitment: 300_000,
      variablePricePerUnit: 0.19, variableUnitType: "lb", expectedOutputVolume: 2_200_000,
      robotsCommitted: 4, paymentTermsDays: 30, slaUptimeTargetPct: 90, status: "active",
      notes: "DEMO DATA. Per-pound pricing tied to actual harvest volume.",
    },
    {
      id: contractGoldenCoastRaas, customerId: cGoldenCoast, contractType: "raas_subscription",
      startDate: "2026-03-20", endDate: "2026-10-15", totalContractValue: 260_000,
      mobilizationFee: 20_000, depositAmount: 30_000, minimumCommitment: 200_000,
      monthlySubscriptionAmount: 32_500, robotsCommitted: 3, paymentTermsDays: 30,
      slaUptimeTargetPct: 88, status: "active",
      notes: "DEMO DATA. Robotics-as-a-service subscription; high revenue but cost structure needs review.",
    },
    {
      id: contractGoldenCoastSoftware, customerId: cGoldenCoast, contractType: "software_subscription",
      startDate: "2026-01-01", endDate: "2026-12-31", totalContractValue: 18_000,
      mobilizationFee: 0, depositAmount: 0, minimumCommitment: 18_000, monthlySubscriptionAmount: 1_500,
      robotsCommitted: 0, paymentTermsDays: 15, status: "active",
      notes: "DEMO DATA. Bed-level analytics add-on, billed monthly.",
    },
    {
      id: contractSantaMaria, customerId: cSantaMaria, contractType: "fixed_seasonal",
      startDate: "2026-03-01", endDate: "2026-10-31", totalContractValue: 310_000,
      mobilizationFee: 22_000, depositAmount: 35_000, minimumCommitment: 310_000,
      robotsCommitted: 2, paymentTermsDays: 30, slaUptimeTargetPct: 88, status: "active",
      notes: "DEMO DATA. Fixed seasonal fee.",
    },
    {
      id: contractSantaMariaPilot, customerId: cSantaMaria, contractType: "pilot",
      startDate: "2025-05-01", endDate: "2025-08-31", totalContractValue: 45_000,
      mobilizationFee: 10_000, depositAmount: 10_000, minimumCommitment: 45_000,
      robotsCommitted: 1, paymentTermsDays: 30, status: "renewed",
      notes: "DEMO DATA. Prior-season pilot that converted into the current seasonal contract.",
    },
    {
      id: contractCoastalHarvest, customerId: cCoastalHarvest, contractType: "per_robot_hour",
      startDate: "2026-02-15", endDate: "2026-09-30", totalContractValue: 230_000,
      mobilizationFee: 18_000, depositAmount: 25_000, minimumCommitment: 160_000,
      variablePricePerUnit: 42, variableUnitType: "robot_hour", robotsCommitted: 3,
      paymentTermsDays: 30, slaUptimeTargetPct: 90, status: "active",
      notes: "DEMO DATA. Per robot-hour pricing; reliability issues are compressing margin.",
    },
    {
      id: contractRedwoodBerry, customerId: cRedwoodBerry, contractType: "pilot",
      startDate: "2026-06-01", endDate: "2026-10-05", totalContractValue: 68_000,
      mobilizationFee: 8_000, depositAmount: 12_000, minimumCommitment: 68_000,
      robotsCommitted: 2, paymentTermsDays: 30, renewalLikelihoodPct: 60, status: "active",
      notes: "DEMO DATA. Pilot ending soon; no expansion contract signed yet.",
    },
    {
      id: contractPacificBerry, customerId: cPacificBerry, contractType: "hybrid",
      startDate: "2026-09-01", endDate: "2027-04-30", totalContractValue: 540_000,
      mobilizationFee: 45_000, depositAmount: 60_000, minimumCommitment: 400_000,
      variablePricePerUnit: 0.15, variableUnitType: "lb", monthlySubscriptionAmount: 8_000,
      robotsCommitted: 6, paymentTermsDays: 30, slaUptimeTargetPct: 90, status: "active",
      notes: "DEMO DATA. Signed hybrid contract — mobilization fee + seasonal minimum + variable usage fee. Cannot deploy until additional robots are procured.",
    },
  ]);

  // ---------------------------------------------------------------------
  // Robots (15 total)
  // ---------------------------------------------------------------------
  console.log("Seeding robots...");
  type RobotStatus = (typeof schema.robots.$inferInsert)["status"];
  interface RobotSeed { id: string; code: string; status: RobotStatus; nextMaint: string | null }
  const robotSeeds: RobotSeed[] = [];
  for (let i = 1; i <= 15; i++) {
    const code = `SYN-R${String(i).padStart(3, "0")}`;
    let status: RobotSeed["status"] = "operating";
    let nextMaint = iso(addDays(today, 20 + (i % 5) * 5));
    if (i === 15) status = "available"; // idle spare
    if (i === 11 || i === 12) status = "maintenance";
    if (i === 13) { status = "repair"; nextMaint = iso(addDays(today, -6)); } // overdue maintenance
    if (i === 14) { status = "repair"; nextMaint = iso(addDays(today, -2)); }
    robotSeeds.push({ id: id(), code, status, nextMaint });
  }
  await db.insert(schema.robots).values(
    robotSeeds.map((r, i) => ({
      id: r.id,
      robotCode: r.code,
      model: i < 8 ? "Synphony Harvester Gen3" : "Synphony Harvester Gen2",
      serialNumber: `SN-${100000 + i}`,
      acquisitionType: "manufactured" as const,
      acquisitionDate: iso(addDays(new Date("2026-01-15"), i * 4)),
      purchaseCost: i < 8 ? 48_000 : 39_000,
      usefulLifeMonths: 48,
      monthlyLeaseCost: 0,
      status: r.status,
      warrantyExpiry: iso(addDays(new Date("2026-01-15"), 365 * 2)),
      lastMaintenanceDate: iso(addDays(today, -35)),
      nextMaintenanceDate: r.nextMaint,
      notes: r.status === "repair" ? "DEMO DATA. Recurring drivetrain fault under investigation." : "DEMO DATA.",
    }))
  );

  // Robot allocation per deployment
  const valleyCrestRobots = robotSeeds.slice(0, 4);     // R001-R004 — high performers
  const goldenCoastRobots = robotSeeds.slice(4, 7);     // R005-R007
  const santaMariaRobots = robotSeeds.slice(7, 9);      // R008-R009
  const coastalHarvestRobots = robotSeeds.slice(9, 13); // R010-R013 (incl. 2 in maintenance/repair)

  // ---------------------------------------------------------------------
  // Deployments + budgets
  // ---------------------------------------------------------------------
  console.log("Seeding deployments...");
  const depValleyCrest = id();
  const depGoldenCoast = id();
  const depSantaMaria = id();
  const depCoastalHarvest = id();
  const depRedwoodBerry = id();
  const depPacificBerry = id();

  const redwoodRobots = [robotSeeds[13]]; // SYN-R014 (also flagged "repair" — deliberate: this pilot has its own issues)

  await db.insert(schema.deployments).values([
    {
      id: depValleyCrest, customerId: cValleyCrest, contractId: contractValleyCrest,
      name: "Valley Crest — Main Ranch Deployment", status: "active",
      plannedStartDate: "2026-03-20", plannedEndDate: "2026-10-31", actualStartDate: "2026-03-22",
      robotsPlanned: 4, expectedOperatingHours: 4200, expectedOutputVolume: 2_200_000,
      expectedTechnicianHours: 320, expectedUptimePct: 90, expectedUtilizationPct: 75,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Best-performing deployment in the portfolio — candidate for fleet expansion.",
    },
    {
      id: depGoldenCoast, customerId: cGoldenCoast, contractId: contractGoldenCoastRaas,
      name: "Golden Coast — North Block Deployment", status: "at_risk",
      plannedStartDate: "2026-03-25", plannedEndDate: "2026-10-15", actualStartDate: "2026-03-28",
      robotsPlanned: 3, expectedOperatingHours: 3100, expectedOutputVolume: 1_500_000,
      expectedTechnicianHours: 260, expectedUptimePct: 88, expectedUtilizationPct: 70,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Field technician hours and travel spend have exceeded plan every month.",
    },
    {
      id: depSantaMaria, customerId: cSantaMaria, contractId: contractSantaMaria,
      name: "Santa Maria — East Fields Deployment", status: "active",
      plannedStartDate: "2026-03-05", plannedEndDate: "2026-10-31", actualStartDate: "2026-03-08",
      robotsPlanned: 2, expectedOperatingHours: 2100, expectedOutputVolume: 1_100_000,
      expectedTechnicianHours: 180, expectedUptimePct: 88, expectedUtilizationPct: 68,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Operationally healthy; billing collection is the open issue.",
    },
    {
      id: depCoastalHarvest, customerId: cCoastalHarvest, contractId: contractCoastalHarvest,
      name: "Coastal Harvest — South Ranch Deployment", status: "at_risk",
      plannedStartDate: "2026-02-20", plannedEndDate: "2026-09-30", actualStartDate: "2026-02-24",
      robotsPlanned: 4, expectedOperatingHours: 3400, expectedOutputVolume: 1_600_000,
      expectedTechnicianHours: 300, expectedUptimePct: 90, expectedUtilizationPct: 72,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Recurring drivetrain failures across two robots have suppressed uptime all season.",
    },
    {
      id: depRedwoodBerry, customerId: cRedwoodBerry, contractId: contractRedwoodBerry,
      name: "Redwood Berry — Pilot Deployment", status: "active",
      plannedStartDate: "2026-06-05", plannedEndDate: "2026-10-05", actualStartDate: "2026-06-08",
      robotsPlanned: 1, expectedOperatingHours: 900, expectedOutputVolume: 700_000,
      expectedTechnicianHours: 90, expectedUptimePct: 85, expectedUtilizationPct: 65,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Pilot term ends soon; renewal/expansion conversation not yet scheduled.",
    },
    {
      id: depPacificBerry, customerId: cPacificBerry, contractId: contractPacificBerry,
      name: "Pacific Berry — Full Ranch Deployment (Planned)", status: "financial_review",
      plannedStartDate: "2026-11-01", plannedEndDate: "2027-04-30", actualStartDate: null,
      robotsPlanned: 6, expectedOperatingHours: 5200, expectedOutputVolume: 4_100_000,
      expectedTechnicianHours: 420, expectedUptimePct: 90, expectedUtilizationPct: 75,
      operationsOwner: "Marcus Webb", financeOwner: "Priya Nair",
      notes: "DEMO DATA. Contract signed; deployment cannot start until 6 robots are available (fleet currently has 1 idle unit).",
    },
  ]);

  console.log("Seeding deployment budgets...");
  type BudgetCategory = (typeof schema.deploymentBudgetItems.$inferInsert)["category"];
  const budgetRows: (typeof schema.deploymentBudgetItems.$inferInsert)[] = [];
  function addBudget(depId: string, items: [BudgetCategory, number, boolean][]) {
    for (const [category, amount, upfront] of items) {
      budgetRows.push({ id: id(), deploymentId: depId, category, plannedAmount: amount, isUpfront: upfront });
    }
  }
  addBudget(depValleyCrest, [
    ["robot_depreciation", 48_000, false], ["field_technician_labor", 62_000, false], ["maintenance", 18_000, false],
    ["spare_parts", 9_000, false], ["travel", 7_000, false], ["cloud_compute", 6_000, false], ["insurance", 5_000, false],
    ["shipping_install", 15_000, true], ["customer_integration", 8_000, true],
  ]);
  addBudget(depGoldenCoast, [
    ["robot_depreciation", 36_000, false], ["field_technician_labor", 58_000, false], ["maintenance", 14_000, false],
    ["spare_parts", 7_000, false], ["travel", 9_000, false], ["cloud_compute", 5_000, false], ["insurance", 4_000, false],
    ["shipping_install", 12_000, true], ["customer_integration", 6_000, true],
  ]);
  addBudget(depSantaMaria, [
    ["robot_depreciation", 24_000, false], ["field_technician_labor", 40_000, false], ["maintenance", 10_000, false],
    ["spare_parts", 5_000, false], ["travel", 5_000, false], ["cloud_compute", 4_000, false], ["insurance", 3_000, false],
    ["shipping_install", 10_000, true], ["customer_integration", 5_000, true],
  ]);
  addBudget(depCoastalHarvest, [
    ["robot_depreciation", 48_000, false], ["field_technician_labor", 55_000, false], ["maintenance", 16_000, false],
    ["spare_parts", 9_000, false], ["travel", 6_000, false], ["cloud_compute", 5_000, false], ["insurance", 4_000, false],
    ["shipping_install", 14_000, true], ["customer_integration", 7_000, true],
  ]);
  addBudget(depRedwoodBerry, [
    ["robot_depreciation", 12_000, false], ["field_technician_labor", 18_000, false], ["maintenance", 5_000, false],
    ["spare_parts", 2_500, false], ["travel", 3_000, false], ["cloud_compute", 2_000, false], ["insurance", 1_500, false],
    ["shipping_install", 6_000, true], ["customer_integration", 3_000, true],
  ]);
  addBudget(depPacificBerry, [
    ["robot_depreciation", 72_000, false], ["field_technician_labor", 90_000, false], ["maintenance", 22_000, false],
    ["spare_parts", 12_000, false], ["travel", 10_000, false], ["cloud_compute", 8_000, false], ["insurance", 6_000, false],
    ["shipping_install", 28_000, true], ["customer_integration", 14_000, true],
  ]);
  await db.insert(schema.deploymentBudgetItems).values(budgetRows);

  // ---------------------------------------------------------------------
  // Robot assignments
  // ---------------------------------------------------------------------
  console.log("Seeding robot assignments...");
  const assignmentRows: (typeof schema.robotAssignments.$inferInsert)[] = [];
  function assign(deploymentId: string, robots: RobotSeed[], start: string) {
    for (const r of robots) assignmentRows.push({ id: id(), robotId: r.id, deploymentId, assignmentStart: start });
  }
  assign(depValleyCrest, valleyCrestRobots, "2026-03-22");
  assign(depGoldenCoast, goldenCoastRobots, "2026-03-28");
  assign(depSantaMaria, santaMariaRobots, "2026-03-08");
  assign(depCoastalHarvest, coastalHarvestRobots, "2026-02-24");
  assign(depRedwoodBerry, redwoodRobots, "2026-06-08");
  await db.insert(schema.robotAssignments).values(assignmentRows);

  // ---------------------------------------------------------------------
  // Robot weekly metrics (~17 weeks, ~120 days of season-to-date data)
  // ---------------------------------------------------------------------
  console.log("Seeding robot metrics (this may take a moment)...");
  const metricsStart = new Date("2026-05-19"); // ~120 days of season-to-date data through metricsEnd
  const metricsEnd = new Date("2026-09-16");
  const weeks = weeklyDates(metricsStart, metricsEnd); // ~18 weekly entries
  const metricRows: (typeof schema.robotMetrics.$inferInsert)[] = [];

  interface FleetProfile {
    robots: RobotSeed[];
    deploymentId: string;
    availableHoursPerWeek: number;
    uptimePct: number; // drives downtime
    utilizationPct: number; // drives productive vs active
    outputPerProductiveHour: number; // lbs/hr
    interventionHoursPerWeek: number;
    maintenanceIncidentChance: number;
    repairCostPerIncident: number;
    sparePartsPerWeek: number;
    technicianHourlyCost: number;
  }

  const profiles: FleetProfile[] = [
    { robots: valleyCrestRobots, deploymentId: depValleyCrest, availableHoursPerWeek: 60, uptimePct: 95, utilizationPct: 85, outputPerProductiveHour: 55, interventionHoursPerWeek: 2, maintenanceIncidentChance: 0.05, repairCostPerIncident: 400, sparePartsPerWeek: 120, technicianHourlyCost: 32 },
    { robots: goldenCoastRobots, deploymentId: depGoldenCoast, availableHoursPerWeek: 58, uptimePct: 87, utilizationPct: 68, outputPerProductiveHour: 46, interventionHoursPerWeek: 9, maintenanceIncidentChance: 0.12, repairCostPerIncident: 550, sparePartsPerWeek: 210, technicianHourlyCost: 34 },
    { robots: santaMariaRobots, deploymentId: depSantaMaria, availableHoursPerWeek: 55, uptimePct: 89, utilizationPct: 70, outputPerProductiveHour: 48, interventionHoursPerWeek: 4, maintenanceIncidentChance: 0.07, repairCostPerIncident: 380, sparePartsPerWeek: 130, technicianHourlyCost: 31 },
    { robots: coastalHarvestRobots, deploymentId: depCoastalHarvest, availableHoursPerWeek: 56, uptimePct: 64, utilizationPct: 55, outputPerProductiveHour: 44, interventionHoursPerWeek: 14, maintenanceIncidentChance: 0.28, repairCostPerIncident: 900, sparePartsPerWeek: 340, technicianHourlyCost: 33 },
    { robots: redwoodRobots, deploymentId: depRedwoodBerry, availableHoursPerWeek: 50, uptimePct: 83, utilizationPct: 60, outputPerProductiveHour: 42, interventionHoursPerWeek: 6, maintenanceIncidentChance: 0.10, repairCostPerIncident: 420, sparePartsPerWeek: 150, technicianHourlyCost: 30 },
  ];

  for (const profile of profiles) {
    for (const robot of profile.robots) {
      for (const weekStart of weeks) {
        const available = jitter(profile.availableHoursPerWeek, 0.06);
        const downtime = available * (1 - profile.uptimePct / 100) * jitter(1, 0.2);
        const active = Math.max(0, available - downtime);
        const productive = Math.max(0, active * (profile.utilizationPct / 100) * jitter(1, 0.08));
        const output = productive * profile.outputPerProductiveHour * jitter(1, 0.05);
        const intervention = Math.max(0, jitter(profile.interventionHoursPerWeek, 0.3));
        const hasIncident = rand() < profile.maintenanceIncidentChance;
        const repairCost = hasIncident ? jitter(profile.repairCostPerIncident, 0.25) : 0;
        const sparePartsCost = jitter(profile.sparePartsPerWeek, 0.3);
        const technicianHours = jitter(8 + intervention, 0.15);
        metricRows.push({
          id: id(),
          date: iso(weekStart),
          robotId: robot.id,
          deploymentId: profile.deploymentId,
          availableHours: round2(available),
          activeHours: round2(active),
          productiveHours: round2(productive),
          downtimeHours: round2(downtime),
          interventionHours: round2(intervention),
          outputUnits: round2(output),
          poundsHarvested: round2(output),
          maintenanceIncidents: hasIncident ? 1 : 0,
          repairCost: round2(repairCost),
          sparePartsCost: round2(sparePartsCost),
          technicianHours: round2(technicianHours),
          technicianLaborCost: round2(technicianHours * profile.technicianHourlyCost),
        });
      }
    }
  }
  // Insert in chunks to stay well under SQLite's parameter limits.
  await insertInChunks(schema.robotMetrics, metricRows);

  // ---------------------------------------------------------------------
  // Costs ledger (direct deployment costs, weekly, by category)
  // ---------------------------------------------------------------------
  console.log("Seeding cost ledger...");
  const costRows: (typeof schema.costs.$inferInsert)[] = [];
  interface CostProfile {
    deploymentId: string;
    weeklyFieldLabor: number; weeklyTravel: number; weeklyCloud: number; weeklyInsurance: number;
    weeklyDepreciation: number; weeklyLodging: number;
  }
  const costProfiles: CostProfile[] = [
    { deploymentId: depValleyCrest, weeklyFieldLabor: 2600, weeklyTravel: 350, weeklyCloud: 220, weeklyInsurance: 180, weeklyDepreciation: 1000, weeklyLodging: 150 },
    { deploymentId: depGoldenCoast, weeklyFieldLabor: 7500, weeklyTravel: 2600, weeklyCloud: 200, weeklyInsurance: 160, weeklyDepreciation: 750, weeklyLodging: 1400 },
    { deploymentId: depSantaMaria, weeklyFieldLabor: 1900, weeklyTravel: 300, weeklyCloud: 160, weeklyInsurance: 130, weeklyDepreciation: 500, weeklyLodging: 100 },
    { deploymentId: depCoastalHarvest, weeklyFieldLabor: 2400, weeklyTravel: 400, weeklyCloud: 190, weeklyInsurance: 170, weeklyDepreciation: 1000, weeklyLodging: 200 },
    { deploymentId: depRedwoodBerry, weeklyFieldLabor: 900, weeklyTravel: 200, weeklyCloud: 90, weeklyInsurance: 60, weeklyDepreciation: 250, weeklyLodging: 80 },
  ];
  for (const cp of costProfiles) {
    for (const weekStart of weeks) {
      const wk = iso(weekStart);
      costRows.push(
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "field_technician_labor", amount: round2(jitter(cp.weeklyFieldLabor, 0.1)), vendor: "Internal field ops" },
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "travel", amount: round2(jitter(cp.weeklyTravel, 0.2)), vendor: "Field travel" },
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "cloud_compute", amount: round2(jitter(cp.weeklyCloud, 0.05)), vendor: "AWS" },
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "insurance", amount: round2(cp.weeklyInsurance), vendor: "Equipment insurer" },
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "robot_depreciation", amount: round2(cp.weeklyDepreciation), vendor: "Internal — straight-line" },
        { id: id(), deploymentId: cp.deploymentId, date: wk, costType: "lodging", amount: round2(jitter(cp.weeklyLodging, 0.3)), vendor: "Field lodging" }
      );
    }
  }
  // Roll robot-level maintenance/spare-parts/repair metrics into the cost ledger too, so
  // Module C's cost ledger and Module D's fleet economics reconcile against the same actuals.
  for (const m of metricRows) {
    if (m.repairCost && m.repairCost > 0) {
      costRows.push({ id: id(), deploymentId: m.deploymentId, robotId: m.robotId, date: m.date, costType: "repairs", amount: m.repairCost, vendor: "Field repair" });
    }
    if (m.sparePartsCost && m.sparePartsCost > 0) {
      costRows.push({ id: id(), deploymentId: m.deploymentId, robotId: m.robotId, date: m.date, costType: "spare_parts", amount: m.sparePartsCost, vendor: "Parts supplier" });
    }
    if (m.technicianLaborCost && m.technicianLaborCost > 0) {
      costRows.push({ id: id(), deploymentId: m.deploymentId, robotId: m.robotId, date: m.date, costType: "maintenance", amount: round2(m.technicianLaborCost * 0.4), vendor: "Internal — maintenance labor" });
    }
  }
  await insertInChunks(schema.costs, costRows);

  // ---------------------------------------------------------------------
  // Invoices (40+, spanning paid / open / overdue)
  // ---------------------------------------------------------------------
  console.log("Seeding invoices...");
  const invoiceRows: (typeof schema.invoices.$inferInsert)[] = [];
  let invoiceSeq = 1000;

  function generateInvoices(opts: {
    contractId: string; deploymentId?: string; startDate: string; monthlyAmount: number;
    monthsSoFar: number; paidThroughIndex: number; overdueIndexes?: number[]; partialIndexes?: number[];
  }) {
    const start = new Date(opts.startDate);
    for (let m = 0; m < opts.monthsSoFar; m++) {
      const invDate = addDays(start, m * 30);
      const dueDate = addDays(invDate, 30);
      const isPaid = m <= opts.paidThroughIndex;
      const isOverdue = opts.overdueIndexes?.includes(m) ?? false;
      const isPartial = opts.partialIndexes?.includes(m) ?? false;
      let status: (typeof schema.INVOICE_STATUSES)[number] = "paid";
      let amountPaid = opts.monthlyAmount;
      let paidDate: string | null = iso(addDays(dueDate, -3));
      if (!isPaid) {
        status = isOverdue ? "overdue" : isPartial ? "partial" : "sent";
        amountPaid = isPartial ? opts.monthlyAmount * 0.5 : 0;
        paidDate = isPartial ? iso(addDays(dueDate, -2)) : null;
      }
      invoiceRows.push({
        id: id(), contractId: opts.contractId, deploymentId: opts.deploymentId ?? null,
        invoiceNumber: `INV-${invoiceSeq++}`, invoiceDate: iso(invDate), dueDate: iso(dueDate),
        amount: round2(opts.monthlyAmount), status, amountPaid: round2(amountPaid), paidDate,
      });
    }
  }

  // Valley Crest: healthy collections, current.
  generateInvoices({ contractId: contractValleyCrest, deploymentId: depValleyCrest, startDate: "2026-03-15", monthlyAmount: 60_000, monthsSoFar: 6, paidThroughIndex: 4 });
  // Golden Coast RaaS: current on collections despite margin problem.
  generateInvoices({ contractId: contractGoldenCoastRaas, deploymentId: depGoldenCoast, startDate: "2026-03-20", monthlyAmount: 32_500, monthsSoFar: 6, paidThroughIndex: 4 });
  // Golden Coast software subscription
  generateInvoices({ contractId: contractGoldenCoastSoftware, startDate: "2026-01-01", monthlyAmount: 1_500, monthsSoFar: 9, paidThroughIndex: 7 });
  // Santa Maria seasonal: DELIBERATE overdue invoice (90+ days).
  generateInvoices({ contractId: contractSantaMaria, deploymentId: depSantaMaria, startDate: "2026-03-01", monthlyAmount: 44_285, monthsSoFar: 6, paidThroughIndex: 2, overdueIndexes: [3, 4] });
  // Santa Maria prior pilot — fully paid, closed out.
  generateInvoices({ contractId: contractSantaMariaPilot, startDate: "2025-05-01", monthlyAmount: 11_250, monthsSoFar: 4, paidThroughIndex: 3 });
  // Coastal Harvest per-robot-hour: one partial payment reflecting the SLA dispute.
  generateInvoices({ contractId: contractCoastalHarvest, deploymentId: depCoastalHarvest, startDate: "2026-02-15", monthlyAmount: 33_000, monthsSoFar: 7, paidThroughIndex: 4, partialIndexes: [5] });
  // Redwood Berry pilot: current.
  generateInvoices({ contractId: contractRedwoodBerry, deploymentId: depRedwoodBerry, startDate: "2026-06-01", monthlyAmount: 17_000, monthsSoFar: 4, paidThroughIndex: 2 });
  // Pacific Berry: deposit invoice only (not yet deployed).
  invoiceRows.push({
    id: id(), contractId: contractPacificBerry, deploymentId: null, invoiceNumber: `INV-${invoiceSeq++}`,
    invoiceDate: "2026-09-01", dueDate: "2026-10-01", amount: 60_000, status: "sent", amountPaid: 0, paidDate: null,
    notes: "Deposit invoice pending deployment kickoff.",
  });

  await db.insert(schema.invoices).values(invoiceRows);

  // ---------------------------------------------------------------------
  // Forecast scenarios (Base / Downside / Growth)
  // ---------------------------------------------------------------------
  console.log("Seeding forecast scenarios...");
  await db.insert(schema.forecastScenarios).values([
    {
      id: id(), name: "Base Case", scenarioType: "base", startingCash: 2_450_000,
      monthlyPayroll: 310_000, monthlyRnd: 60_000, monthlyGna: 45_000, monthlySalesMarketing: 25_000,
      monthlyCloudData: 9_000, monthlyInsurance: 8_000, monthlyTravelOps: 15_000,
      robotUnitCost: 45_000, robotsPlannedPerMonthJson: JSON.stringify({ "2026-11": 4, "2027-01": 4 }),
      collectionsDelayDays: 0, utilizationAdjustmentPct: 0, financingInflowJson: JSON.stringify({}),
      isActive: true,
    },
    {
      id: id(), name: "Downside — Slower Collections & Utilization", scenarioType: "downside", startingCash: 2_450_000,
      monthlyPayroll: 310_000, monthlyRnd: 60_000, monthlyGna: 45_000, monthlySalesMarketing: 20_000,
      monthlyCloudData: 9_000, monthlyInsurance: 8_000, monthlyTravelOps: 18_000,
      robotUnitCost: 45_000, robotsPlannedPerMonthJson: JSON.stringify({ "2027-01": 2 }),
      collectionsDelayDays: 45, utilizationAdjustmentPct: -20, financingInflowJson: JSON.stringify({}),
      isActive: true,
    },
    {
      id: id(), name: "Growth — 10 Robot Expansion Wave", scenarioType: "growth", startingCash: 2_450_000,
      monthlyPayroll: 340_000, monthlyRnd: 70_000, monthlyGna: 50_000, monthlySalesMarketing: 40_000,
      monthlyCloudData: 11_000, monthlyInsurance: 10_000, monthlyTravelOps: 22_000,
      robotUnitCost: 45_000, robotsPlannedPerMonthJson: JSON.stringify({ "2026-11": 10 }),
      collectionsDelayDays: 0, utilizationAdjustmentPct: 10,
      financingInflowJson: JSON.stringify({ "2026-11": 1_500_000 }),
      isActive: true,
    },
  ]);

  console.log("Computing initial alerts...");
  await syncAlerts();

  console.log("Seed complete.");
  console.log(`  Users: ${demoUsers.length}`);
  console.log(`  Customers: 6, Contracts: 8, Deployments: 6, Robots: 15`);
  console.log(`  Robot metric rows: ${metricRows.length}`);
  console.log(`  Cost rows: ${costRows.length}`);
  console.log(`  Invoice rows: ${invoiceRows.length}`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertInChunks(table: any, rows: any[], chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(table).values(rows.slice(i, i + chunkSize));
  }
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
