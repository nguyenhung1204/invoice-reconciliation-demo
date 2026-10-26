import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Minimize2,
  CheckCircle,
  FileText,
  Download,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { InvoiceRecord } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface InvoiceDocumentViewerProps {
  invoice: InvoiceRecord;
  selectedFieldKey?: string | null;
  onSelectField?: (fieldKey: string) => void;
}

export const InvoiceDocumentViewer: React.FC<InvoiceDocumentViewerProps> = ({
  invoice,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [showQrDetails, setShowQrDetails] = useState<boolean>(false);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string>('');
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 20, 50));
  const handleResetZoom = () => {
    setZoomLevel(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  useEffect(() => {
    let isCancelled = false;
    let createdUrl: string | null = null;

    setLoading(true);
    setError(null);
    setBlobUrl(null);

    const loadInvoiceFile = async () => {
      const invId = Number(invoice.id);
      if (!invId || isNaN(invId)) {
        if (!isCancelled) {
          setError('Mã hồ sơ hóa đơn không hợp lệ.');
          setLoading(false);
        }
        return;
      }

      try {
        const blob = await api.getInvoiceFile(invId);
        if (isCancelled) return;

        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setFileMime(blob.type || 'application/pdf');
        setFileSizeKb(Math.round(blob.size / 1024));
        setLoading(false);
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : 'Không tìm thấy tệp gốc';
        setError(msg);
        setLoading(false);
      }
    };

    void loadInvoiceFile();

    return () => {
      isCancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [invoice.id, reloadKey]);

  const isPdf =
    fileMime.includes('pdf') ||
    invoice.fileName.toLowerCase().endsWith('.pdf');

  const isImage =
    fileMime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(invoice.fileName);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-slate-100/80 overflow-hidden shadow-xs">
      {/* Thanh công cụ (Viewer Toolbar) */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Tài Liệu Hóa Đơn Gốc
          </span>
          <span className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]" title={invoice.fileName}>
            {invoice.fileName}
          </span>
          {fileSizeKb > 0 && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              {fileSizeKb} KB
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {blobUrl && (
            <>
              <a
                href={blobUrl}
                download={invoice.fileName}
                className="cursor-pointer rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1 text-[11px] font-medium border border-slate-200"
                title="Tải tệp hóa đơn gốc về máy"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tải về</span>
              </a>

              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1 text-[11px] font-medium border border-slate-200"
                title="Mở tài liệu trong tab mới"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tab mới</span>
              </a>

              <div className="h-4 w-px bg-slate-200 mx-1" />
            </>
          )}

          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                title="Thu nhỏ (-20%)"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-[11px] font-mono font-semibold text-slate-700 w-11 text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={handleZoomIn}
                className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                title="Phóng to (+20%)"
              >
                <ZoomIn className="h-4 w-4" />
              </button>

              <button
                onClick={handleRotate}
                className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors ml-1"
                title="Xoay 90 độ"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <button
                onClick={handleResetZoom}
                className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                title="Đặt lại kích thước mặc định"
              >
                <Minimize2 className="h-4 w-4" />
              </button>

              <div className="h-4 w-px bg-slate-200 mx-1" />
            </>
          )}

          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
            title="Tải lại tài liệu"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Thông tin Tra cứu Mã số thuế & QR Code Banner */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Tra cứu MST NCC ({invoice.header.sellerTaxCode || 'Chưa có MST'}):</span>
          {invoice.header.taxStatus === 'ACTIVE' ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Tổng cục Thuế: Đang hoạt động bình thường
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Cảnh báo: Rủi ro cao về thuế
            </span>
          )}
        </div>

        {invoice.header.qrCodeData && (
          <button
            onClick={() => setShowQrDetails(!showQrDetails)}
            className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
          >
            <QrCode className="h-3.5 w-3.5" />
            {showQrDetails ? 'Ẩn dữ liệu QR' : 'Đối chiếu mã QR'}
          </button>
        )}
      </div>

      {/* Hộp chi tiết QR Code khi mở */}
      {showQrDetails && invoice.header.qrCodeData && (
        <div className="bg-blue-50/80 border-b border-blue-200 p-3 text-xs text-blue-900 animate-fade-in flex items-start gap-3">
          <div className="rounded-lg bg-white p-2 border border-blue-200 shadow-2xs">
            <QrCode className="h-10 w-10 text-slate-800" />
          </div>
          <div className="flex-1">
            <div className="font-bold flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              Dữ liệu trích xuất từ Mã QR:
            </div>
            <div className="mt-1 font-mono text-[11px] bg-white px-2.5 py-1.5 rounded border border-blue-200 break-all select-all">
              {invoice.header.qrCodeData}
            </div>
          </div>
        </div>
      )}

      {/* Vùng hiển thị Tài liệu Thật từ Backend */}
      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 bg-slate-100">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <span className="text-xs font-semibold text-slate-700">Đang tải tệp chứng từ gốc từ máy chủ...</span>
            <span className="text-[11px] text-slate-400 mt-1">Đang đọc dữ liệu từ kho lưu trữ backend</span>
          </div>
        )}

        {!loading && (error || !blobUrl) && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="rounded-full bg-slate-200/80 p-4 mb-3">
              <FileText className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Không tìm thấy tệp tài liệu gốc
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-md leading-relaxed">
              Hồ sơ này không có tệp PDF hoặc ảnh đính kèm lưu trên máy chủ backend.
            </p>
            <div className="mt-4 text-[11px] text-slate-600 border border-slate-200 rounded-xl p-3.5 bg-white max-w-md shadow-2xs">
              <p className="font-semibold text-slate-700 mb-1">Quy định hiển thị:</p>
              Hệ thống không sử dụng mẫu hóa đơn tự tạo. Để xem chứng từ thực tế, hãy nạp hóa đơn qua tệp PDF hoặc ảnh tại phân hệ <strong>Tiếp nhận và quản lý hóa đơn</strong>.
            </div>
          </div>
        )}

        {!loading && blobUrl && isPdf && (
          <div className="flex-1 w-full h-full min-h-0">
            <iframe
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0 bg-white"
              title={`Hóa đơn ${invoice.fileName}`}
            />
          </div>
        )}

        {!loading && blobUrl && isImage && (
          <div className="flex-1 overflow-auto p-4 flex justify-center items-center bg-slate-200/40">
            <img
              src={blobUrl}
              alt={invoice.fileName}
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
              className="max-w-full max-h-[820px] object-contain rounded-lg shadow-lg border border-slate-300 bg-white"
            />
          </div>
        )}

        {!loading && blobUrl && !isPdf && !isImage && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <FileText className="h-12 w-12 text-slate-400 mb-2" />
            <p className="text-xs font-semibold text-slate-700">Định dạng tệp: {fileMime || 'Tệp nhị phân'}</p>
            <p className="text-[11px] text-slate-500 mt-1">Không thể hiển thị trực tiếp trong khung xem.</p>
            <a
              href={blobUrl}
              download={invoice.fileName}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Tải tệp về máy
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
