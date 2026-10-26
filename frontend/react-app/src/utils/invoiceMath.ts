/**
 * Client-side arithmetic checks for the review form. These are advisory only: the official
 * reconciliation outcome always comes from the backend `/invoices/{id}/reconcile` response.
 */

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  needs_review: 'Cần xác nhận',
  ocr_done: 'OCR hoàn tất',
  reviewed: 'Đã rà soát',
  matched: 'Khớp hoàn toàn',
  mismatch: 'Phát hiện sai lệch',
  approved: 'Đã phê duyệt',
  archived: 'Đã lưu trữ',
};

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

/** VAT rates in current Vietnamese practice (0%, 5%, 8% reduced, 10%). */
export const KNOWN_VAT_RATES = [0, 5, 8, 10] as const;

export interface MathLineInput {
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface LineCheck {
  index: number;
  expected: number;
  amount: number;
  difference: number;
}

export interface InvoiceMathResult {
  /** Sum of line amounts (pre-tax subtotal as captured on the lines). Null when no line has an amount. */
  linesSubtotal: number | null;
  total: number | null;
  /** total - linesSubtotal: the implied VAT amount. */
  impliedVat: number | null;
  /** Implied VAT rate in percent, rounded to 2 decimals. */
  impliedVatRate: number | null;
  /** Closest known VAT rate when the implied rate is within tolerance of it. */
  matchedVatRate: number | null;
  /** Lines where quantity × unit price differs from the amount beyond tolerance. */
  lineMismatches: LineCheck[];
  status: 'ok' | 'warn' | 'insufficient';
}

const toNumber = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function checkInvoiceMath(lines: MathLineInput[], totalAmount: number | null, tolerance = 1): InvoiceMathResult {
  const safeTolerance = Math.max(0, tolerance);
  const lineMismatches: LineCheck[] = [];
  let subtotal = 0;
  let amountCount = 0;

  lines.forEach((line, index) => {
    const quantity = toNumber(line.quantity);
    const unitPrice = toNumber(line.unit_price);
    const amount = toNumber(line.amount);
    if (amount !== null) {
      subtotal += amount;
      amountCount += 1;
    }
    if (quantity !== null && unitPrice !== null && amount !== null) {
      const expected = quantity * unitPrice;
      const difference = amount - expected;
      if (Math.abs(difference) > safeTolerance) lineMismatches.push({ index, expected, amount, difference });
    }
  });

  const total = toNumber(totalAmount);
  const linesSubtotal = amountCount > 0 ? subtotal : null;
  if (linesSubtotal === null || total === null) {
    return { linesSubtotal, total, impliedVat: null, impliedVatRate: null, matchedVatRate: null, lineMismatches, status: 'insufficient' };
  }

  const impliedVat = total - linesSubtotal;
  const impliedVatRate = linesSubtotal > 0 ? Math.round((impliedVat / linesSubtotal) * 10000) / 100 : null;
  const matchedVatRate = linesSubtotal > 0
    ? KNOWN_VAT_RATES.find((rate) => Math.abs(linesSubtotal * (1 + rate / 100) - total) <= safeTolerance) ?? null
    : null;
  const status = matchedVatRate !== null && lineMismatches.length === 0 ? 'ok' : 'warn';
  return { linesSubtotal, total, impliedVat, impliedVatRate, matchedVatRate, lineMismatches, status };
}
