import { describe, it, expect } from "vitest";
import {
  isoDate, optionalIsoDate, metricSchema, costSchema, invoiceCsvSchema, parseCsvRows,
  deploymentCsvSchema, robotAssignmentCsvSchema, paymentCsvSchema,
} from "./csvSchemas";

const validMetricRow = {
  date: "2026-09-18",
  robotId: "robot-1",
  deploymentId: "dep-1",
  availableHours: "60",
  activeHours: "55",
  productiveHours: "48",
  downtimeHours: "5",
};

describe("regression: CSV date validation (bug #3)", () => {
  it("rejects 'not-a-date' as a date value", () => {
    expect(isoDate.safeParse("not-a-date").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isoDate.safeParse("").success).toBe(false);
  });

  it("rejects a non-ISO format like MM/DD/YYYY", () => {
    expect(isoDate.safeParse("09/18/2026").success).toBe(false);
  });

  it("accepts a valid YYYY-MM-DD date", () => {
    expect(isoDate.safeParse("2026-09-18").success).toBe(true);
  });

  it("a metrics row with date='not-a-date' is rejected end to end via parseCsvRows", () => {
    const csv = `date,robotId,deploymentId,availableHours,activeHours,productiveHours,downtimeHours\nnot-a-date,robot-1,dep-1,60,55,48,5\n`;
    const { toInsert, errors } = parseCsvRows(csv, metricSchema);
    expect(toInsert).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/YYYY-MM-DD|date/i);
  });
});

describe("regression: CSV cross-field validation (bug #3)", () => {
  it("rejects productiveHours greater than activeHours", () => {
    const result = metricSchema.safeParse({ ...validMetricRow, activeHours: "40", productiveHours: "48" });
    expect(result.success).toBe(false);
  });

  it("rejects activeHours greater than availableHours", () => {
    const result = metricSchema.safeParse({ ...validMetricRow, availableHours: "50", activeHours: "55" });
    expect(result.success).toBe(false);
  });

  it("rejects downtimeHours greater than availableHours", () => {
    const result = metricSchema.safeParse({ ...validMetricRow, availableHours: "50", downtimeHours: "60" });
    expect(result.success).toBe(false);
  });

  it("rejects negative productive hours", () => {
    const result = metricSchema.safeParse({ ...validMetricRow, productiveHours: "-52" });
    expect(result.success).toBe(false);
  });

  it("rejects negative output units", () => {
    const result = metricSchema.safeParse({ ...validMetricRow, outputUnits: "-100" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing robotId", () => {
    const { robotId, ...rest } = validMetricRow;
    const result = metricSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing date", () => {
    const { date, ...rest } = validMetricRow;
    const result = metricSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts a fully valid row", () => {
    expect(metricSchema.safeParse(validMetricRow).success).toBe(true);
  });

  it("rejects a negative cost amount on the cost schema", () => {
    const result = costSchema.safeParse({ deploymentId: "dep-1", date: "2026-09-18", costType: "travel", amount: "-500" });
    expect(result.success).toBe(false);
  });
});

describe("regression: CSV import does not partially corrupt data (bug #3)", () => {
  it("a batch with 5 invalid rows and 1 valid row imports only the valid row, with 5 row-level errors", () => {
    const csv = [
      "date,robotId,deploymentId,availableHours,activeHours,productiveHours,downtimeHours",
      ",robot-1,dep-1,70,60,52,10", // missing date
      "2026-09-17,,dep-1,70,60,52,10", // missing robot id
      "2026-09-17,robot-1,dep-1,70,60,-52,10", // negative productive hours
      "not-a-date,robot-1,dep-1,70,60,52,10", // invalid date format
      "2026-09-17,robot-1,dep-1,50,45,90,5", // productive hours exceed active hours
      "2026-09-18,robot-1,dep-1,60,55,48,5", // VALID
    ].join("\n");

    const { toInsert, errors } = parseCsvRows(csv, metricSchema);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].date).toBe("2026-09-18");
    expect(errors).toHaveLength(5);
    // Row numbers are 1-indexed + header, so the first data row is "Row 2".
    expect(errors[0]).toMatch(/^Row 2:/);
  });
});

