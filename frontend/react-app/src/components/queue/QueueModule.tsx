import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  FileUp,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ClipboardCheck,
  Layers,
  Info,
  LoaderCircle,
  X,
} from 'lucide-react';
import { InvoiceRecord, ProcessingStatus } from '../../types/index.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { api, mockActions, store } from '../../services/api.ts';
import { OcrReviewWorkspace } from './OcrReviewWorkspace.tsx';

interface QueueModuleProps {
  invoices: InvoiceRecord[];
  canScan: boolean;
  onSelectInvoice: (code: string) => void;
  onNavigateToMatching: () => void;
}

type QueueNotice = {
  tone: 'success' | 'warning' | 'error' | 'info';
  message: string;
};

export const QueueModule: React.FC<QueueModuleProps> = ({
  invoices,
  canScan,
  onSelectInvoice,
  onNavigateToMatching,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [retryingInvoiceCode, setRetryingInvoiceCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<QueueNotice | null>(null);
  const [reviewInvoiceCode, setReviewInvoiceCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = isUploading || isScanning || retryingInvoiceCode !== null;

  useEffect(() => {
    if (!notice || notice.tone === 'info') return;
    const timeout = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const invoiceToReview = reviewInvoiceCode
    ? invoices.find((invoice) => invoice.code === reviewInvoiceCode)
    : undefined;

  // Lọc danh sách hóa đơn
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.code.toLocaleLowerCase().includes(normalizedSearch) ||
      inv.header.invoiceNumber.toLocaleLowerCase().includes(normalizedSearch) ||
      inv.header.sellerName.toLocaleLowerCase().includes(normalizedSearch) ||
      inv.header.sellerTaxCode.includes(searchTerm.trim()) ||
      inv.header.poCode.toLocaleLowerCase().includes(normalizedSearch);

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PROCESSING') {
      return (
        inv.status === 'WAITING' ||
        inv.status === 'OPENCV_PREPROCESS' ||
        inv.status === 'PADDLE_OCR' ||
        inv.status === 'MATCHING'
      );
    }
    return inv.status === statusFilter;
  });

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0 || isBusy) return;
    const selectedFiles = Array.from(files);
    setIsUploading(true);
    setNotice({
      tone: 'info',
      message: `Đang tải ${selectedFiles.length} tệp và chạy OCR. Quá trình có thể mất một lúc với PDF nhiều trang.`,
    });

    try {
      const fileList = selectedFiles.map((f) => ({
      name: f.name,
      size: f.size,
      file: f,
      }));
      const result = await mockActions.uploadInvoices(fileList);
      if (result.errors.length > 0) {
        setNotice({
          tone: result.uploadedCount > 0 ? 'warning' : 'error',
          message: `Đã tải ${result.uploadedCount}/${fileList.length} tệp. ${result.errors.join('; ')}`,
        });
      } else if (result.ocrNeedsReviewCount > 0) {
        setNotice({
          tone: 'warning',
          message: `Đã tải ${result.uploadedCount} hóa đơn. ${result.ocrNeedsReviewCount} hóa đơn cần rà soát thủ công vì OCR có thể chưa đủ tin cậy.`,
        });
      } else {
        setNotice({
          tone: 'success',
          message: `Đã tải và chạy OCR cho ${result.uploadedCount} hóa đơn. Hãy rà soát dữ liệu trước khi đối chiếu.`,
        });
      }
    } catch (error: unknown) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Không tải được hóa đơn.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (reviewInvoiceCode && invoiceToReview) {
    return <OcrReviewWorkspace invoice={invoiceToReview} onBack={() => setReviewInvoiceCode(null)} />;
  }

  const handleTriggerScan = async () => {
    if (isBusy) return;
    setIsScanning(true);
    try {
      const res = await mockActions.triggerRpaScan();
      setNotice({ tone: res.status, message: res.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleRetryOcr = async (invoice: InvoiceRecord) => {
    if (isBusy) return;
    setRetryingInvoiceCode(invoice.code);
    setNotice({ tone: 'info', message: `Đang chạy OCR cho ${invoice.fileName}...` });
    try {
      const result = await api.retryInvoiceOcr(Number(invoice.id));
      await store.syncWithBackend();
      setNotice(result.status === 'ocr_done'
        ? { tone: 'success', message: `Đã chạy OCR cho ${invoice.fileName}. Hãy rà soát các trường trước khi đối chiếu.` }
        : { tone: 'warning', message: `OCR đã chạy cho ${invoice.fileName}, nhưng cần rà soát thủ công. ${result.warnings.map((warning) => warning.message).filter(Boolean).join('; ')}` });
    } catch (error: unknown) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : `Không chạy được OCR cho ${invoice.fileName}.`,
      });
    } finally {
      setRetryingInvoiceCode(null);
    }
  };

  const getStatusBadge = (status: ProcessingStatus) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Khớp 100%
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã phê duyệt
          </span>
        );
      case 'MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Phát hiện lệch
          </span>
        );
      case 'NEED_CONFIRM':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <Clock className="h-3.5 w-3.5" />
            Cần xác nhận
          </span>
        );
      case 'OCR_REVIEWED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã rà soát OCR
          </span>
        );
      case 'OCR_PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <Clock className="h-3.5 w-3.5" />
            Chờ chạy OCR
          </span>
        );
      case 'OCR_DONE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Chờ rà soát OCR
          </span>
        );
      case 'OPENCV_PREPROCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Tiền xử lý OpenCV
          </span>
        );
      case 'PADDLE_OCR':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            PaddleOCR trích xuất
          </span>
        );
      case 'MATCHING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-bold text-cyan-800 animate-pulse">
            <Layers className="h-3.5 w-3.5" />
            Đang đối soát 3 bên
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">
            Đã từ chối
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            Đang chờ
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="queue-title">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Tiếp nhận và quản lý hóa đơn</p>
            <h1 id="queue-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Hóa đơn đầu vào</h1>
            <p className="mt-1 text-sm text-slate-500">Tải hóa đơn để chạy OCR, rà soát dữ liệu, rồi mở đối chiếu.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {isUploading ? 'Đang tải và chạy OCR' : 'Chọn hóa đơn'}
            </button>
            {canScan && (
              <button
                type="button"
                onClick={handleTriggerScan}
                disabled={isBusy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                {isScanning ? 'Đang quét...' : 'Quét thư mục nhận'}
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          className="sr-only"
          aria-label="Chọn tệp hóa đơn PDF hoặc ảnh"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void handleFileUpload(files);
          }}
        />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!isBusy) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void handleFileUpload(event.dataTransfer.files);
          }}
          className={`mx-5 my-4 flex min-h-24 items-center gap-4 rounded-xl border border-dashed px-4 py-4 transition sm:mx-6 ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/70'
          } ${isBusy ? 'opacity-60' : ''}`}
          aria-label="Vùng kéo thả hóa đơn"
        >
          <div className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:flex ${isDragging ? 'bg-blue-100 text-blue-700' : 'bg-white text-blue-700 shadow-sm'}`}>
            <UploadCloud className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              {isDragging ? 'Thả tệp để bắt đầu tải lên' : 'Hoặc kéo và thả hóa đơn vào đây'}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">PDF, PNG hoặc JPG · tối đa 25 MB mỗi tệp. Tệp trùng nội dung sẽ bị từ chối.</p>
          </div>
          <span className="ml-auto hidden shrink-0 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm md:inline-flex">Kéo thả tệp</span>
        </div>

        {notice && (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
            className={`mx-5 mb-5 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm sm:mx-6 ${
              notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
              notice.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' :
              notice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' :
              'border-blue-200 bg-blue-50 text-blue-900'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {notice.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> :
                notice.tone === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> :
                notice.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> :
                <Info className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="break-words">{notice.message}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo" className="shrink-0 rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* Khu vực Hàng đợi OCR */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Header & Bộ lọc Hàng đợi OCR */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              Danh sách hóa đơn
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {filteredInvoices.length} / {invoices.length} hồ sơ
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Tìm hóa đơn theo mã, số hóa đơn, nhà cung cấp hoặc PO"
                placeholder="Tìm mã, số hóa đơn, nhà cung cấp, PO..."
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Lọc hóa đơn theo trạng thái"
                className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="ALL">Tất cả ({invoices.length})</option>
                <option value="OCR_PENDING">Chờ chạy OCR</option>
                <option value="OCR_DONE">Chờ rà soát OCR</option>
                <option value="MATCHED">Khớp hoàn toàn</option>
                <option value="MISMATCH">Phát hiện sai lệch</option>
                <option value="NEED_CONFIRM">Cần xác nhận thủ công</option>
                <option value="OCR_REVIEWED">Đã rà soát OCR</option>
                <option value="PROCESSING">Đang xử lý trong hàng đợi</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bảng danh sách hóa đơn */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Mã hồ sơ OCR</th>
                <th className="py-3 px-3">Số HĐ & Ký hiệu</th>
                <th className="py-3 px-3">Nhà cung cấp</th>
                <th className="py-3 px-3">PO Tham chiếu</th>
                <th className="py-3 px-3">Ngày lập</th>
                <th className="py-3 px-3 text-right">Tổng thanh toán</th>
                <th className="py-3 px-3 text-center">Độ tin cậy OCR</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    {invoices.length === 0
                      ? 'Chưa có hóa đơn. Tải tệp ở khu vực tiếp nhận phía trên.'
                      : 'Không tìm thấy hóa đơn phù hợp với tìm kiếm và bộ lọc.'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.code} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                      {inv.code}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{inv.header.invoiceNumber}</div>
                      <div className="text-[10px] text-slate-400 font-mono">K/h: {inv.header.invoiceSeries}</div>
                    </td>
                    <td className="py-3 px-3 max-w-[220px]">
                      <div className="font-medium text-slate-900 truncate" title={inv.header.sellerName}>
                        {inv.header.sellerName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">MST: {inv.header.sellerTaxCode}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-blue-600">
                      {inv.header.poCode}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {inv.header.issueDate}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                      {formatCurrencyVND(inv.header.grandTotal)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {inv.header.ocrAverageConfidence == null ? (
                        <span className="text-[11px] text-slate-400">Chưa có</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${inv.header.ocrAverageConfidence}%` }}
                              className={`h-full rounded-full ${inv.header.ocrAverageConfidence >= 85 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            />
                          </div>
                          <span className={`font-mono font-bold text-[11px] ${inv.header.ocrAverageConfidence >= 85 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {inv.header.ocrAverageConfidence}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        {inv.status === 'OCR_PENDING' ? (
                          <button
                            type="button"
                            onClick={() => void handleRetryOcr(inv)}
                            disabled={isBusy}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${retryingInvoiceCode === inv.code ? 'animate-spin' : ''}`} />
                            {retryingInvoiceCode === inv.code ? 'Đang chạy OCR' : 'Chạy OCR'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReviewInvoiceCode(inv.code)}
                            disabled={isBusy}
                            aria-label={`Rà soát dữ liệu OCR của ${inv.fileName}`}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            Rà soát OCR
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onSelectInvoice(inv.code);
                            onNavigateToMatching();
                          }}
                          disabled={inv.status === 'OCR_PENDING' || isBusy}
                          title={inv.status === 'OCR_PENDING' ? 'Chạy OCR trước khi đối chiếu hóa đơn này' : undefined}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mở đối chiếu
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
