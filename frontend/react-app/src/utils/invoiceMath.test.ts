import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInvoiceMath, invoiceStatusLabel } from './invoiceMath.ts';

test('accepts lines whose subtotal plus a known VAT rate equals the total', () => {
  const result = checkInvoiceMath([
    { quantity: 2, unit_price: 100_000, amount: 200_000 },
    { quantity: 1, unit_price: 300_000, amount: 300_000 },
  ], 540_000);
  assert.equal(result.status, 'ok');
  assert.equal(result.linesSubtotal, 500_000);
  assert.equal(result.impliedVat, 40_000);
  assert.equal(result.matchedVatRate, 8);
  assert.equal(result.impliedVatRate, 8);
});

test('flags line arithmetic and unknown VAT rates', () => {
  const result = checkInvoiceMath([
    { quantity: 3, unit_price: 100_000, amount: 250_000 },
  ], 290_000);
  assert.equal(result.status, 'warn');
  assert.equal(result.lineMismatches.length, 1);
  assert.equal(result.lineMismatches[0].difference, -50_000);
  assert.equal(result.matchedVatRate, null);
});

test('reports insufficient data without a total or line amounts', () => {
  assert.equal(checkInvoiceMath([{ quantity: 1, unit_price: 1, amount: null }], 10).status, 'insufficient');
  assert.equal(checkInvoiceMath([{ quantity: 1, unit_price: 1, amount: 1 }], null).status, 'insufficient');
});

test('maps backend statuses to Vietnamese labels and keeps unknown codes', () => {
  assert.equal(invoiceStatusLabel('needs_review'), 'Cần xác nhận');
  assert.equal(invoiceStatusLabel('custom_state'), 'custom_state');
});
