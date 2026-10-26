export type UserRole = 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'ADMIN';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  avatar: string;
}

export type ProcessingStatus =
  | 'WAITING'           // Đang trong hàng đợi
  | 'OPENCV_PREPROCESS' // Đang tiền xử lý ảnh OpenCV
  | 'PADDLE_OCR'        // Đang trích xuất PaddleOCR
  | 'MATCHING'          // Đang đối soát 3 bên
  | 'NEED_CONFIRM'      // Cần xác nhận thủ công (Confidence < 85% hoặc cảnh báo nhẹ)
  | 'MISMATCH'          // Phát hiện sai lệch (đơn giá, số lượng, thuế)
  | 'MATCHED'           // Khớp 3 bên hoàn toàn
  | 'REJECTED';         // Đã từ chối

export interface BoundingBox {
  id: string;
  fieldKey: string;
  x: number;       // Tỷ lệ % từ mép trái (0 - 100)
  y: number;       // Tỷ lệ % từ mép trên (0 - 100)
  width: number;   // Tỷ lệ % chiều rộng (0 - 100)
  height: number;  // Tỷ lệ % chiều cao (0 - 100)
  text: string;
  confidence: number; // 0 - 100
  isAnomaly?: boolean;
}

export interface LineItem {
  id: string;
  lineNo: number;
  itemNameInvoice: string;
  itemNamePO: string;
  unit: string;
  quantityInvoice: number;
  quantityPO: number;
  quantityGR: number;
  unitPriceInvoice: number;
  unitPricePO: number;
  vatRate: number; // 8 hoặc 10
  amountInvoice: number;
  fuzzyScore: number; // Điểm tương đồng xấp xỉ Levenshtein 0 - 100%
  isQuantityMismatch: boolean;
  isPriceMismatch: boolean;
  isMathMismatch: boolean;
  isFuzzyMismatch: boolean;
  ocrConfidence: number;
  boxId?: string;
}

export interface AnomalyItem {
  id: string;
  type: 'PRICE_MISMATCH' | 'QTY_MISMATCH' | 'MATH_ERROR' | 'PO_NOT_FOUND' | 'DUPLICATE_INVOICE' | 'TAX_CODE_RISK' | 'LOW_OCR_CONFIDENCE';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  fieldKey?: string;
  lineNo?: number;
}

export interface AuditLog {
  id: string;
  invoiceCode: string;
  timestamp: string;
  user: string;
  userRole: UserRole;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface InvoiceHeader {
  invoiceCode: string;       // INV-2026-0001
  invoiceNumber: string;     // 0001248
  invoiceSeries: string;     // 1C26TAA
  issueDate: string;         // YYYY-MM-DD
  sellerName: string;
  sellerTaxCode: string;     // 10 chữ số
  sellerAddress: string;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  poCode: string;            // PO-2026-0001
  grCode: string;            // PNK-2026-0001
  paymentMethod: string;     // Chuyển khoản (CK)
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
  qrCodeData: string;
  taxStatus: 'ACTIVE' | 'TAX_RISK' | 'SUSPENDED';
  ocrAverageConfidence: number; // %
}

export interface InvoiceRecord {
  id: string;
  code: string;              // INV-2026-0001
  fileName: string;
  fileSizeKb: number;
  fileSha256: string;
  receivedAt: string;
  status: ProcessingStatus;
  header: InvoiceHeader;
  lineItems: LineItem[];
  anomalies: AnomalyItem[];
  auditLogs: AuditLog[];
  boundingBoxes: BoundingBox[];
  ocrConfidenceMap: Record<string, number>;
  approvalNote?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PurchaseOrder {
  code: string;              // PO-2026-0001
  supplierName: string;
  supplierTaxCode: string;
  orderDate: string;
  expectedDeliveryDate: string;
  totalEstimatedAmount: number;
  status: 'PENDING' | 'PARTIALLY_DELIVERED' | 'FULFILLED' | 'CANCELLED';
  createdBy: string;
  items: {
    lineNo: number;
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  poStatus?: string;
  linkedInvoiceNumber?: string;
  actualInvoiceTotal?: number;
  invoicedQty?: number;
  missingQty?: number;
  parentPoCode?: string;
  supplierCode?: string;
  employeeCode?: string;
}

export interface GoodsReceipt {
  code: string;              // PNK-2026-0001
  poCode: string;
  supplierName: string;
  receiptDate: string;
  receivedBy: string;
  warehouseLocation: string;
  items: {
    lineNo: number;
    itemName: string;
    unit: string;
    quantityReceived: number;
    notes?: string;
  }[];
}

export interface SupplierMaster {
  code: string;              // NCC-01
  name: string;
  taxCode: string;
  address: string;
  phone?: string;
  email?: string;
  legalStatus: 'ACTIVE' | 'WARNING_HIGH_RISK' | 'CLOSED';
  anchorKeywords: string[];  // Từ khóa nhận dạng mẫu hóa đơn (FPT, Petrolimex,...)
  totalInvoicesReceived: number;
  mismatchRate: number;      // %
}

export interface RpaScanLog {
  id: string;
  timestamp: string;
  source: 'EMAIL_IMAP' | 'SHARED_FOLDER_SMB' | 'MANUAL_UPLOAD';
  fileName: string;
  status: 'ACCEPTED' | 'REJECTED_NON_INVOICE' | 'REJECTED_TOO_SMALL' | 'REJECTED_WRONG_BUYER_MST' | 'REJECTED_DUPLICATE_HASH';
  fileHash: string;
  reason?: string;
}

export interface RuleSettings {
  toleranceThresholdVnd: number;     // Ngưỡng dung sai VNĐ (mặc định 10)
  fuzzyMatchingThresholdPct: number; // Ngưỡng chuỗi Levenshtein % (mặc định 80)
  ocrConfidenceThresholdPct: number; // Ngưỡng cảnh báo độ tin cậy OCR (mặc định 85)
  rpaScanIntervalMinutes: number;    // Chu kỳ quét tự động phút (mặc định 5)
  autoAlertEmail: boolean;
  autoAlertTelegram: boolean;
}

export interface ProductCategory {
  code: string;
  name: string;
  description: string;
}

export interface Product {
  code: string;
  name: string;
  categoryCode: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  stockQty: number;
}

export interface Customer {
  code: string;
  name: string;
  phone: string;
  address: string;
  email: string;
}

export interface Employee {
  code: string;
  fullName: string;
  role: string;
  phone: string;
  email: string;
}
