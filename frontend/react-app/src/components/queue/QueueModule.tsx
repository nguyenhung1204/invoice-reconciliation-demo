import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check,
  Cpu,
  Layers,
  Hash,
} from 'lucide-react';
import { InvoiceRecord, ProcessingStatus } from '../../types/index.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { mockActions } from '../../services/api.ts';

interface QueueModuleProps {
  invoices: InvoiceRecord[];
  onSelectInvoice: (code: string) => void;
  onNavigateToMatching: () => void;
}

export const QueueModule: React.FC<QueueModuleProps> = ({
  invoices,
  onSelectInvoice,
  onNavigateToMatching,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lọc danh sách hóa đơn
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.header.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.header.sellerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.header.sellerTaxCode.includes(searchTerm) ||
      inv.header.poCode.toLowerCase().includes(searchTerm.toLowerCase());

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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size,
      file: f,
    }));

    const result = await mockActions.uploadInvoices(fileList);
    if (result.errors && result.errors.length > 0) {
      setUploadSuccessMessage(
        `Đã tải lên ${result.uploadedCount}/${fileList.length} tệp. Lỗi: ${result.errors.join('; ')}`
      );
    } else {
      setUploadSuccessMessage(
        `Đã nạp thành công ${result.uploadedCount} tệp hóa đơn vào hệ thống xử lý OCR.`
      );
    }
    setTimeout(() => setUploadSuccessMessage(null), 5000);
  };

  const handleTriggerScan = async () => {
    setIsScanning(true);
    try {
      const res = await mockActions.triggerRpaScan();
      setUploadSuccessMessage(res.message);
      setTimeout(() => setUploadSuccessMessage(null), 4000);
    } finally {
      setIsScanning(false);
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
      case 'OPENCV_PREPROCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 animate-pulse">
            <Cpu className="h-3.5 w-3.5" />
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
      {/* Tiêu đề phân hệ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            Tiếp Nhận Hóa Đơn & Hàng Đợi Xử Lý (Queue Management)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tiếp nhận đa kênh (Email IMAP / SMB / Kéo thả) & Pipeline nhận dạng PaddleOCR tự động
          </p>
        </div>
        <button
          onClick={handleTriggerScan}
          disabled={isScanning}
          className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Đang kích hoạt RPA...' : 'Quét Thư mục & Email ngay'}
        </button>
      </div>

      {uploadSuccessMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{uploadSuccessMessage}</span>
          </div>
          <button
            onClick={() => setUploadSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Khu vực Tiếp nhận đa kênh (Drag & Drop) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50/70 shadow-md'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div className="text-sm font-bold text-slate-800">
          Kéo thả tệp hóa đơn vào đây hoặc <span className="text-blue-600 underline">Chọn từ máy tính</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Hỗ trợ định dạng hóa đơn điện tử: <strong>PDF (gốc/scan)</strong>, <strong>PNG</strong>, <strong>JPG</strong> (Tự động băm SHA-256 chống trùng hóa đơn)
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Tiền xử lý OpenCV (Deskew & Denoiser)
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Trích xuất văn bản PaddleOCR v2.5
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Quét mã QR Thông tư 78
          </span>
        </div>
      </div>

      {/* Khu vực Hàng đợi OCR */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Header & Bộ lọc Hàng đợi OCR */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              Hàng đợi OCR ({filteredInvoices.length} hồ sơ)
            </h2>
            <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-semibold">
              Tất cả ({invoices.length})
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo Mã, Số HĐ, Mã PO..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none bg-white cursor-pointer font-medium"
              >
                <option value="ALL">Tất cả ({invoices.length})</option>
                <option value="MATCHED">Khớp hoàn toàn</option>
                <option value="MISMATCH">Phát hiện sai lệch</option>
                <option value="NEED_CONFIRM">Cần xác nhận thủ công</option>
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
                    Không tìm thấy hóa đơn OCR nào.
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
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${inv.header.ocrAverageConfidence}%` }}
                            className={`h-full rounded-full ${
                              inv.header.ocrAverageConfidence >= 85
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                            }`}
                          />
                        </div>
                        <span
                          className={`font-mono font-bold text-[11px] ${
                            inv.header.ocrAverageConfidence >= 85
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {inv.header.ocrAverageConfidence}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          onSelectInvoice(inv.code);
                          onNavigateToMatching();
                        }}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-600 hover:text-white transition-colors"
                      >
                        Mở đối chiếu
                        <ArrowRight className="h-3 w-3" />
                      </button>
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
