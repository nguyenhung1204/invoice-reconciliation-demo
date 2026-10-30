import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayerRenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { BoundingBox } from '../../types/index.ts';

export function getFieldLabel(key: string): string {
  switch (key) {
    case 'invoiceNumber': return 'Số hóa đơn';
    case 'invoiceSeries': return 'Ký hiệu mẫu';
    case 'issueDate': return 'Ngày lập';
    case 'sellerName': return 'Tên người bán';
    case 'sellerTaxCode': return 'MST người bán';
    case 'buyerName': return 'Tên người mua';
    case 'buyerTaxCode': return 'MST người mua';
    case 'grandTotal': return 'Tổng thanh toán';
    case 'vatAmount': return 'Tiền thuế';
    case 'subTotal': return 'Cộng tiền hàng';
    default:
      if (key.startsWith('lineItem_')) {
        const parts = key.replace('lineItem_', '').split('_');
        const lineNo = parts[0];
        const subField = parts[1];
        if (subField === 'price') return `Đơn giá #${lineNo}`;
        if (subField === 'vat') return `Thuế #${lineNo}`;
        if (subField === 'amount') return `Thành tiền #${lineNo}`;
        if (subField === 'name') return `Tên hàng #${lineNo}`;
        return `Dòng hàng #${lineNo}`;
      }
      return key.startsWith('block_') ? 'Vùng OCR' : key;
  }
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfCanvasViewer({
  fileUrl,
  pageNumber,
  zoom,
  rotation,
  onPageCount,
  onTextLayerStatus,
  boundingBoxes = [],
  showBoundingBoxes = false,
  selectedFieldKey = null,
  onSelectField,
}: {
  fileUrl: string;
  pageNumber: number;
  zoom: number;
  rotation: number;
  onPageCount: (count: number) => void;
  onTextLayerStatus?: (status: 'loading' | 'available' | 'unavailable') => void;
  boundingBoxes?: BoundingBox[];
  showBoundingBoxes?: boolean;
  selectedFieldKey?: string | null;
  onSelectField?: (fieldKey: string | null) => void;
}) {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [containerWidth, setContainerWidth] = useState(780);
  const [pdfPageDimensions, setPdfPageDimensions] = useState<{ width: number; height: number }>({ width: 1190, height: 1684 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerTaskRef = useRef<TextLayerRenderTask | null>(null);
  const onPageCountRef = useRef(onPageCount);
  const onTextLayerStatusRef = useRef(onTextLayerStatus);

  useEffect(() => { onPageCountRef.current = onPageCount; }, [onPageCount]);
  useEffect(() => { onTextLayerStatusRef.current = onTextLayerStatus; }, [onTextLayerStatus]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.max(240, width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setError('');
    setDocumentProxy(null);
    onPageCountRef.current(1);

    const loadDocument = async () => {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Không tải được file PDF (HTTP ${response.status}).`);
      const data = await response.arrayBuffer();
      if (cancelled) return;
      loadingTask = pdfjs.getDocument({ data });
      const document = await loadingTask.promise;
      if (cancelled) return;
      setDocumentProxy(document);
      onPageCountRef.current(document.numPages || 1);
      setLoading(false);
    };

    void loadDocument().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
      setLoading(false);
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      if (loadingTask) void loadingTask.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    let cancelled = false;
    const renderPage = async () => {
      if (!documentProxy || !canvasRef.current || !pageFrameRef.current || !textLayerRef.current) return;
      setError('');
      renderTaskRef.current?.cancel();
      textLayerTaskRef.current?.cancel();
      textLayerRef.current.replaceChildren();
      onTextLayerStatusRef.current?.('loading');
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current || !pageFrameRef.current || !textLayerRef.current) return;
        const unrotatedViewport = page.getViewport({ scale: 1, rotation: 0 });
        setPdfPageDimensions({ width: unrotatedViewport.width * 2, height: unrotatedViewport.height * 2 });
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const cssWidth = Math.max(200, Math.min(780, containerWidth)) * zoom / 100;
        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        const scale = cssWidth / baseViewport.width;
        const cssViewport = page.getViewport({ scale, rotation });
        const renderViewport = page.getViewport({ scale: scale * deviceScale, rotation });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        pageFrameRef.current.style.width = `${cssViewport.width}px`;
        pageFrameRef.current.style.height = `${cssViewport.height}px`;
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        textLayerRef.current.style.setProperty('--scale-factor', String(scale));
        const task = page.render({ canvasContext: context, viewport: renderViewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled || !textLayerRef.current) return;
        renderTaskRef.current = null;

        const textContent = await page.getTextContent();
        const hasText = textContent.items.some((item) => 'str' in item && item.str.trim().length > 0);
        if (!hasText) {
          onTextLayerStatusRef.current?.('unavailable');
          return;
        }

        const textTask = pdfjs.renderTextLayer({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport: cssViewport,
          textDivs: [],
          textContentItemsStr: [],
        });
        textLayerTaskRef.current = textTask;
        await textTask.promise;
        if (!cancelled) {
          textLayerTaskRef.current = null;
          onTextLayerStatusRef.current?.('available');
        }
      } catch (cause) {
        if (cancelled || (cause instanceof Error && cause.name === 'RenderingCancelledException')) return;
        onTextLayerStatusRef.current?.('unavailable');
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể hiển thị trang PDF.');
      }
    };
    void renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      textLayerTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, zoom, rotation, containerWidth]);

  return <div ref={containerRef} className="flex min-h-full w-full min-w-0 flex-col items-center justify-start">
    {loading && <div role="status" className="m-auto py-8 text-xs text-slate-500">Đang tải PDF từ backend…</div>}
    {error && <div role="alert" className="m-auto max-w-md p-6 text-center text-xs text-rose-700">Không hiển thị được PDF: {error}</div>}
    <div ref={pageFrameRef} className={loading || error ? 'relative hidden' : 'relative max-w-none rounded bg-white shadow'}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block" />
      <div ref={textLayerRef} aria-label={`Vùng chữ có thể chọn trên trang ${pageNumber}`} className="pdf-selectable-text-layer" />

      {/* Bounding Boxes Layer */}
      {showBoundingBoxes && boundingBoxes && boundingBoxes.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 overflow-visible"
          onClick={() => onSelectField?.(null)}
        >
          {boundingBoxes
            .filter((box) => !box.page || box.page === pageNumber)
            .filter((box) => {
              const hasNamedBoxes = boundingBoxes.some((b) => b.fieldKey && !b.fieldKey.startsWith('block_'));
              if (!hasNamedBoxes) return true;
              if (selectedFieldKey && (
                selectedFieldKey === box.fieldKey ||
                selectedFieldKey === box.id ||
                (box.fieldKey && box.fieldKey.startsWith(`${selectedFieldKey}_`)) ||
                (selectedFieldKey.startsWith(`${box.fieldKey}_`))
              )) return true;
              return Boolean(box.fieldKey && !box.fieldKey.startsWith('block_'));
            })
            .map((box) => {
              const isSelected = Boolean(
                selectedFieldKey && (
                  selectedFieldKey === box.fieldKey ||
                  selectedFieldKey === box.id ||
                  (box.fieldKey && box.fieldKey.startsWith(`${selectedFieldKey}_`)) ||
                  (selectedFieldKey.startsWith(`${box.fieldKey}_`))
                )
              );
              let leftPct = box.x;
              let topPct = box.y;
              let widthPct = box.width;
              let heightPct = box.height;
              if (box.rawBox && box.rawBox.length === 4 && pdfPageDimensions.width > 0 && pdfPageDimensions.height > 0) {
                const [x1, y1, x2, y2] = box.rawBox;
                leftPct = Math.max(0, Math.min(100, (x1 / pdfPageDimensions.width) * 100));
                topPct = Math.max(0, Math.min(100, (y1 / pdfPageDimensions.height) * 100));
                widthPct = Math.max(0.5, Math.min(100 - leftPct, ((x2 - x1) / pdfPageDimensions.width) * 100));
                heightPct = Math.max(0.5, Math.min(100 - topPct, ((y2 - y1) / pdfPageDimensions.height) * 100));
              }
              return (
                <div
                  key={box.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectField?.(isSelected ? null : box.fieldKey);
                  }}
                  title={`${getFieldLabel(box.fieldKey)}: ${box.text || ''} (${box.confidence ? box.confidence.toFixed(0) : 90}%)`}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                className={`group absolute pointer-events-auto cursor-pointer transition-all duration-150 rounded ${
                  isSelected
                    ? 'border-2 border-amber-500 bg-amber-500/30 ring-4 ring-amber-400/40 shadow-lg z-30'
                    : box.isAnomaly
                    ? 'border-2 border-rose-500 bg-rose-500/20 hover:bg-rose-500/35 hover:border-rose-600 z-20'
                    : selectedFieldKey
                    ? 'border border-blue-400/30 bg-blue-400/5 opacity-40 hover:opacity-100 hover:bg-blue-400/20'
                    : 'border border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/25 hover:border-blue-600 hover:shadow-xs'
                }`}
              >
                {/* Floating pill badge when selected or hovered */}
                <div
                  className={`absolute -top-5 left-0 items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap z-40 transition-opacity ${
                    isSelected
                      ? 'flex bg-amber-600 text-white'
                      : box.isAnomaly
                      ? 'flex bg-rose-600 text-white'
                      : 'hidden group-hover:flex bg-slate-900/90 text-white'
                  }`}
                >
                  <span>{getFieldLabel(box.fieldKey)}</span>
                  {box.confidence ? (
                    <span className="opacity-80 font-mono text-[8px]">{Math.round(box.confidence)}%</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <span className="sr-only">Trang {pageNumber} của tài liệu PDF</span>
    </div>
  </div>;
}
