"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { costs, laborLogs, robotMetrics, invoices, COST_TYPES, INVOICE_STATUSES } from "@/db/schema";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { requireWriteAccess } from "@/lib/auth/session";

const OPS_ROLES = ["admin", "operations", "finance"] as const;
const FINANCE_ROLES = ["admin", "finance"] as const;

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

const metricSchema = z.object({
  date: z.string().min(1),
  robotId: z.string().min(1),
  deploymentId: z.string().min(1),
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
});

export async function logRobotMetric(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = metricSchema.parse(Object.fromEntries(formData));
  await db.insert(robotMetrics).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/robots");
  revalidatePath("/deployments");
}

const costSchema = z.object({
  deploymentId: z.string().min(1),
  date: z.string().min(1),
  costType: z.enum(COST_TYPES),
  amount: z.coerce.number().positive(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

export async function logCost(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = costSchema.parse(Object.fromEntries(formData));
  await db.insert(costs).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
}

const laborSchema = z.object({
  deploymentId: z.string().min(1),
  employeeRole: z.string().min(1),
  date: z.string().min(1),
  hours: z.coerce.number().positive(),
  hourlyCost: z.coerce.number().positive(),
  taskType: z.string().optional(),
});

export async function logLabor(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = laborSchema.parse(Object.fromEntries(formData));
  await db.insert(laborLogs).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export interface ImportResult {
  ok: boolean;
  inserted: number;
  errors: string[];
}

async function readCsv(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

export async function importCostsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, inserted: 0, errors: ["No file provided."] };
  const rows = await readCsv(file);
  const errors: string[] = [];
  const toInsert: (typeof costs.$inferInsert)[] = [];

  rows.forEach((row, i) => {
    const parsed = costSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    toInsert.push({ id: crypto.randomUUID(), ...parsed.data, isDemo: false });
  });

  if (toInsert.length > 0) await db.insert(costs).values(toInsert);
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importLaborCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, inserted: 0, errors: ["No file provided."] };
  const rows = await readCsv(file);
  const errors: string[] = [];
  const toInsert: (typeof laborLogs.$inferInsert)[] = [];

  rows.forEach((row, i) => {
    const parsed = laborSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    toInsert.push({ id: crypto.randomUUID(), ...parsed.data, isDemo: false });
  });

  if (toInsert.length > 0) await db.insert(laborLogs).values(toInsert);
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importMetricsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, inserted: 0, errors: ["No file provided."] };
  const rows = await readCsv(file);
  const errors: string[] = [];
  const toInsert: (typeof robotMetrics.$inferInsert)[] = [];

  rows.forEach((row, i) => {
    const parsed = metricSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    toInsert.push({ id: crypto.randomUUID(), ...parsed.data, isDemo: false });
  });

  if (toInsert.length > 0) await db.insert(robotMetrics).values(toInsert);
  revalidatePath("/data-entry");
  revalidatePath("/robots");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

const invoiceCsvSchema = z.object({
  contractId: z.string().min(1),
  deploymentId: z.string().optional(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: z.enum(INVOICE_STATUSES).default("sent"),
  amountPaid: z.coerce.number().nonnegative().default(0),
  paidDate: z.string().optional(),
});

export async function importInvoicesCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...FINANCE_ROLES]);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, inserted: 0, errors: ["No file provided."] };
  const rows = await readCsv(file);
  const errors: string[] = [];
  const toInsert: (typeof invoices.$inferInsert)[] = [];

  rows.forEach((row, i) => {
    const parsed = invoiceCsvSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    toInsert.push({ id: crypto.randomUUID(), ...parsed.data, deploymentId: parsed.data.deploymentId || null, paidDate: parsed.data.paidDate || null, isDemo: false });
  });

  if (toInsert.length > 0) await db.insert(invoices).values(toInsert);
  revalidatePath("/data-entry");
  revalidatePath("/invoices");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}
