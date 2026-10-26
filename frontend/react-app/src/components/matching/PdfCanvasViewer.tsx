import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfCanvasViewer({
  fileUrl,
  pageNumber,
  zoom,
  rotation,
  onPageCount,
}: {
  fileUrl: string;
  pageNumber: number;
  zoom: number;
  rotation: number;
  onPageCount: (count: number) => void;
}) {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [containerWidth, setContainerWidth] = useState(780);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const onPageCountRef = useRef(onPageCount);

  useEffect(() => { onPageCountRef.current = onPageCount; }, [onPageCount]);

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
      if (!documentProxy || !canvasRef.current) return;
      setError('');
      renderTaskRef.current?.cancel();
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const cssWidth = Math.max(200, Math.min(780, containerWidth - 24)) * zoom / 100;
        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        const scale = cssWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: scale * deviceScale, rotation });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / deviceScale}px`;
        canvas.style.height = `${viewport.height / deviceScale}px`;
        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) renderTaskRef.current = null;
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'RenderingCancelledException') return;
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể hiển thị trang PDF.');
      }
    };
    void renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, zoom, rotation, containerWidth]);

  return <div ref={containerRef} className="flex min-h-full min-w-0 flex-col items-center justify-start">
    {loading && <div role="status" className="m-auto py-8 text-xs text-slate-500">Đang tải PDF từ backend…</div>}
    {error && <div role="alert" className="m-auto max-w-md p-6 text-center text-xs text-rose-700">Không hiển thị được PDF: {error}</div>}
    <canvas ref={canvasRef} aria-label={`Trang ${pageNumber} của tài liệu PDF`} className={loading || error ? 'hidden' : 'max-w-none rounded bg-white shadow'} />
  </div>;
}
