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
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Box,
} from 'lucide-react';
import { InvoiceRecord } from '../../types/index.ts';
import { api, TaxLookupDTO } from '../../services/api.ts';
import { PdfCanvasViewer, getFieldLabel } from './PdfCanvasViewer.tsx';

interface InvoiceDocumentViewerProps {
  invoice: InvoiceRecord;
  selectedFieldKey?: string | null;
  onSelectField?: (fieldKey: string | null) => void;
}

export const InvoiceDocumentViewer: React.FC<InvoiceDocumentViewerProps> = ({
  invoice,
  selectedFieldKey,
  onSelectField,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [showQrDetails, setShowQrDetails] = useState<boolean>(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pageCount, setPageCount] = useState<number>(1);

  const [taxInfo, setTaxInfo] = useState<TaxLookupDTO | null>(null);
  const [taxLoading, setTaxLoading] = useState<boolean>(false);
  const [showTaxDetails, setShowTaxDetails] = useState<boolean>(false);

  const runTaxLookup = async (mst: string, forceRefresh = false) => {
    const clean = (mst || '').trim();
    if (!clean) {
      setTaxInfo(null);
      return;
    }
    setTaxLoading(true);
    try {
      const res = await api.lookupTaxCode(clean, forceRefresh);
      setTaxInfo(res);
    } catch {
      // Keep fallback status from invoice.header.taxStatus if network error
    } finally {
      setTaxLoading(false);
    }
  };

  useEffect(() => {
    setShowTaxDetails(false);
    const mst = invoice.header.sellerTaxCode;
    if (mst) {
      void runTaxLookup(mst, false);
    } else {
      setTaxInfo(null);
    }
  }, [invoice.id, invoice.header.sellerTaxCode]);

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
    setPageNumber(1);
    setPageCount(1);

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
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 min-w-0 font-mono" title={invoice.fileName}>
            <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
            <span className="truncate">{invoice.fileName}</span>
          </span>
          {fileSizeKb > 0 && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
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

          {(isImage || isPdf) && (
            <>
              {isPdf && pageCount > 1 && (
                <div className="flex items-center gap-1 mr-1">
                  <button
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    disabled={pageNumber <= 1}
                    className="cursor-pointer rounded-lg p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    title="Trang trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-600 font-semibold px-1">
                    {pageNumber} / {pageCount}
                  </span>
                  <button
                    onClick={() => setPageNumber((p) => Math.min(pageCount, p + 1))}
                    disabled={pageNumber >= pageCount}
                    className="cursor-pointer rounded-lg p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    title="Trang sau"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                </div>
              )}

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

          {/* Nút bật/tắt Bounding Box */}
          <button
            type="button"
            onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5 transition-all border ${
              showBoundingBoxes
                ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title={showBoundingBoxes ? 'Bấm để ẩn Bounding Box OCR trên chứng từ' : 'Bấm để hiện Bounding Box OCR trên chứng từ'}
          >
            {showBoundingBoxes ? (
              <Eye className="h-3.5 w-3.5 text-blue-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span className="hidden sm:inline">Bounding Box</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
              showBoundingBoxes ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              {showBoundingBoxes ? (invoice.boundingBoxes?.filter((b) => b.fieldKey && !b.fieldKey.startsWith('block_')).length || invoice.boundingBoxes?.length || 'Bật') : 'Tắt'}
            </span>
          </button>

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

      {/* Thanh trạng thái Bounding Box đang được chọn */}
      {selectedFieldKey && (
        <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-xs text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-semibold text-[11px]">Đang chọn vùng:</span>
            <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-amber-300 font-bold text-amber-800 text-[11px] shadow-2xs">
              <Box className="h-3 w-3 text-amber-600" />
              {getFieldLabel(selectedFieldKey)}
            </span>
            <span className="text-[10px] text-amber-700 hidden md:inline">
              (Hộp nhận diện tương ứng đang được làm nổi bật trên chứng từ)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectField?.('')}
            className="text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer underline"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Thông tin Tra cứu Mã số thuế & QR Code Banner */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">Tra cứu MST NCC ({invoice.header.sellerTaxCode || 'Chưa có MST'}):</span>
          {(() => {
            const effectiveStatus = taxInfo?.tax_status || invoice.header.taxStatus;
            if (taxLoading) {
              return (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                  Đang tra cứu dữ liệu Tổng cục Thuế...
                </span>
              );
            }
            if (effectiveStatus === 'ACTIVE') {
              return (
                <button
                  type="button"
                  onClick={() => setShowTaxDetails((v) => !v)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 transition-colors"
                  title="Nhấn để xem chi tiết đăng ký thuế"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Tổng cục Thuế: {taxInfo?.status_detail || 'Đang hoạt động bình thường'}
                </button>
              );
            }
            if (effectiveStatus === 'WARNING_HIGH_RISK' || effectiveStatus === 'TAX_RISK') {
              return (
                <button
                  type="button"
                  onClick={() => setShowTaxDetails((v) => !v)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded bg-amber-50 hover:bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-300 transition-colors"
                  title="Nhấn để xem chi tiết cảnh báo thuế"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Cảnh báo: {taxInfo?.status_detail || 'Rủi ro cao về thuế / Tạm ngừng'}
                </button>
              );
            }
            if (effectiveStatus === 'SUSPENDED') {
              return (
                <button
                  type="button"
                  onClick={() => setShowTaxDetails((v) => !v)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded bg-rose-50 hover:bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200 transition-colors"
                  title="Nhấn để xem chi tiết cảnh báo thuế"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  Ngừng hoạt động / MST không hợp lệ
                </button>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                Chưa có kết quả tra cứu mã số thuế
              </span>
            );
          })()}

          {invoice.header.sellerTaxCode && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowTaxDetails((v) => !v)}
                className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
              >
                {showTaxDetails ? 'Ẩn ĐKKD' : 'Chi tiết ĐKKD'}
              </button>
              <button
                type="button"
                disabled={taxLoading}
                onClick={() => void runTaxLookup(invoice.header.sellerTaxCode, true)}
                className="cursor-pointer inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                title="Tra cứu trực tiếp lại từ cổng dữ liệu Tổng cục Thuế"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${taxLoading ? 'animate-spin' : ''}`} />
                Tra cứu lại
              </button>
            </div>
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

      {/* Hộp chi tiết kết quả Tra cứu Mã số thuế Tổng cục Thuế */}
      {showTaxDetails && (
        <div className="bg-emerald-50/70 border-b border-emerald-200 px-4 py-3 text-xs text-slate-800 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Thông tin Đăng ký Thuế Doanh nghiệp (Tổng cục Thuế)
            </div>
            <button
              type="button"
              onClick={() => setShowTaxDetails(false)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Đóng ✕
            </button>
          </div>
          {taxInfo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs text-[11px]">
              <div className="sm:col-span-2">
                <span className="text-slate-500">Tên người nộp thuế:</span>{' '}
                <span className="font-bold text-slate-900">{taxInfo.company_name || '—'}</span>
              </div>
              {taxInfo.international_name && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Tên quốc tế:</span>{' '}
                  <span className="font-medium text-slate-700">{taxInfo.international_name}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Mã số thuế:</span>{' '}
                <span className="font-mono font-bold text-blue-700">{taxInfo.tax_code}</span>
              </div>
              <div>
                <span className="text-slate-500">Tình trạng:</span>{' '}
                <span className={`font-bold ${taxInfo.tax_status === 'ACTIVE' ? 'text-emerald-700' : taxInfo.tax_status === 'WARNING_HIGH_RISK' ? 'text-amber-700' : 'text-rose-700'}`}>
                  {taxInfo.status_detail}
                </span>
              </div>
              {taxInfo.representative && (
                <div>
                  <span className="text-slate-500">Đại diện pháp luật:</span>{' '}
                  <span className="font-semibold text-slate-800">{taxInfo.representative}</span>
                </div>
              )}
              {taxInfo.phone && (
                <div>
                  <span className="text-slate-500">Điện thoại ĐKKD:</span>{' '}
                  <span className="font-mono text-slate-700">{taxInfo.phone}</span>
                </div>
              )}
              <div className="sm:col-span-2">
                <span className="text-slate-500">Địa chỉ trụ sở:</span>{' '}
                <span className="text-slate-800">{taxInfo.address || '—'}</span>
              </div>
              <div className="sm:col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>Nguồn: {taxInfo.source}</span>
                <span>Cập nhật: {taxInfo.looked_up_at ? taxInfo.looked_up_at.slice(0, 19).replace('T', ' ') : 'Vừa xong'}</span>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px]">Chưa có dữ liệu chi tiết.</div>
          )}
        </div>
      )}

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
          <div className="flex-1 w-full h-full min-h-0 overflow-auto p-4 flex justify-center items-start bg-slate-200/40">
            <PdfCanvasViewer
              fileUrl={blobUrl}
              pageNumber={pageNumber}
              zoom={zoomLevel}
              rotation={rotation}
              onPageCount={setPageCount}
              boundingBoxes={invoice.boundingBoxes}
              showBoundingBoxes={showBoundingBoxes}
              selectedFieldKey={selectedFieldKey}
              onSelectField={onSelectField}
            />
          </div>
        )}

        {!loading && blobUrl && isImage && (
          <div className="flex-1 overflow-auto p-4 flex justify-center items-center bg-slate-200/40">
            <div
              className="relative inline-block"
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
            >
              <img
                src={blobUrl}
                alt={invoice.fileName}
                className="max-w-full max-h-[820px] object-contain rounded-lg shadow-lg border border-slate-300 bg-white block"
              />
              {/* Bounding box layer on image */}
              {showBoundingBoxes && invoice.boundingBoxes && invoice.boundingBoxes.length > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  onClick={() => onSelectField?.('')}
                >
                  {invoice.boundingBoxes.map((box) => {
                    const isSelected = selectedFieldKey && (selectedFieldKey === box.fieldKey || selectedFieldKey === box.id);
                    return (
                      <div
                        key={box.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField?.(isSelected ? '' : box.fieldKey);
                        }}
                        title={`${getFieldLabel(box.fieldKey)}: ${box.text || ''}`}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                        className={`group absolute pointer-events-auto cursor-pointer transition-all rounded ${
                          isSelected
                            ? 'border-2 border-amber-500 bg-amber-500/30 ring-4 ring-amber-400/40 shadow-lg z-30'
                            : box.isAnomaly
                            ? 'border-2 border-rose-500 bg-rose-500/20 hover:bg-rose-500/35 hover:border-rose-600 z-20'
                            : selectedFieldKey
                            ? 'border border-blue-400/30 bg-blue-400/5 opacity-40 hover:opacity-100 hover:bg-blue-400/20'
                            : 'border border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/25 hover:border-blue-600'
                        }`}
                      >
                        <div
                          className={`absolute -top-5 left-0 items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap z-40 transition-opacity ${
                            isSelected
                              ? 'flex bg-amber-600 text-white'
                              : 'hidden group-hover:flex bg-slate-900/90 text-white'
                          }`}
                        >
                          <span>{getFieldLabel(box.fieldKey)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
