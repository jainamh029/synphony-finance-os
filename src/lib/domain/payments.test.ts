import { describe, it, expect } from "vitest";
import { validatePayment } from "./payments";

describe("regression: invoice overpayment prevention (bug #4)", () => {
  it("rejects a payment larger than the remaining balance", () => {
    const invoice = { amount: 5000, amountPaid: 0, status: "sent" };
    const result = validatePayment(invoice, 999_999);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/5,000|5000/); // remaining balance
    expect(result.error).toMatch(/999,999|999999/); // attempted payment
  });

  it("rejects overpayment against a partially-paid invoice (balance, not full amount)", () => {
    // $60,000 invoice, $10,000 already paid -> $50,000 remaining. $55,000 must be rejected
    // even though it's less than the invoice's full $60,000 amount.
    const invoice = { amount: 60_000, amountPaid: 10_000, status: "partial" };
    const result = validatePayment(invoice, 55_000);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/50,000/);
  });

  it("error message names invoice amount, paid-to-date, and remaining balance", () => {
    const invoice = { amount: 60_000, amountPaid: 10_000, status: "partial" };
    const result = validatePayment(invoice, 55_000);
    expect(result.error).toMatch(/60,000/); // invoice amount
    expect(result.error).toMatch(/10,000/); // paid to date
    expect(result.error).toMatch(/50,000/); // remaining balance
  });

  it("does not mutate anything on rejection (returns no totalPaid/status)", () => {
    const result = validatePayment({ amount: 5000, amountPaid: 0, status: "sent" }, 999_999);
    expect(result.totalPaid).toBeUndefined();
    expect(result.status).toBeUndefined();
  });
});

describe("payment: allowed cases", () => {
  it("accepts a payment exactly equal to the remaining balance and marks paid", () => {
    const result = validatePayment({ amount: 5000, amountPaid: 0, status: "sent" }, 5000);
    expect(result.ok).toBe(true);
    expect(result.totalPaid).toBe(5000);
    expect(result.status).toBe("paid");
  });

  it("accepts a partial payment and marks partial", () => {
    const result = validatePayment({ amount: 60_000, amountPaid: 0, status: "sent" }, 10_000);
    expect(result.ok).toBe(true);
    expect(result.totalPaid).toBe(10_000);
    expect(result.status).toBe("partial");
  });

  it("accepts a second payment that completes a partially-paid invoice", () => {
    const result = validatePayment({ amount: 20_000, amountPaid: 10_000, status: "partial" }, 10_000);
    expect(result.ok).toBe(true);
    expect(result.totalPaid).toBe(20_000);
    expect(result.status).toBe("paid");
  });

  it("tolerates sub-cent floating-point rounding at the exact balance", () => {
    const result = validatePayment({ amount: 100.1, amountPaid: 50.05, status: "partial" }, 50.05);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("paid");
  });
});
