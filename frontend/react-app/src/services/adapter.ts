import type {
  BackendInvoiceDTO,
  GoodsReceiptDTO,
  PurchaseOrderDTO,
  SupplierDTO,
  WorkerStatusDTO,
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
  RpaScanLog,
  SupplierMaster,
} from '../types/index.ts';

export function mapBackendStatusToLegacy(status: string): ProcessingStatus {
  switch (status?.toLowerCase()) {
    case 'matched':
    case 'approved':
      return 'MATCHED';
    case 'mismatch':
      return 'MISMATCH';
    case 'needs_review':
    case 'reviewed':
      return 'NEED_CONFIRM';
    case 'ocr_done':
      return 'PADDLE_OCR';
    case 'archived':
      return 'MATCHED';
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
  suppliers: SupplierDTO[] = []
): InvoiceRecord[] {
  if (!backendInvoices || backendInvoices.length === 0) {
    return [];
  }

  return backendInvoices.map((dto) => {
    const legacyStatus = mapBackendStatusToLegacy(dto.status);
    const seller = suppliers.find((s) => s.tax_code === dto.seller_tax_code);
    let sellerName = seller?.name || '';
    if (!sellerName && dto.ocr_text) {
      const match = dto.ocr_text.match(/Đơn vị bán hàng:\s*([^\n]+)/i);
      if (match) sellerName = match[1].trim();
    }
    if (!sellerName) {
      sellerName = dto.original_name ? dto.original_name.replace(/\.[^/.]+$/, '') : 'Nhà cung cấp chưa xác định';
    }

    const grandTotal = dto.total_amount ?? 0;
    const subTotal = grandTotal > 0 ? Math.round(grandTotal / 1.1) : 0;
    const vatAmount = grandTotal - subTotal;
    const invCode = dto.invoice_number
      ? `INV-2026-${dto.invoice_number.slice(-4)}`
      : `INV-2026-${String(dto.id).padStart(4, '0')}`;

    const ocrConf = dto.ocr_confidence ? Math.round(dto.ocr_confidence * 100) : 0;

    const seriesMatch = dto.ocr_text?.match(/Ký hiệu:\s*([^\n]+)/i);
    const invoiceSeries = seriesMatch ? seriesMatch[1].trim() : '1C26TAA';

    const header: InvoiceHeader = {
      invoiceCode: invCode,
      invoiceNumber: dto.invoice_number || `000${dto.id}`,
      invoiceSeries,
      issueDate: dto.invoice_date || dto.created_at?.slice(0, 10) || '',
      sellerName,
      sellerTaxCode: dto.seller_tax_code || '',
      sellerAddress: seller?.email ? `${seller.email} (Việt Nam)` : 'Việt Nam',
      buyerName: dto.buyer_tax_code ? 'CÔNG TY TNHH CÔNG NGHỆ & TỰ ĐỘNG HÓA THÔNG MINH VIỆT NAM' : '',
      buyerTaxCode: dto.buyer_tax_code || '',
      buyerAddress: 'Tầng 8, Tòa nhà Landmark 72, Đường Phạm Hùng, Q. Nam Từ Liêm, Hà Nội',
      poCode: dto.po_number || '',
      grCode: dto.po_number ? dto.po_number.replace('PO-', 'PNK-') : '',
      paymentMethod: 'Chuyển khoản (TM/CK)',
      subTotal,
      vatAmount,
      grandTotal,
      qrCodeData: dto.seller_tax_code && dto.invoice_number
        ? `${dto.seller_tax_code};${invoiceSeries};${dto.invoice_number};${grandTotal};${dto.invoice_date || ''}`
        : '',
      taxStatus: 'ACTIVE',
      ocrAverageConfidence: ocrConf,
    };

    const anomalies: AnomalyItem[] = (dto.warnings || []).map((w, wIdx) => ({
      id: `anom-${dto.id}-${wIdx}`,
      type: (w.code as AnomalyItem['type']) || 'PRICE_MISMATCH',
      severity: dto.status === 'mismatch' ? 'CRITICAL' : 'WARNING',
      title: w.message || 'Cảnh báo đối soát',
      description: w.message || 'Phát hiện sai lệch giữa Hóa đơn và PO/GR',
    }));

    const lineItems: LineItem[] = (dto.items && dto.items.length > 0)
      ? dto.items.map((item, itemIdx) => {
          const qtyInv = Number(item.quantity) || 1;
          const priceInv = Number(item.unit_price) || 0;
          const amtInv = Number(item.amount) || qtyInv * priceInv;
          const itemName = String(item.name || item.description || `Mặt hàng #${itemIdx + 1}`);
          return {
            id: `line-${dto.id}-${itemIdx + 1}`,
            lineNo: itemIdx + 1,
            itemNameInvoice: itemName,
            itemNamePO: itemName,
            unit: String(item.unit || 'Chiếc'),
            quantityInvoice: qtyInv,
            quantityPO: qtyInv,
            quantityGR: qtyInv,
            unitPriceInvoice: priceInv,
            unitPricePO: priceInv,
            vatRate: 10,
            amountInvoice: amtInv,
            fuzzyScore: 100,
            isQuantityMismatch: false,
            isPriceMismatch: false,
            isMathMismatch: false,
            isFuzzyMismatch: false,
            ocrConfidence: ocrConf > 0 ? ocrConf : 95,
          };
        })
      : grandTotal > 0
      ? [
          {
            id: `line-${dto.id}-1`,
            lineNo: 1,
            itemNameInvoice: sellerName,
            itemNamePO: sellerName,
            unit: 'Gói',
            quantityInvoice: 1,
            quantityPO: 1,
            quantityGR: 1,
            unitPriceInvoice: grandTotal,
            unitPricePO: grandTotal,
            vatRate: 10,
            amountInvoice: grandTotal,
            fuzzyScore: 100,
            isQuantityMismatch: false,
            isPriceMismatch: false,
            isMathMismatch: false,
            isFuzzyMismatch: false,
            ocrConfidence: ocrConf > 0 ? ocrConf : 95,
          },
        ]
      : [];

    const auditLogs: AuditLog[] = [
      {
        id: `audit-${dto.id}-init`,
        invoiceCode: invCode,
        timestamp: dto.created_at?.slice(0, 19).replace('T', ' ') || '',
        user: 'Hệ thống Tiếp nhận',
        userRole: 'ACCOUNTANT',
        field: 'Tiếp nhận hồ sơ',
        oldValue: 'TRỐNG',
        newValue: 'ĐÃ NẠP TÀI LIỆU',
        reason: `Đã nạp ${dto.original_name} từ thư mục SMB / Tải lên`,
      },
    ];

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
      fileSizeKb: 240,
      fileSha256: '',
      status: legacyStatus,
      header,
      lineItems,
      anomalies,
      auditLogs,
      boundingBoxes,
      ocrConfidenceMap: {
        invoiceNumber: ocrConf,
        invoiceSeries: ocrConf,
        issueDate: ocrConf,
        sellerName: ocrConf,
        sellerTaxCode: ocrConf,
        grandTotal: ocrConf,
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
    code: `NCC-${String(idx + 1).padStart(2, '0')}`,
    name: s.name,
    taxCode: s.tax_code,
    address: s.email ? `${s.email} (Việt Nam)` : 'Việt Nam',
    legalStatus: 'ACTIVE',
    anchorKeywords: [s.name.split(' ')[0]],
    totalInvoicesReceived: 0,
    mismatchRate: 0,
  }));
}

export function adaptBackendPurchaseOrders(
  pos: PurchaseOrderDTO[] = []
): PurchaseOrder[] {
  if (!pos || pos.length === 0) {
    return [];
  }
  return pos.map((po, idx) => ({
    code: po.po_number || `PO-2026-${String(idx + 1).padStart(4, '0')}`,
    supplierName: po.supplier_tax_code,
    supplierTaxCode: po.supplier_tax_code,
    orderDate: '2026-03-15',
    expectedDeliveryDate: '2026-03-25',
    totalEstimatedAmount: po.total_amount,
    status: (po.status as PurchaseOrder['status']) || 'PENDING',
    createdBy: 'Hệ thống ERP',
    items: (po.lines || []).map((line, lIdx) => ({
      lineNo: lIdx + 1,
      itemName: String(line.item_name || line.name || `Hàng PO #${lIdx + 1}`),
      unit: String(line.unit || 'Chiếc'),
      quantity: Number(line.quantity) || 1,
      unitPrice: Number(line.unit_price) || 0,
      amount: Number(line.amount) || ((Number(line.quantity) || 1) * (Number(line.unit_price) || 0)),
    })),
  }));
}

export function adaptBackendGoodsReceipts(
  grs: GoodsReceiptDTO[] = []
): GoodsReceipt[] {
  if (!grs || grs.length === 0) {
    return [];
  }
  return grs.map((gr, idx) => ({
    code: gr.receipt_number || `PNK-2026-${String(idx + 1).padStart(4, '0')}`,
    poCode: gr.po_number || `PO-2026-${String(idx + 1).padStart(4, '0')}`,
    supplierName: 'Nhà cung cấp',
    receiptDate: gr.received_at?.slice(0, 10) || '2026-03-18',
    receivedBy: 'Thủ kho',
    warehouseLocation: 'Kho Tổng',
    items: (gr.lines || []).map((line, lIdx) => ({
      lineNo: lIdx + 1,
      itemName: String(line.item_name || line.name || `Hàng GR #${lIdx + 1}`),
      unit: String(line.unit || 'Chiếc'),
      quantityReceived: Number(line.quantity) || 1,
    })),
  }));
}

export function adaptRpaLogs(worker: WorkerStatusDTO | null): RpaScanLog[] {
  if (!worker || !worker.message) {
    return [];
  }
  return [
    {
      id: `rpa-live-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      source: 'SHARED_FOLDER_SMB',
      fileName: 'scan_inbox_monitor',
      status: worker.active ? 'ACCEPTED' : 'REJECTED_NON_INVOICE',
      fileHash: '',
      reason: worker.message,
    },
  ];
}

