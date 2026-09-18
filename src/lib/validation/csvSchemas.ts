/**
 * Zod schemas shared between manual-entry Server Actions and CSV import, plus the generic
 * CSV-row validator. Kept in a plain module (not a `"use server"` file) for two reasons:
 * Next.js only allows async function exports from `"use server"` files, so schemas can't
 * live there directly; and this way every validation rule is unit-testable without a
 * database or request context.
 */
import { z } from "zod";
import Papa from "papaparse";
import { COST_TYPES, INVOICE_STATUSES, DEPLOYMENT_STATUSES } from "@/db/schema";

// A bare `.min(1)` on a date field only rejects empty strings — a CSV row with
// date="not-a-date" would pass that check and get written straight into a text column,
// silently corrupting every downstream calculation that reads it as a real date. Manual
// entry forms are naturally protected by the browser's <input type="date"> widget, but CSV
// import accepts arbitrary text, so schemas shared with CSV import need this explicit check.
export const isoDate = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime()), {
  message: "must be a valid date in YYYY-MM-DD format",
});

// A CSV-sourced row from parseCsvRows always has every header as a key, even when the cell
// was left blank — Papaparse (header:true) turns a blank optional-date cell into "" ,not a
// missing key. Zod's `.optional()` only treats the JS value `undefined` as "not provided";
// it still runs `isoDate`'s regex against "" and rejects it. Without this preprocessing step,
// EVERY row with a blank optional date column fails to import — this bit the shipped
// invoices_template.csv itself (its sample row's trailing paidDate cell is blank).
export const optionalIsoDate = z.preprocess((v) => (v === "" ? undefined : v), isoDate.optional());

export const metricSchema = z
  .object({
    date: isoDate,
    robotId: z.string().min(1, "robotId is required"),
    deploymentId: z.string().min(1, "deploymentId is required"),
    availableHours: z.coerce.number().nonnegative(),
    activeHours: z.coerce.number().nonnegative(),
    productiveHours: z.coerce.number().nonnegative(),
    downtimeHours: z.coerce.number().nonnegative().default(0),
    interventionHours: z.coerce.number().nonnegative().default(0),
    outputUnits: z.coerce.number().nonnegative().default(0),
    poundsHarvested: z.coerce.number().nonnegative().default(0),
    maintenanceIncidents: z.coerce.number().int().nonnegative().default(0),
    repairCost: z.coerce.number().nonnegative().default(0),
    sparePartsCost: z.coerce.number().nonnegative().default(0),
    technicianHours: z.coerce.number().nonnegative().default(0),
    technicianLaborCost: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional(),
  })
  .refine((v) => v.productiveHours <= v.activeHours, {
    message: "productiveHours cannot exceed activeHours",
    path: ["productiveHours"],
  })
  .refine((v) => v.activeHours <= v.availableHours, {
    message: "activeHours cannot exceed availableHours",
    path: ["activeHours"],
  })
  .refine((v) => v.downtimeHours <= v.availableHours, {
    message: "downtimeHours cannot exceed availableHours",
    path: ["downtimeHours"],
  });