describe("deploymentCsvSchema (Gap F)", () => {
  const validRow = {
    customerId: "cust-1", contractId: "contract-1", name: "Test Deployment",
    plannedStartDate: "2026-09-18", plannedEndDate: "2027-03-31", robotsPlanned: "3",
  };

  it("accepts a minimal valid row, defaulting status to planned", () => {
    const result = deploymentCsvSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("planned");
  });

  it("rejects a missing customerId", () => {
    const { customerId, ...rest } = validRow;
    expect(deploymentCsvSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid planned start date", () => {
    expect(deploymentCsvSchema.safeParse({ ...validRow, plannedStartDate: "not-a-date" }).success).toBe(false);
  });

  it("rejects an unrecognized status value", () => {
    expect(deploymentCsvSchema.safeParse({ ...validRow, status: "on_fire" }).success).toBe(false);
  });
});

describe("robotAssignmentCsvSchema (Gap F)", () => {
  it("accepts a valid row", () => {
    expect(robotAssignmentCsvSchema.safeParse({ robotId: "r1", deploymentId: "d1", assignmentStart: "2026-09-18" }).success).toBe(true);
  });

  it("rejects a missing robotId", () => {
    expect(robotAssignmentCsvSchema.safeParse({ deploymentId: "d1", assignmentStart: "2026-09-18" }).success).toBe(false);
  });

  it("rejects an invalid assignmentStart date", () => {
    expect(robotAssignmentCsvSchema.safeParse({ robotId: "r1", deploymentId: "d1", assignmentStart: "09/18/2026" }).success).toBe(false);
  });
});

describe("regression: optional CSV date columns accept a blank cell, not just a missing key", () => {
  it("rejects an empty string on a bare isoDate.optional() the naive way", () => {
    // Documents the bug itself: isoDate.optional() alone still runs isoDate's regex against
    // "" (Papaparse's header:true fills every column, blank or not) and rejects it.
    expect(isoDate.optional().safeParse("").success).toBe(false);
  });

  it("optionalIsoDate accepts a blank cell as 'not provided'", () => {
    const result = optionalIsoDate.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("optionalIsoDate still rejects a genuinely malformed date", () => {
    expect(optionalIsoDate.safeParse("09/18/2026").success).toBe(false);
  });

  it("optionalIsoDate still accepts a valid date", () => {
    expect(optionalIsoDate.safeParse("2026-09-18").success).toBe(true);
  });

  it("the shipped invoices_template.csv sample row (blank trailing paidDate) imports cleanly", () => {
    // This is the exact row shape public/templates/invoices_template.csv ships — a blank
    // paidDate produces a trailing comma, i.e. paidDate="". Before the optionalIsoDate fix
    // this row failed to import at all.
    const csv = "contractId,deploymentId,invoiceNumber,invoiceDate,dueDate,amount,status,amountPaid,paidDate\ncontract-1,,INV-2001,2026-09-01,2026-10-01,32500,sent,0,\n";
    const { toInsert, errors } = parseCsvRows(csv, invoiceCsvSchema);
    expect(errors).toHaveLength(0);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].paidDate).toBeUndefined();
  });
});

describe("paymentCsvSchema (Gap F) — feeds the same overpayment guard as regression bug #4", () => {
  it("accepts a valid row", () => {
    expect(paymentCsvSchema.safeParse({ invoiceNumber: "INV-1001", amountPaid: "5000", paidDate: "2026-09-18" }).success).toBe(true);
  });

  it("rejects a non-positive amountPaid", () => {
    expect(paymentCsvSchema.safeParse({ invoiceNumber: "INV-1001", amountPaid: "0", paidDate: "2026-09-18" }).success).toBe(false);
  });

  it("rejects a missing invoiceNumber", () => {
    expect(paymentCsvSchema.safeParse({ amountPaid: "5000", paidDate: "2026-09-18" }).success).toBe(false);
  });
});
