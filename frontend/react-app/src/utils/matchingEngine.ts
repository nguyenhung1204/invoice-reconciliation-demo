import type { AnomalyItem, LineItem, RuleSettings } from '../types/index.ts';

/**
 * Chuẩn hóa chuỗi tiếng Việt để so khớp tương đồng
 */
export function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Thuật toán tính khoảng cách Levenshtein giữa 2 chuỗi
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const normA = normalizeVietnamese(a);
  const normB = normalizeVietnamese(b);

  const m = normA.length;
  const n = normB.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = normA[i - 1] === normB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // Deletion
        dp[i][j - 1] + 1,      // Insertion
        dp[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Tính tỷ lệ % tương đồng Levenshtein (Fuzzy Matching Score: 0 - 100%)
 */
export function calculateFuzzyScore(a: string, b: string): number {
  const normA = normalizeVietnamese(a);
  const normB = normalizeVietnamese(b);
  if (!normA && !normB) return 100;
  if (!normA || !normB) return 0;

  const maxLength = Math.max(normA.length, normB.length);
  if (maxLength === 0) return 100;

  const distance = calculateLevenshteinDistance(a, b);
  const score = Math.max(0, 1 - distance / maxLength) * 100;
  return Math.round(score * 10) / 10;
}

/**
 * Định dạng tiền tệ VNĐ chuẩn kế toán
 */
export function formatCurrencyVND(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount) + ' đ';
}

/**
 * Kiểm tra tính toán toán học nội tại (Footer Math Validation)
 */
export function validateInvoiceMath(
  subTotal: number,
  vatAmount: number,
  grandTotal: number,
  toleranceVnd: number = 10
): { isValid: boolean; expectedGrandTotal: number; variance: number } {
  const expectedGrandTotal = subTotal + vatAmount;
  const variance = Math.abs(grandTotal - expectedGrandTotal);
  return {
    isValid: variance <= toleranceVnd,
    expectedGrandTotal,
    variance,
  };
}

/**
 * Chạy thuật toán đối soát 3 bên cho từng dòng mặt hàng (Line-Item 3-Way Matching)
 */
export function evaluateLineItem(
  item: LineItem,
  settings: RuleSettings
): {
  evaluatedItem: LineItem;
  anomalies: AnomalyItem[];
} {
  const fuzzy = calculateFuzzyScore(item.itemNameInvoice, item.itemNamePO);
  const isFuzzyMismatch = fuzzy < settings.fuzzyMatchingThresholdPct;
  const isQuantityMismatch = item.quantityInvoice !== item.quantityPO || item.quantityInvoice !== item.quantityGR;
  const isPriceMismatch = Math.abs(item.unitPriceInvoice - item.unitPricePO) > settings.toleranceThresholdVnd;

  // Kiểm tra nhân chéo nội tại dòng hàng
  const expectedAmount = item.quantityInvoice * item.unitPriceInvoice;
  const isMathMismatch = Math.abs(item.amountInvoice - expectedAmount) > settings.toleranceThresholdVnd;

  const anomalies: AnomalyItem[] = [];

  if (isFuzzyMismatch) {
    anomalies.push({
      id: `ANOM-FUZZY-${item.lineNo}`,
      type: 'PRICE_MISMATCH',
      severity: 'WARNING',
      title: `Tên mặt hàng dòng #${item.lineNo} độ khớp thấp (${fuzzy}%)`,
      description: `Hóa đơn ghi "${item.itemNameInvoice}", trong khi Đơn hàng PO ghi "${item.itemNamePO}".`,
      lineNo: item.lineNo,
    });
  }

  if (isPriceMismatch) {
    anomalies.push({
      id: `ANOM-PRICE-${item.lineNo}`,
      type: 'PRICE_MISMATCH',
      severity: 'CRITICAL',
      title: `Lệch đơn giá dòng #${item.lineNo}`,
      description: `Đơn giá HĐ (${formatCurrencyVND(item.unitPriceInvoice)}) lệch so với thỏa thuận PO (${formatCurrencyVND(item.unitPricePO)}).`,
      lineNo: item.lineNo,
    });
  }

  if (isQuantityMismatch) {
    anomalies.push({
      id: `ANOM-QTY-${item.lineNo}`,
      type: 'QTY_MISMATCH',
      severity: 'CRITICAL',
      title: `Lệch số lượng dòng #${item.lineNo}`,
      description: `HĐ xuất ${item.quantityInvoice} ${item.unit}, nhưng PO đặt ${item.quantityPO} ${item.unit} và Phiếu kho GR thực nhận ${item.quantityGR} ${item.unit}.`,
      lineNo: item.lineNo,
    });
  }

  if (isMathMismatch) {
    anomalies.push({
      id: `ANOM-MATH-${item.lineNo}`,
      type: 'MATH_ERROR',
      severity: 'CRITICAL',
      title: `Sai phép tính nhân chéo dòng #${item.lineNo}`,
      description: `Thành tiền ghi ${formatCurrencyVND(item.amountInvoice)} nhưng phép tính (${item.quantityInvoice} x ${formatCurrencyVND(item.unitPriceInvoice)}) = ${formatCurrencyVND(expectedAmount)}.`,
      lineNo: item.lineNo,
    });
  }

  if (item.ocrConfidence < settings.ocrConfidenceThresholdPct) {
    anomalies.push({
      id: `ANOM-OCR-${item.lineNo}`,
      type: 'LOW_OCR_CONFIDENCE',
      severity: 'WARNING',
      title: `Độ tin cậy OCR dòng #${item.lineNo} dưới ngưỡng (${item.ocrConfidence}%)`,
      description: `Ký tự nhận dạng có thể bị mờ nhòe hoặc nhầm lẫn, cần kế toán kiểm tra lại bằng mắt thường.`,
      lineNo: item.lineNo,
    });
  }

  return {
    evaluatedItem: {
      ...item,
      fuzzyScore: fuzzy,
      isFuzzyMismatch,
      isQuantityMismatch,
      isPriceMismatch,
      isMathMismatch,
    },
    anomalies,
  };
}
