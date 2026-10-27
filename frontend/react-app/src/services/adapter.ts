import type {
  BackendInvoiceDTO,
  GoodsReceiptDTO,
  PurchaseOrderDTO,
  SupplierDTO,
} from './api.ts';
import type {
  AnomalyItem,
  AuditLog,
  BoundingBox,
  GoodsReceipt,
  InvoiceHeader,
  InvoiceRecord,
  LineItem,
  ProcessingStatus,
  PurchaseOrder,
  SupplierMaster,
} from '../types/index.ts';
import { normalizeVietnamese } from '../utils/matchingEngine.ts';

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mapBackendStatusToLegacy(status: string): ProcessingStatus {
  switch (status?.toLowerCase()) {
    case 'matched':
      return 'MATCHED';
    case 'approved':
      return 'APPROVED';
    case 'mismatch':
      return 'MISMATCH';
    case 'needs_review':
      return 'NEED_CONFIRM';
    case 'reviewed':
      return 'OCR_REVIEWED';
    case 'ocr_done':
      return 'OCR_DONE';
    case 'archived':
      return 'ARCHIVED';
    case 'rejected':
      return 'REJECTED';
    case 'waiting':
      return 'WAITING';
    default:
      return 'WAITING';
  }
}

export function adaptBackendInvoices(
  backendInvoices: BackendInvoiceDTO[] = [],
  suppliers: SupplierDTO[] = [],
  purchaseOrders: PurchaseOrderDTO[] = [],
  goodsReceipts: GoodsReceiptDTO[] = [],
): InvoiceRecord[] {
  if (!backendInvoices || backendInvoices.length === 0) {
    return [];
  }

  return backendInvoices.map((dto) => {
    const wasReceivedFromInbox = dto.warnings?.some((warning) => warning.code === 'INBOX_SCAN');
    const legacyStatus = dto.status?.toLowerCase() === 'needs_review' && wasReceivedFromInbox
      ? 'OCR_PENDING'
      : mapBackendStatusToLegacy(dto.status);
    const seller = suppliers.find((s) => s.tax_code === dto.seller_tax_code);
    const ocrText = dto.ocr_text || '';
    const extract = (text: string, expression: RegExp) => text.match(expression)?.[1]?.trim() || '';
    const buyerSection = ocrText.split(/(?:người mua hàng|buyer)\s*[:：]?/i).slice(1).join('\n');
    let sellerName = dto.seller_name || seller?.name || '';
    if (!sellerName && dto.ocr_text) {
      const match = dto.ocr_text.match(/Đơn vị bán hàng:\s*([^\n]+)/i);
      if (match) sellerName = match[1].trim();
    }
    const grandTotal = dto.total_amount;
    const subTotal = dto.subtotal_amount;
    const vatAmount = dto.tax_amount;
    const invCode = dto.invoice_number
      ? `INV-2026-${dto.invoice_number.slice(-4)}`
      : `INV-2026-${String(dto.id).padStart(4, '0')}`;

    const ocrConf = dto.ocr_confidence == null ? null : Math.round(dto.ocr_confidence * 100);

    const seriesMatch = dto.ocr_text?.match(/Ký hiệu:\s*([^\n]+)/i);
    const invoiceSeries = dto.invoice_series || (seriesMatch ? seriesMatch[1].trim() : '');
    const sellerAddress = seller?.address || extract(ocrText, /(?:Địa chỉ|Address)\s*[:：]\s*([^\n]+)/i);
    const buyerName = extract(buyerSection, /(?:Tên đơn vị|Tên người mua|Company(?:'s)? name)\s*[:：]\s*([^\n]+)/i);
    const buyerAddress = extract(buyerSection, /(?:Địa chỉ|Address)\s*[:：]\s*([^\n]+)/i);
    const paymentMethod = extract(ocrText, /(?:Hình thức thanh toán|Payment method)\s*[:：]\s*([^\n]+)/i);
    const purchaseOrder = purchaseOrders.find((po) => po.po_number === dto.po_number);
    const linkedReceipts = goodsReceipts.filter((receipt) => receipt.po_number === dto.po_number);

    const header: InvoiceHeader = {
      invoiceCode: invCode,
      invoiceNumber: dto.invoice_number || '',
      invoiceSeries,
      issueDate: dto.invoice_date || dto.created_at?.slice(0, 10) || '',
      sellerName,
      sellerTaxCode: dto.seller_tax_code || '',
      sellerAddress,
      buyerName,
      buyerTaxCode: dto.buyer_tax_code || '',
      buyerAddress,
      poCode: dto.po_number || '',
      grCode: linkedReceipts.map((receipt) => receipt.receipt_number).join(', '),
      paymentMethod,
      subTotal,
      vatAmount,
      grandTotal,
      qrCodeData: '',
      taxStatus: 'UNKNOWN',
      ocrAverageConfidence: ocrConf,
    };

    const anomalies: AnomalyItem[] = (dto.warnings || []).map((w, wIdx) => ({
      id: `anom-${dto.id}-${wIdx}`,
      type: (w.code as AnomalyItem['type']) || 'PRICE_MISMATCH',
      severity: dto.status === 'mismatch' ? 'CRITICAL' : 'WARNING',
      title: w.message || 'Cảnh báo đối soát',
      description: w.message || 'Phát hiện sai lệch giữa Hóa đơn và PO/GR',
    }));

    const lineItems: LineItem[] = dto.items.length > 0
      ? dto.items.map((item, itemIdx) => {
          const qtyInv = asNumberOrNull(item.quantity);
          const priceInv = asNumberOrNull(item.unit_price);
          const amountFromOcr = asNumberOrNull(item.amount);
          const amtInv = amountFromOcr ?? (qtyInv != null && priceInv != null ? qtyInv * priceInv : null);
          const itemName = String(item.name || item.description || '');
          const normalizedItemName = normalizeVietnamese(itemName);
          const poLine = purchaseOrder?.lines.find((line) =>
            normalizeVietnamese(String(line.name || line.item_name || '')) === normalizedItemName,
          );
          const receiptLines = linkedReceipts.flatMap((receipt) => receipt.lines).filter((line) =>
            normalizeVietnamese(String(line.name || line.item_name || '')) === normalizedItemName,
          );
          const quantityReceived = receiptLines.length > 0
            ? receiptLines.reduce((total, line) => total + (asNumberOrNull(line.quantity) ?? 0), 0)
            : null;
          const poName = poLine ? String(poLine.name || poLine.item_name || '') : '';
          const poPrice = poLine ? asNumberOrNull(poLine.unit_price) : null;
          const quantityOrdered = poLine ? asNumberOrNull(poLine.quantity) : null;
          return {
            id: `line-${dto.id}-${itemIdx + 1}`,
            lineNo: itemIdx + 1,
            itemNameInvoice: itemName,
            itemNamePO: poName,
            unit: String(item.unit || poLine?.unit || ''),
            quantityInvoice: qtyInv,
            quantityPO: quantityOrdered,
            quantityGR: quantityReceived,
            unitPriceInvoice: priceInv,
            unitPricePO: poPrice,
            vatRate: asNumberOrNull(item.tax_rate),
            amountInvoice: amtInv,
            fuzzyScore: itemName && poName ? 100 : 0,
            isQuantityMismatch: false,
            isPriceMismatch: false,
            isMathMismatch: false,
            isFuzzyMismatch: false,
            ocrConfidence: null,
          };
        })
      : [];

    const auditLogs: AuditLog[] = [];

    const boundingBoxes: BoundingBox[] = Array.isArray(dto.ocr_blocks)
      ? (dto.ocr_blocks as Array<Record<string, unknown>>).map((b, idx) => ({
          id: `box-${invCode}-${idx}`,
          fieldKey: String(b?.field || `block_${idx}`),
          x: typeof b?.x === 'number' ? b.x : 0,
          y: typeof b?.y === 'number' ? b.y : 0,
          width: typeof b?.width === 'number' ? b.width : 0,
          height: typeof b?.height === 'number' ? b.height : 0,
          text: String(b?.text || ''),
          confidence: typeof b?.confidence === 'number' ? b.confidence : 90,
        }))
      : [];

    return {
      id: String(dto.id),
      code: invCode,
      fileName: dto.original_name || `invoice_${dto.id}.pdf`,
      fileSizeKb: 0,
      fileSha256: '',
      status: legacyStatus,
      header,
      lineItems,
      anomalies,
      auditLogs,
      boundingBoxes,
      ocrConfidenceMap: {
        // The API currently exposes one whole-invoice confidence, not per-field scores.
      },
      receivedAt: dto.created_at?.slice(0, 16).replace('T', ' ') || '',
      approvalNote: dto.review_note || undefined,
    };
  });
}

export function adaptBackendSuppliers(
  suppliers: SupplierDTO[] = []
): SupplierMaster[] {
  if (!suppliers || suppliers.length === 0) {
    return [];
  }
  return suppliers.map((s, idx) => ({
    code: s.supplier_code || `NCC-${String(idx + 1).padStart(2, '0')}`,
    name: s.name,
    taxCode: s.tax_code,
    address: s.address,
    phone: s.phone,
    email: s.email,
    legalStatus: 'UNKNOWN',
    anchorKeywords: [s.name.split(' ')[0]],
    totalInvoicesReceived: 0,
    mismatchRate: 0,
  }));
}

export function adaptBackendPurchaseOrders(
  pos: PurchaseOrderDTO[] = [],
  suppliers: SupplierDTO[] = [],
): PurchaseOrder[] {
  if (!pos || pos.length === 0) {
    return [];
  }
  return pos.map((po) => ({
    code: po.po_number,
    supplierName: po.supplier_name || suppliers.find((supplier) => supplier.tax_code === po.supplier_tax_code)?.name || '',
    supplierTaxCode: po.supplier_tax_code,
    orderDate: po.order_date || '',
    expectedDeliveryDate: po.expected_delivery_date || '',
    totalEstimatedAmount: po.total_amount,
    status: po.status === 'fulfilled' ? 'FULFILLED'
      : po.status === 'partially_delivered' ? 'PARTIALLY_DELIVERED'
        : po.status === 'cancelled' ? 'CANCELLED' : 'PENDING',
    createdBy: po.created_by || '',
    employeeCode: po.employee_code || '',
    items: (po.lines || []).map((line, lIdx) => ({
      lineNo: lIdx + 1,
      itemName: String(line.item_name || line.name || ''),
      unit: String(line.unit || ''),
      quantity: line.quantity == null ? 0 : Number(line.quantity),
      unitPrice: line.unit_price == null ? 0 : Number(line.unit_price),
      amount: line.amount != null
        ? Number(line.amount)
        : line.quantity != null && line.unit_price != null
          ? Number(line.quantity) * Number(line.unit_price) : 0,
    })),
  }));
}

export function adaptBackendGoodsReceipts(
  grs: GoodsReceiptDTO[] = []
): GoodsReceipt[] {
  if (!grs || grs.length === 0) {
    return [];
  }
  return grs.map((gr) => ({
    code: gr.receipt_number,
    poCode: gr.po_number,
    supplierName: gr.supplier_name || '',
    receiptDate: gr.received_at?.slice(0, 10) || '',
    receivedBy: gr.received_by || '',
    warehouseLocation: gr.warehouse_location || '',
    items: (gr.lines || []).map((line, lIdx) => ({
      lineNo: lIdx + 1,
      itemName: String(line.item_name || line.name || ''),
      unit: String(line.unit || ''),
      quantityReceived: line.quantity == null ? 0 : Number(line.quantity),
      notes: String(line.notes || ''),
    })),
  }));
}

