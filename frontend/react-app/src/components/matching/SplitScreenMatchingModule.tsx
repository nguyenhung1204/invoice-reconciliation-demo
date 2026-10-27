import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Save,
  ShieldCheck,
  XCircle,
  Clock,
  History,
  FileText,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Info,
  Building,
  Calendar,
  Layers,
} from 'lucide-react';
import { InvoiceRecord, UserProfile } from '../../types/index.ts';
import { InvoiceDocumentViewer } from './InvoiceDocumentViewer.tsx';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { mockActions, store } from '../../services/api.ts';

interface SplitScreenMatchingModuleProps {
  invoices: InvoiceRecord[];
  selectedInvoiceCode: string;
  onSelectInvoice: (code: string) => void;
  currentUser: UserProfile;
}

export const SplitScreenMatchingModule: React.FC<SplitScreenMatchingModuleProps> = ({
  invoices,
  selectedInvoiceCode,
  onSelectInvoice,
  currentUser,
}) => {
  const currentInvoice =
    invoices.find((i) => i.code === selectedInvoiceCode) || invoices[0];

  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [editReason, setEditReason] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lineNameDrafts, setLineNameDrafts] = useState<Record<number, string>>({});
  const [isSavingAction, setIsSavingAction] = useState(false);

  // Local state cho các trường Header chỉnh sửa
  const [headerForm, setHeaderForm] = useState({
    invoiceNumber: currentInvoice?.header?.invoiceNumber || '',
    invoiceSeries: currentInvoice?.header?.invoiceSeries || '',
    issueDate: currentInvoice?.header?.issueDate || '',
    sellerTaxCode: currentInvoice?.header?.sellerTaxCode || '',
    sellerName: currentInvoice?.header?.sellerName || '',
    poCode: currentInvoice?.header?.poCode || '',
  });

  // Đồng bộ form khi đổi hóa đơn
  React.useEffect(() => {
    if (!currentInvoice) return;
    setHeaderForm({
      invoiceNumber: currentInvoice.header.invoiceNumber,
      invoiceSeries: currentInvoice.header.invoiceSeries,
      issueDate: currentInvoice.header.issueDate,
      sellerTaxCode: currentInvoice.header.sellerTaxCode,
      sellerName: currentInvoice.header.sellerName,
      poCode: currentInvoice.header.poCode,
    });
    setEditReason('');
    setLineNameDrafts({});
    setFeedbackMessage(null);
  }, [currentInvoice?.code]);

  if (!currentInvoice) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
        <FileText className="mx-auto h-16 w-16 text-slate-300 mb-3" />
        <h2 className="text-base font-bold text-slate-800">Không tìm thấy hóa đơn nào để đối soát</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Hiện chưa có hóa đơn nào trong hệ thống. Vui lòng nạp tệp hóa đơn mới từ phân hệ Tiếp nhận hóa đơn.
        </p>
      </div>
    );
  }

  const currentIndex = invoices.findIndex((i) => i.code === currentInvoice.code);
  const handlePrev = () => {
    if (currentIndex > 0) onSelectInvoice(invoices[currentIndex - 1].code);
  };
  const handleNext = () => {
    if (currentIndex < invoices.length - 1) onSelectInvoice(invoices[currentIndex + 1].code);
  };

  // Cập nhật giá trị trường Header
  const handleHeaderChange = (field: keyof typeof headerForm, value: string) => {
    setHeaderForm((prev) => ({ ...prev, [field]: value }));
    setSelectedFieldKey(field);
  };

  // Cập nhật giá trị dòng hàng inline
  const handleLineItemChange = (
    lineNo: number,
    value: string
  ) => {
    setLineNameDrafts((previous) => ({ ...previous, [lineNo]: value }));
  };

  // Lưu chỉnh sửa Header & Chạy lại đối soát
  const handleSaveHeaderAndRecalculate = async () => {
    if (isSavingAction) return;
    setIsSavingAction(true);
    setFeedbackMessage(null);
    try {
      const saved = await store.saveInvoiceReviewAndReconcile(currentInvoice.code, {
        header: headerForm,
        lineNameUpdates: lineNameDrafts,
        note: editReason || 'Kế toán viên hiệu chỉnh thông tin hóa đơn',
      });
      setLineNameDrafts({});
      setFeedbackMessage({
        type: 'success',
        text: saved.status === 'MATCHED'
          ? 'Đã lưu dữ liệu vào MySQL và đối soát khớp.'
          : 'Đã lưu dữ liệu vào MySQL và chạy đối soát. Hệ thống đang hiển thị các sai lệch cần xử lý.',
      });
    } catch (error) {
      setFeedbackMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể lưu và đối soát hóa đơn.',
      });
    } finally {
      setIsSavingAction(false);
    }
  };

  // Phê duyệt thanh toán
  const handleApprove = async () => {
    if (isSavingAction) return;
    setIsSavingAction(true);
    setFeedbackMessage(null);
    try {
      await mockActions.verifyInvoice(currentInvoice.code, 'APPROVE', {
        note: editReason || 'Kế toán trưởng phê duyệt hạch toán thanh toán.',
      });
      setFeedbackMessage({ type: 'success', text: `Hóa đơn ${currentInvoice.code} đã được phê duyệt trên máy chủ.` });
    } catch (error) {
      setFeedbackMessage({ type: 'error', text: error instanceof Error ? error.message : 'Không thể phê duyệt hóa đơn.' });
    } finally {
      setIsSavingAction(false);
    }
  };

  // Từ chối hóa đơn
  const handleReject = async () => {
    if (!editReason) {
      setFeedbackMessage({
        type: 'error',
        text: 'Vui lòng nhập lý do từ chối vào ô Ghi chú trước khi bấm Từ chối.',
      });
      setTimeout(() => setFeedbackMessage(null), 3500);
      return;
    }
    if (isSavingAction) return;
    setIsSavingAction(true);
    setFeedbackMessage(null);
    try {
      await mockActions.verifyInvoice(currentInvoice.code, 'REJECT', { note: editReason });
      setFeedbackMessage({ type: 'success', text: `Hóa đơn ${currentInvoice.code} đã được từ chối và lưu trên máy chủ.` });
    } catch (error) {
      setFeedbackMessage({ type: 'error', text: error instanceof Error ? error.message : 'Không thể từ chối hóa đơn.' });
    } finally {
      setIsSavingAction(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Thanh điều hướng nhanh giữa các Hóa đơn */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Hóa đơn trước"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-mono font-bold text-sm text-slate-900">
              {currentInvoice.code}
            </span>
            <button
              onClick={handleNext}
              disabled={currentIndex === invoices.length - 1}
              className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Hóa đơn tiếp theo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Quick Dropdown Picker */}
          <select
            value={currentInvoice.code}
            onChange={(e) => onSelectInvoice(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 font-medium focus:border-blue-500 focus:outline-none bg-white cursor-pointer"
          >
            {invoices.map((inv) => (
              <option key={inv.code} value={inv.code}>
                {inv.code} - {inv.header.sellerName.substring(0, 32)}... ({inv.status})
              </option>
            ))}
          </select>
        </div>

        {/* Trạng thái hiện tại */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Trạng thái:</span>
          {currentInvoice.status === 'APPROVED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã phê duyệt
            </span>
          )}
          {currentInvoice.status === 'MATCHED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đối soát khớp
            </span>
          )}
          {currentInvoice.status === 'MISMATCH' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5" /> Phát hiện sai lệch ({currentInvoice.anomalies.length})
            </span>
          )}
          {currentInvoice.status === 'NEED_CONFIRM' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">
              <Clock className="h-3.5 w-3.5" /> Cần xác nhận thủ công
            </span>
          )}
          {currentInvoice.status === 'OCR_REVIEWED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 font-bold text-blue-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã rà soát OCR
            </span>
          )}
          {currentInvoice.status === 'REJECTED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 font-bold text-slate-700">
              <XCircle className="h-3.5 w-3.5" /> Đã từ chối
            </span>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`rounded-xl border p-3 text-xs flex items-center justify-between animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="font-bold hover:opacity-75 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* BỐ CỤC CHIA ĐÔI MÀN HÌNH TỶ LỆ 50% - 50% (SPLIT-SCREEN WORKSPACE) */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* NỬA TRÁI (50%): TRÌNH XEM HÓA ĐƠN GỐC & BOUNDING BOX OCR */}
        <div className="h-[880px]">
          <InvoiceDocumentViewer
            invoice={currentInvoice}
            selectedFieldKey={selectedFieldKey}
            onSelectField={(key) => setSelectedFieldKey(key)}
          />
        </div>

        {/* NỬA PHẢI (50%): FORM CHUẨN HÓA, BẢNG ĐỐI SOÁT 3 BÊN & LƯU VẾT KIỂM TOÁN */}
        <div className="h-[880px] overflow-y-auto space-y-4 pr-1">
          {/* KHUNG CẢNH BÁO BẤT THƯỜNG (ANOMALY BANNER) */}
          {currentInvoice.anomalies.length > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-4 shadow-xs">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wider mb-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Phát hiện {currentInvoice.anomalies.length} bất thường cần kế toán xử lý
              </div>
              <div className="space-y-2">
                {currentInvoice.anomalies.map((anom) => (
                  <div
                    key={anom.id}
                    onClick={() => anom.fieldKey && setSelectedFieldKey(anom.fieldKey)}
                    className="rounded-lg bg-white p-3 border border-rose-200 text-xs shadow-2xs cursor-pointer hover:border-rose-400 transition-colors"
                  >
                    <div className="font-bold text-rose-800 flex items-center justify-between">
                      <span>{anom.title}</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                        {anom.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700 text-[11px] leading-relaxed">
                      {anom.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PHẦN 1: ĐỐI CHIẾU THÔNG TIN CHUNG (HEADER MATCHING) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                Phần 1: Đối Chiếu Thông Tin Chung (Header Matching)
              </h2>
              <span className="text-[11px] text-slate-400">
                Cho phép sửa trực tiếp & lưu vết
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Số hóa đơn */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-num">Số Hóa Đơn (OCR):</label>
                  <span className="text-emerald-700 font-mono text-[10px] font-bold">
                    OCR: {currentInvoice.ocrConfidenceMap['invoiceNumber'] || 99}%
                  </span>
                </div>
                <input
                  id="hdr-inv-num"
                  type="text"
                  value={headerForm.invoiceNumber}
                  onFocus={() => setSelectedFieldKey('invoiceNumber')}
                  onChange={(e) => handleHeaderChange('invoiceNumber', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Ký hiệu hóa đơn */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-series">Ký hiệu mẫu số (Series):</label>
                  <span className="text-emerald-700 font-mono text-[10px] font-bold">
                    OCR: {currentInvoice.ocrConfidenceMap['invoiceSeries'] || 98}%
                  </span>
                </div>
                <input
                  id="hdr-inv-series"
                  type="text"
                  value={headerForm.invoiceSeries}
                  onFocus={() => setSelectedFieldKey('invoiceSeries')}
                  onChange={(e) => handleHeaderChange('invoiceSeries', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Ngày hóa đơn */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-date">Ngày lập hóa đơn:</label>
                  <span className="text-emerald-700 font-mono text-[10px] font-bold">
                    Chuẩn YYYY-MM-DD
                  </span>
                </div>
                <input
                  id="hdr-inv-date"
                  type="date"
                  value={headerForm.issueDate}
                  onFocus={() => setSelectedFieldKey('issueDate')}
                  onChange={(e) => handleHeaderChange('issueDate', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Mã PO tham chiếu */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-po">Đơn hàng PO tham chiếu:</label>
                  <span className="text-blue-700 font-mono text-[10px] font-bold">
                    Hợp đồng gốc
                  </span>
                </div>
                <input
                  id="hdr-inv-po"
                  type="text"
                  value={headerForm.poCode}
                  onChange={(e) => handleHeaderChange('poCode', e.target.value)}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50/50 px-2.5 py-1.5 font-mono font-bold text-blue-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* MST Nhà cung cấp */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-mst">Mã số thuế Bên bán (NCC):</label>
                  <span className="text-emerald-700 font-mono text-[10px] font-bold">
                    10 Chữ số
                  </span>
                </div>
                <input
                  id="hdr-inv-mst"
                  type="text"
                  value={headerForm.sellerTaxCode}
                  onFocus={() => setSelectedFieldKey('sellerTaxCode')}
                  onChange={(e) => handleHeaderChange('sellerTaxCode', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Tên nhà cung cấp */}
              <div>
                <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1">
                  <label htmlFor="hdr-inv-seller">Tên Nhà cung cấp:</label>
                </div>
                <input
                  id="hdr-inv-seller"
                  type="text"
                  value={headerForm.sellerName}
                  onFocus={() => setSelectedFieldKey('sellerName')}
                  onChange={(e) => handleHeaderChange('sellerName', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* PHẦN 2: BẢNG ĐỐI SOÁT CHI TIẾT MẶT HÀNG 3 BÊN (LINE-ITEM 3-WAY MATCHING) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-600" />
                Phần 2: Bảng Đối Soát 3 Bên Chi Tiết Mặt Hàng (Line-Item 3-Way)
              </h2>
              <span className="text-[11px] text-slate-400">
                Thuật toán Levenshtein & So khớp 3 bên
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-semibold">
                  <tr className="border-b border-slate-200">
                    <th className="p-2 text-center w-8">#</th>
                    <th className="p-2 min-w-[200px]">Mặt hàng (HĐ vs PO)</th>
                    <th className="p-2 text-center">Fuzzy %</th>
                    <th className="p-2 text-center">
                      Số lượng
                      <div className="text-[9px] font-normal text-slate-400">HĐ | PO | GR</div>
                    </th>
                    <th className="p-2 text-right">
                      Đơn giá
                      <div className="text-[9px] font-normal text-slate-400">HĐ vs PO</div>
                    </th>
                    <th className="p-2 text-right">Thành tiền HĐ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentInvoice.lineItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedFieldKey(`lineItem_${item.lineNo}`)}
                      className={`cursor-pointer transition-colors ${
                        item.isPriceMismatch || item.isQuantityMismatch || item.isMathMismatch
                          ? 'bg-rose-50/70 hover:bg-rose-100/60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-2 text-center font-bold text-slate-700">
                        {item.lineNo}
                      </td>
                      <td className="p-2">
                        {/* Tên hóa đơn OCR (cho phép sửa inline) */}
                        <div className="text-[11px] font-medium text-slate-900">
                          <input
                            type="text"
                            value={lineNameDrafts[item.lineNo] ?? item.itemNameInvoice}
                            onChange={(e) =>
                              handleLineItemChange(item.lineNo, e.target.value)
                            }
                            className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                            title="Sửa tên trích xuất OCR"
                          />
                        </div>
                        {/* Tên chuẩn trong PO */}
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                          <span className="font-semibold text-blue-700">PO:</span> {item.itemNamePO}
                        </div>
                      </td>

                      {/* Fuzzy Levenshtein Score */}
                      <td className="p-2 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.fuzzyScore >= 90
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.fuzzyScore >= 80
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.fuzzyScore}%
                        </span>
                      </td>

                      {/* Đối chiếu Số lượng 3 bên (HĐ - PO - GR) */}
                      <td className="p-2 text-center">
                        <div
                          className={`inline-flex items-center gap-1 font-mono font-bold px-1.5 py-0.5 rounded ${
                            item.isQuantityMismatch
                              ? 'bg-rose-200 text-rose-900 ring-1 ring-rose-400'
                              : 'text-slate-800'
                          }`}
                        >
                          <span>{item.quantityInvoice}</span>
                          <span className="text-slate-400">|</span>
                          <span className="text-blue-700">{item.quantityPO}</span>
                          <span className="text-slate-400">|</span>
                          <span className="text-emerald-700">{item.quantityGR}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{item.unit}</div>
                      </td>

                      {/* Đối chiếu Đơn giá (HĐ vs PO) */}
                      <td className="p-2 text-right">
                        <div
                          className={`font-mono font-bold ${
                            item.isPriceMismatch
                              ? 'text-rose-700 bg-rose-100 px-1 rounded inline-block'
                              : 'text-slate-900'
                          }`}
                        >
                          {formatCurrencyVND(item.unitPriceInvoice).replace(' đ', '')}
                        </div>
                        <div className="text-[10px] text-blue-700 font-mono">
                          PO: {formatCurrencyVND(item.unitPricePO).replace(' đ', '')}
                        </div>
                      </td>

                      {/* Thành tiền & Kiểm tra nhân chéo */}
                      <td className="p-2 text-right">
                        <div
                          className={`font-mono font-bold ${
                            item.isMathMismatch ? 'text-rose-700 underline' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrencyVND(item.amountInvoice)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Thuế: {item.vatRate}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PHẦN 3: KIỂM TRA TỔNG TIỀN & TOÁN HỌC NỘI TẠI (FOOTER MATH VALIDATION) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Phần 3: Kiểm Tra Toán Học & Đối Soát Tổng Tiền Chân Trang
              </h2>
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Dung sai cho phép: ± 10 VNĐ
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                <div className="text-slate-500 text-[11px]">Tiền hàng (Subtotal):</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5 text-sm">
                  {formatCurrencyVND(currentInvoice.header.subTotal)}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                <div className="text-slate-500 text-[11px]">Tiền thuế GTGT:</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5 text-sm">
                  {formatCurrencyVND(currentInvoice.header.vatAmount)}
                </div>
              </div>

              <div className="rounded-lg bg-blue-50/70 p-2.5 border border-blue-200">
                <div className="text-blue-700 text-[11px] font-semibold">Tổng thanh toán HĐ:</div>
                <div className="font-mono font-bold text-blue-900 mt-0.5 text-sm">
                  {formatCurrencyVND(currentInvoice.header.grandTotal)}
                </div>
              </div>
            </div>
          </div>

          {/* PHẦN 4: THAO TÁC PHÊ DUYỆT & LỊCH SỬ CHỈNH SỬA (HUMAN-IN-THE-LOOP & AUDIT TRAIL) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Phần 4: Thao Tác Phê Duyệt & Nhật Ký Kiểm Toán (Audit Trail)
              </h2>
              <span className="text-[10px] text-slate-500">
                Đang thao tác: <strong>{currentUser.roleLabel}</strong>
              </span>
            </div>

            {/* Ô ghi chú / lý do hiệu chỉnh */}
            <div>
              <label htmlFor="audit-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Lý do hiệu chỉnh / Ghi chú phê duyệt:
              </label>
              <textarea
                id="audit-reason"
                rows={2}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh hoặc căn cứ phê duyệt (VD: Nhà cung cấp xuất thiếu 5 ram đã có biên bản thỏa thuận)..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Các nút hành động (Phân quyền theo vai trò) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleSaveHeaderAndRecalculate}
                disabled={isSavingAction || currentInvoice.status === 'APPROVED'}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {isSavingAction ? 'Đang lưu...' : 'Lưu chỉnh sửa & Chạy lại đối soát'}
              </button>

              {(currentUser.role === 'CHIEF_ACCOUNTANT' || currentUser.role === 'ADMIN') && <button
                onClick={handleApprove}
                disabled={isSavingAction || currentInvoice.status !== 'MATCHED'}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Xác nhận Khớp / Phê duyệt thanh toán
              </button>}

              {(currentUser.role === 'CHIEF_ACCOUNTANT' || currentUser.role === 'ADMIN') && <button
                onClick={handleReject}
                disabled={isSavingAction || currentInvoice.status === 'APPROVED' || currentInvoice.status === 'REJECTED'}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Từ chối / Yêu cầu xuất lại HĐ
              </button>}
            </div>

            {/* BẢNG LƯU VẾT KIỂM TOÁN (AUDIT LOGS) */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-slate-500" />
                Lịch sử can thiệp thủ công (Audit Logs)
              </div>

              {currentInvoice.auditLogs.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
                  Chưa có lượt can thiệp thủ công nào trên hồ sơ này. Dữ liệu hoàn toàn do RPA & OCR trích xuất tự động.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-semibold">
                      <tr className="border-b border-slate-200">
                        <th className="p-2">Thời gian</th>
                        <th className="p-2">Người thực hiện</th>
                        <th className="p-2">Trường sửa</th>
                        <th className="p-2">Giá trị cũ &rarr; Mới</th>
                        <th className="p-2">Lý do</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentInvoice.auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {log.timestamp}
                          </td>
                          <td className="p-2 font-semibold text-slate-800 whitespace-nowrap">
                            {log.user}
                          </td>
                          <td className="p-2 font-medium text-blue-700">
                            {log.field}
                          </td>
                          <td className="p-2 font-mono text-[11px]">
                            <span className="text-rose-600 line-through mr-1">{log.oldValue}</span>
                            &rarr;
                            <span className="text-emerald-700 font-bold ml-1">{log.newValue}</span>
                          </td>
                          <td className="p-2 text-slate-600 max-w-[200px] truncate" title={log.reason}>
                            {log.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
