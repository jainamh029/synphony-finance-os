/**
 * Pure invoice-payment validation — extracted from src/lib/actions/invoices.ts so the
 * "a payment cannot exceed the remaining balance" rule is unit-testable without a database.
 */

export interface PaymentValidationResult {
  ok: boolean;
  error?: string;
  /** Present only when ok: true — the invoice's total paid amount and status after this payment. */
  totalPaid?: number;
  status?: "sent" | "partial" | "paid";
}

const OVERPAYMENT_TOLERANCE = 0.01; // absorbs floating-point rounding, not a real overpayment allowance

export function validatePayment(
  invoice: { amount: number; amountPaid: number; status: string },
  paymentAmount: number
): PaymentValidationResult {
  const remainingBalance = invoice.amount - invoice.amountPaid;

  if (paymentAmount > remainingBalance + OVERPAYMENT_TOLERANCE) {
    return {
      ok: false,
      error:
        `Payment of $${paymentAmount.toLocaleString()} exceeds the remaining balance of $${remainingBalance.toLocaleString()} ` +
        `on this invoice (invoice amount $${invoice.amount.toLocaleString()}, paid to date $${invoice.amountPaid.toLocaleString()}). ` +
        `Overpayments aren't supported yet — record a payment up to the remaining balance, or void/adjust the invoice first.`,
    };
  }

  const totalPaid = invoice.amountPaid + paymentAmount;
  const status = totalPaid >= invoice.amount - OVERPAYMENT_TOLERANCE ? "paid" : totalPaid > 0 ? "partial" : (invoice.status as "sent");

  return { ok: true, totalPaid, status };
}
