import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayerRenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfCanvasViewer({
  fileUrl,
  pageNumber,
  zoom,
  rotation,
  onPageCount,
  onTextLayerStatus,
}: {
  fileUrl: string;
  pageNumber: number;
  zoom: number;
  rotation: number;
  onPageCount: (count: number) => void;
  onTextLayerStatus?: (status: 'loading' | 'available' | 'unavailable') => void;
}) {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [containerWidth, setContainerWidth] = useState(780);
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

  return <div ref={containerRef} className="flex min-h-full w-full min-w-0 flex-col items-start justify-start">
    {loading && <div role="status" className="m-auto py-8 text-xs text-slate-500">Đang tải PDF từ backend…</div>}
    {error && <div role="alert" className="m-auto max-w-md p-6 text-center text-xs text-rose-700">Không hiển thị được PDF: {error}</div>}
    <div ref={pageFrameRef} className={loading || error ? 'relative hidden' : 'relative max-w-none rounded bg-white shadow'}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block" />
      <div ref={textLayerRef} aria-label={`Vùng chữ có thể chọn trên trang ${pageNumber}`} className="pdf-selectable-text-layer" />
      <span className="sr-only">Trang {pageNumber} của tài liệu PDF</span>
    </div>
  </div>;
}
