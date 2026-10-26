import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFuzzyScore,
  calculateLevenshteinDistance,
  formatCurrencyVND,
  validateInvoiceMath,
  evaluateLineItem,
  normalizeVietnamese,
} from './matchingEngine.ts';
import type { LineItem, RuleSettings } from '../types/index.ts';

test('normalizeVietnamese handles tones and lowercase properly', () => {
  assert.equal(normalizeVietnamese('Mực In Laser Đen HP 85A'), 'muc in laser den hp 85a');
  assert.equal(normalizeVietnamese('CÔNG TY CỔ PHẦN'), 'cong ty co phan');
});

test('calculateLevenshteinDistance works accurately', () => {
  assert.equal(calculateLevenshteinDistance('HP 85A', 'HP 85A'), 0);
  assert.equal(calculateLevenshteinDistance('Giấy A4', 'Giay A4'), 0); // Normalized
  assert.ok(calculateLevenshteinDistance('Ram 8GB', 'Ram 16GB') > 0);
});

test('calculateFuzzyScore scores identical and near-identical strings high', () => {
  const score100 = calculateFuzzyScore('Giấy In Double A A4 70gsm', 'Giấy in Double A A4 70gsm');
  assert.equal(score100, 100);

  const nearScore = calculateFuzzyScore('Laptop Dell Vostro 3520 i5', 'Laptop Dell Vostro 3520');
  assert.ok(nearScore > 75, `Score should be > 75, got ${nearScore}`);
});

test('validateInvoiceMath detects math variance within tolerance', () => {
  // Correct math
  const valid = validateInvoiceMath(10000000, 1000000, 11000000, 10);
  assert.equal(valid.isValid, true);
  assert.equal(valid.variance, 0);

  // Slight rounding variance within 10 VND
  const validTolerance = validateInvoiceMath(10000000, 1000000, 11000005, 10);
  assert.equal(validTolerance.isValid, true);
  assert.equal(validTolerance.variance, 5);

  // Severe variance
  const invalid = validateInvoiceMath(10000000, 1000000, 12000000, 10);
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.variance, 1000000);
});

test('evaluateLineItem detects price and quantity mismatches', () => {
  const defaultSettings: RuleSettings = {
    toleranceThresholdVnd: 10,
    fuzzyMatchingThresholdPct: 80,
    ocrConfidenceThresholdPct: 85,
    rpaScanIntervalMinutes: 5,
    autoAlertEmail: true,
    autoAlertTelegram: false,
  };

  const matchedItem: LineItem = {
    id: 'item-1',
    lineNo: 1,
    itemNameInvoice: 'Ram Kingston 16GB DDR4',
    itemNamePO: 'Ram Kingston 16GB DDR4',
    unit: 'Chiếc',
    quantityInvoice: 10,
    quantityPO: 10,
    quantityGR: 10,
    unitPriceInvoice: 1200000,
    unitPricePO: 1200000,
    vatRate: 10,
    amountInvoice: 12000000,
    fuzzyScore: 100,
    isQuantityMismatch: false,
    isPriceMismatch: false,
    isMathMismatch: false,
    isFuzzyMismatch: false,
    ocrConfidence: 96,
  };

  const res1 = evaluateLineItem(matchedItem, defaultSettings);
  assert.equal(res1.anomalies.length, 0);
  assert.equal(res1.evaluatedItem.isPriceMismatch, false);
  assert.equal(res1.evaluatedItem.isQuantityMismatch, false);

  const mismatchedItem: LineItem = {
    ...matchedItem,
    quantityInvoice: 12,
    quantityPO: 10,
    quantityGR: 10,
    unitPriceInvoice: 1350000, // Price discrepancy
    amountInvoice: 12 * 1350000,
  };

  const res2 = evaluateLineItem(mismatchedItem, defaultSettings);
  assert.equal(res2.evaluatedItem.isPriceMismatch, true);
  assert.equal(res2.evaluatedItem.isQuantityMismatch, true);
  assert.ok(res2.anomalies.some((a) => a.type === 'PRICE_MISMATCH'));
  assert.ok(res2.anomalies.some((a) => a.type === 'QTY_MISMATCH'));
});

test('formatCurrencyVND formats accurately with VNĐ suffix', () => {
  assert.equal(formatCurrencyVND(15000000), '15.000.000 đ');
});