export const costSchema = z.object({
  deploymentId: z.string().min(1, "deploymentId is required"),
  date: isoDate,
  costType: z.enum(COST_TYPES),
  amount: z.coerce.number().positive(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

export const laborSchema = z.object({
  deploymentId: z.string().min(1, "deploymentId is required"),
  employeeRole: z.string().min(1),
  date: isoDate,
  hours: z.coerce.number().positive(),
  hourlyCost: z.coerce.number().positive(),
  taskType: z.string().optional(),
});

export const invoiceCsvSchema = z.object({
  contractId: z.string().min(1, "contractId is required"),
  deploymentId: z.string().optional(),
  invoiceNumber: z.string().min(1),
  invoiceDate: isoDate,
  dueDate: isoDate,
  amount: z.coerce.number().positive(),
  status: z.enum(INVOICE_STATUSES).default("sent"),
  amountPaid: z.coerce.number().nonnegative().default(0),
  paidDate: optionalIsoDate,
});

export const customerCsvSchema = z.object({
  farmName: z.string().min(1),
  parentOrg: z.string().optional(),
  location: z.string().min(1),
  cropType: z.string().min(1).default("Strawberries"),
  acres: z.coerce.number().nonnegative().optional(),
  seasonStart: z.string().optional(),
  seasonEnd: z.string().optional(),
  expectedVolumeLbs: z.coerce.number().nonnegative().optional(),
  manualLaborCostPerHour: z.coerce.number().nonnegative().optional(),
  manualLaborCostPerLb: z.coerce.number().nonnegative().optional(),
  customerOwner: z.string().optional(),
  lifecycleStage: z
    .enum(["lead", "qualified", "pilot", "contracted", "deploying", "active", "renewal", "paused", "churned", "archived"])
    .default("lead"),
  notes: z.string().optional(),
});

export const contractCsvSchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
  contractType: z.enum(["pilot", "fixed_seasonal", "per_robot_hour", "per_pound", "per_acre", "raas_subscription", "software_subscription", "hybrid"]),
  startDate: isoDate,
  endDate: isoDate,
  totalContractValue: z.coerce.number().nonnegative(),
  mobilizationFee: z.coerce.number().nonnegative().default(0),
  depositAmount: z.coerce.number().nonnegative().default(0),
  minimumCommitment: z.coerce.number().nonnegative().default(0),
  variablePricePerUnit: z.coerce.number().nonnegative().optional(),
  variableUnitType: z.enum(["lb", "robot_hour", "acre"]).optional(),
  monthlySubscriptionAmount: z.coerce.number().nonnegative().optional(),
  expectedOutputVolume: z.coerce.number().nonnegative().optional(),
  robotsCommitted: z.coerce.number().int().nonnegative().default(0),
  paymentTermsDays: z.coerce.number().int().positive().default(30),
  status: z.enum(["draft", "in_review", "active", "completed", "cancelled", "expired", "archived", "terminated", "renewed"]).default("active"),
  notes: z.string().optional(),
});

export const deploymentCsvSchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
  contractId: z.string().min(1, "contractId is required"),
  name: z.string().min(1),
  status: z.enum(DEPLOYMENT_STATUSES).default("planned"),
  plannedStartDate: isoDate,
  plannedEndDate: isoDate,
  actualStartDate: optionalIsoDate,
  actualEndDate: optionalIsoDate,
  robotsPlanned: z.coerce.number().int().nonnegative().default(0),
  expectedOperatingHours: z.coerce.number().nonnegative().optional(),
  expectedOutputVolume: z.coerce.number().nonnegative().optional(),
  expectedTechnicianHours: z.coerce.number().nonnegative().optional(),
  expectedUptimePct: z.coerce.number().min(0).max(100).default(90),
  expectedUtilizationPct: z.coerce.number().min(0).max(100).default(70),
  operationsOwner: z.string().optional(),
  financeOwner: z.string().optional(),
  notes: z.string().optional(),
});

export const robotAssignmentCsvSchema = z.object({
  robotId: z.string().min(1, "robotId is required"),
  deploymentId: z.string().min(1, "deploymentId is required"),
  assignmentStart: isoDate,
  assignmentEnd: optionalIsoDate,
});

export const paymentCsvSchema = z.object({
  invoiceNumber: z.string().min(1, "invoiceNumber is required"),
  amountPaid: z.coerce.number().positive(),
  paidDate: isoDate,
});

export const robotCsvSchema = z.object({
  robotCode: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().optional(),
  acquisitionType: z.enum(["purchased", "manufactured", "leased", "customer_funded", "partner_provided"]).default("manufactured"),
  acquisitionDate: isoDate,
  purchaseCost: z.coerce.number().nonnegative(),
  usefulLifeMonths: z.coerce.number().int().positive().default(48),
  monthlyLeaseCost: z.coerce.number().nonnegative().default(0),
  warrantyExpiry: optionalIsoDate,
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generic CSV row parsing — pure (operates on a string, not a File), so it's
// testable in any JS environment without touching the browser File API.
// ---------------------------------------------------------------------------

export interface CsvParseResult<T> {
  toInsert: T[];
  errors: string[];
}

export function parseCsvRows<T>(csvText: string, schema: z.ZodType<T>): CsvParseResult<T> {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const errors: string[] = [];
  const toInsert: T[] = [];

  result.data.forEach((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    toInsert.push(parsed.data);
  });

  return { toInsert, errors };
}
