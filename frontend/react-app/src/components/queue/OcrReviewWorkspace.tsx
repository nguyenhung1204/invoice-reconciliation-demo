import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { InvoiceRecord } from '../../types/index.ts';
import { api, store } from '../../services/api.ts';
import type { BackendInvoiceDTO } from '../../services/api.ts';
import { PdfCanvasViewer } from '../matching/PdfCanvasViewer.tsx';

interface OcrReviewWorkspaceProps {
  invoice: InvoiceRecord;
  onBack: () => void;
}

interface ReviewLine {
  name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  amount: string;
}

interface ReviewDraft {
  invoice_number: string;
  invoice_date: string;
  seller_tax_code: string;
  buyer_tax_code: string;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  review_note: string;
  items: ReviewLine[];
}

const emptyLine = (): ReviewLine => ({
  name: '', unit: '', quantity: '', unit_price: '', tax_rate: '', amount: '',
});

function asText(value: number | string | null | undefined): string {
  return value == null ? '' : String(value);
}

function parseNumber(value: string, money = false): number | null {
  let token = value.trim().replace(/[^\d,.-]/g, '');
  if (!token || !/\d/.test(token)) return null;

  const negative = token.startsWith('-');
  token = token.replace(/-/g, '');
  const lastDot = token.lastIndexOf('.');
  const lastComma = token.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);
  if (lastSeparator >= 0) {
    const separator = token[lastSeparator];
    const trailingDigits = token.length - lastSeparator - 1;
    const hasBoth = lastDot >= 0 && lastComma >= 0;
    const isThousandsOnly = money && !hasBoth && trailingDigits === 3;
    if (hasBoth || !isThousandsOnly) {
      const integer = token.slice(0, lastSeparator).replace(/[.,]/g, '');
      const fraction = token.slice(lastSeparator + 1).replace(/[.,]/g, '');
      token = `${integer}.${fraction}`;
    } else {
      token = token.replace(/[.,]/g, '');
    }
  }

  const parsed = Number(`${negative ? '-' : ''}${token}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function draftFromInvoice(invoice: BackendInvoiceDTO): ReviewDraft {
  return {
    invoice_number: invoice.invoice_number || '',
    invoice_date: invoice.invoice_date || '',
    seller_tax_code: invoice.seller_tax_code || '',
    buyer_tax_code: invoice.buyer_tax_code || '',
    subtotal_amount: asText(invoice.subtotal_amount),
    tax_amount: asText(invoice.tax_amount),
    total_amount: asText(invoice.total_amount),
    review_note: invoice.review_note || 'Đã rà soát dữ liệu OCR theo hóa đơn PDF.',
    items: invoice.items.map((item) => ({
      name: item.name || item.description || '',
      unit: item.unit || '',
      quantity: asText(item.quantity),
      unit_price: asText(item.unit_price),
      tax_rate: asText(item.tax_rate),
      amount: asText(item.amount),
    })),
  };
}

export const OcrReviewWorkspace: React.FC<OcrReviewWorkspaceProps> = ({ invoice, onBack }) => {
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentMime, setDocumentMime] = useState('');
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState('');
  const [textLayerStatus, setTextLayerStatus] = useState<'loading' | 'available' | 'unavailable'>('loading');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(100);
  const isPdf = documentMime.includes('pdf') || invoice.fileName.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    let active = true;
    document.querySelector('main')?.scrollTo({ top: 0 });
    setIsLoading(true);
    setLoadError('');
    setDraft(null);
    api.getInvoice(Number(invoice.id))
      .then((detail) => {
        if (active) setDraft(draftFromInvoice(detail));
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Không tải được dữ liệu hóa đơn.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [invoice.id]);

  useEffect(() => {
    let active = true;
    let createdUrl = '';
    setDocumentLoading(true);
    setDocumentError('');
    setDocumentUrl('');
    setDocumentMime('');
    setTextLayerStatus('loading');
    setPageNumber(1);
    setPageCount(1);
    api.getInvoiceFile(Number(invoice.id))
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setDocumentUrl(createdUrl);
        setDocumentMime(blob.type || (invoice.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/*'));
      })
      .catch((error: unknown) => {
        if (active) setDocumentError(error instanceof Error ? error.message : 'Không tải được file hóa đơn.');
      })
      .finally(() => {
        if (active) setDocumentLoading(false);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [invoice.id, invoice.fileName]);

  const updateDraft = (field: keyof Omit<ReviewDraft, 'items'>, value: string) => {
    setSaved(false);
    setDraft((current) => current ? { ...current, [field]: value } : current);
  };

  const updateLine = (index: number, field: keyof ReviewLine, value: string) => {
    setSaved(false);
    setDraft((current) => current ? {
      ...current,
      items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line),
    } : current);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await api.saveInvoiceReview(Number(invoice.id), {
        seller_tax_code: draft.seller_tax_code.trim(),
        seller_name: invoice.header.sellerName,
        invoice_series: invoice.header.invoiceSeries,
        buyer_tax_code: draft.buyer_tax_code.trim(),
        invoice_number: draft.invoice_number.trim(),
        invoice_date: draft.invoice_date.trim(),
        subtotal_amount: parseNumber(draft.subtotal_amount, true),
        tax_amount: parseNumber(draft.tax_amount, true),
        total_amount: parseNumber(draft.total_amount, true),
        items: draft.items.map((line) => ({
          name: line.name.trim(),
          unit: line.unit.trim(),
          quantity: parseNumber(line.quantity),
          unit_price: parseNumber(line.unit_price, true),
          tax_rate: parseNumber(line.tax_rate),
          amount: parseNumber(line.amount, true),
        })),
        po_number: invoice.header.poCode || '',
        review_note: draft.review_note.trim(),
      });
      await store.syncWithBackend();
      setSaved(true);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Không lưu được dữ liệu rà soát.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30';

  return (
    <section className="space-y-4" aria-labelledby="ocr-review-title">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Hàng đợi
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Tiếp nhận hóa đơn</p>
            <h1 id="ocr-review-title" className="text-lg font-bold text-slate-900">Rà soát lại dữ liệu OCR</h1>
            <p className="text-xs text-slate-500">{invoice.fileName} · {invoice.code}</p>
          </div>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
          OCR: {invoice.header.ocrAverageConfidence == null ? 'chưa có điểm tin cậy' : `${invoice.header.ocrAverageConfidence}% tin cậy`}
        </span>
      </header>

      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</div>}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 sm:gap-4">
        <div className="sticky top-4 h-[calc(100vh-17rem)] min-h-[320px] max-h-[720px]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
              <div className="min-w-0">
                <h2 className="text-xs font-bold text-slate-800">Hóa đơn gốc</h2>
                <p className="truncate text-[11px] text-slate-500">{invoice.fileName}</p>
              </div>
              <div className="flex items-center gap-1">
                {isPdf && documentUrl && <>
                  <button type="button" aria-label="Trang trước" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="min-w-12 text-center text-[11px] font-mono text-slate-600">{pageNumber}/{pageCount}</span>
                  <button type="button" aria-label="Trang sau" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  <button type="button" aria-label="Thu nhỏ PDF" onClick={() => setZoom((value) => Math.max(60, value - 20))} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"><ZoomOut className="h-4 w-4" /></button>
                  <span className="min-w-10 text-center text-[11px] font-mono text-slate-600">{zoom}%</span>
                  <button type="button" aria-label="Phóng to PDF" onClick={() => setZoom((value) => Math.min(180, value + 20))} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"><ZoomIn className="h-4 w-4" /></button>
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer" aria-label="Mở PDF trong tab mới" className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"><ExternalLink className="h-4 w-4" /></a>
                </>}
              </div>
            </div>
            {isPdf && documentUrl && (
              <p aria-live="polite" className="border-b border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
                Bôi đen riêng nội dung cần lấy trên PDF, nhấn Ctrl+C rồi dán vào trường tương ứng.
                {textLayerStatus === 'loading' && <span className="ml-1 text-blue-700">Đang kiểm tra PDF...</span>}
                {textLayerStatus === 'available' && <span className="ml-1 font-semibold">PDF có chữ để chọn.</span>}
                {textLayerStatus === 'unavailable' && <span className="ml-1">Nếu không chọn được chữ, đây là PDF scan; hãy phóng to để đọc rồi nhập tay.</span>}
              </p>
            )}
            <div className="flex min-h-0 flex-1 items-start justify-start overflow-auto p-3">
              {documentLoading && <div role="status" className="m-auto flex items-center gap-2 text-xs text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin text-blue-600" /> Đang tải hóa đơn...</div>}
              {!documentLoading && documentError && <p role="alert" className="m-auto p-6 text-center text-xs text-rose-700">Không tải được hóa đơn gốc: {documentError}</p>}
              {!documentLoading && documentUrl && isPdf && (
                <PdfCanvasViewer
                  fileUrl={documentUrl}
                  pageNumber={pageNumber}
                  zoom={zoom}
                  rotation={0}
                  onPageCount={setPageCount}
                  onTextLayerStatus={setTextLayerStatus}
                />
              )}
              {!documentLoading && documentUrl && !isPdf && (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-200/40 p-3">
                  <img src={documentUrl} alt={`Hóa đơn gốc ${invoice.fileName}`} className="max-h-full max-w-full rounded bg-white object-contain shadow" />
                </div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="sticky top-4 flex h-[calc(100vh-17rem)] min-h-[320px] max-h-[720px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-600">
              <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-blue-600" /> Đang tải dữ liệu OCR...
            </div>
          ) : draft ? (
            <>
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FileCheck2 aria-hidden="true" className="h-4 w-4 text-blue-600" />
                  Trường hóa đơn cần kiểm tra
                </h2>
                <p className="mt-1 text-xs text-slate-500">Sửa giá trị theo PDF; khi lưu, dữ liệu và các dòng hàng sẽ được cập nhật trong CSDL.</p>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Thông tin chung</legend>
                  <label className="text-xs font-semibold text-slate-700">Số hóa đơn
                    <input className={inputClass} value={draft.invoice_number} onChange={(e) => updateDraft('invoice_number', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Ngày hóa đơn
                    <input className={inputClass} type="text" inputMode="text" placeholder="YYYY-MM-DD" value={draft.invoice_date} onChange={(e) => updateDraft('invoice_date', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">MST bên bán
                    <input className={inputClass} value={draft.seller_tax_code} onChange={(e) => updateDraft('seller_tax_code', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">MST bên mua
                    <input className={inputClass} value={draft.buyer_tax_code} onChange={(e) => updateDraft('buyer_tax_code', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Tiền hàng trước thuế
                    <input className={inputClass} inputMode="decimal" placeholder="Có thể dán số từ PDF" value={draft.subtotal_amount} onChange={(e) => updateDraft('subtotal_amount', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Tiền thuế
                    <input className={inputClass} inputMode="decimal" placeholder="Có thể dán số từ PDF" value={draft.tax_amount} onChange={(e) => updateDraft('tax_amount', e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Tổng tiền thanh toán
                    <input className={inputClass} inputMode="decimal" placeholder="Có thể dán số từ PDF" value={draft.total_amount} onChange={(e) => updateDraft('total_amount', e.target.value)} />
                  </label>
                </fieldset>

                <section aria-labelledby="ocr-review-lines-title">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h3 id="ocr-review-lines-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">Dòng mặt hàng</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Tên hàng, đơn vị, số lượng, đơn giá, thuế suất và thành tiền dòng.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSaved(false); setDraft({ ...draft, items: [...draft.items, emptyLine()] }); }}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Thêm dòng
                    </button>
                  </div>

                  {draft.items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
                      OCR chưa tạo dòng hàng. Bấm “Thêm dòng” để nhập các mặt hàng nhìn thấy trên PDF.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draft.items.map((line, index) => (
                        <fieldset key={index} className="rounded-xl border border-slate-200 p-3">
                          <legend className="px-1 text-xs font-bold text-slate-700">Dòng {index + 1}</legend>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <label className="sm:col-span-2 text-[11px] font-semibold text-slate-600">Tên mặt hàng
                              <input className={inputClass} value={line.name} onChange={(e) => updateLine(index, 'name', e.target.value)} />
                            </label>
                            <label className="text-[11px] font-semibold text-slate-600">Đơn vị tính
                              <input className={inputClass} value={line.unit} onChange={(e) => updateLine(index, 'unit', e.target.value)} />
                            </label>
                            <label className="text-[11px] font-semibold text-slate-600">Số lượng
                              <input className={inputClass} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} />
                            </label>
                            <label className="text-[11px] font-semibold text-slate-600">Đơn giá
                              <input className={inputClass} inputMode="decimal" value={line.unit_price} onChange={(e) => updateLine(index, 'unit_price', e.target.value)} />
                            </label>
                            <label className="text-[11px] font-semibold text-slate-600">Thuế suất (%)
                              <input className={inputClass} inputMode="decimal" value={line.tax_rate} onChange={(e) => updateLine(index, 'tax_rate', e.target.value)} />
                            </label>
                          <label className="sm:col-span-2 text-[11px] font-semibold text-slate-600">Thành tiền dòng
                              <input className={inputClass} inputMode="decimal" value={line.amount} onChange={(e) => updateLine(index, 'amount', e.target.value)} />
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSaved(false); setDraft({ ...draft, items: draft.items.filter((_, lineIndex) => lineIndex !== index) }); }}
                            className="mt-2 inline-flex min-h-8 items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> Xóa dòng này
                          </button>
                        </fieldset>
                      ))}
                    </div>
                  )}
                </section>

                <label className="block text-xs font-semibold text-slate-700">Ghi chú rà soát
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={draft.review_note} onChange={(e) => updateDraft('review_note', e.target.value)} />
                </label>

                {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{saveError}</p>}
                {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Đã lưu dữ liệu rà soát vào CSDL và nhật ký kiểm toán.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
                <button type="button" onClick={onBack} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  Quay lại hàng đợi
                </button>
                <button type="submit" disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  {isSaving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                  {isSaving ? 'Đang lưu...' : saved ? 'Lưu lại chỉnh sửa' : 'Lưu cập nhật'}
                </button>
              </div>
            </>
          ) : null}
        </form>
      </div>
    </section>
  );
};
