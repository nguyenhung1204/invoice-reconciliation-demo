import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Layers,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, type BackendInvoiceDTO, type SupplierDTO } from '../../services/api.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { INVOICE_STATUS_LABELS as statusName } from '../../utils/invoiceMath.ts';

const statusChoices = [
  ['all', 'Tất cả trạng thái'], ['needs_review', 'Cần xác nhận'], ['ocr_done', 'OCR hoàn tất'],
  ['reviewed', 'Đã rà soát'], ['matched', 'Khớp hoàn toàn'], ['mismatch', 'Phát hiện sai lệch'],
  ['approved', 'Đã phê duyệt'], ['archived', 'Đã lưu trữ'],
] as const;


function Badge({ status }: { status: string }) {
  const config = status === 'matched' || status === 'approved'
    ? { text: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
    : status === 'mismatch'
      ? { text: 'bg-rose-100 text-rose-800', icon: <AlertTriangle className="h-3.5 w-3.5" /> }
      : ['needs_review', 'reviewed'].includes(status)
        ? { text: 'bg-amber-100 text-amber-800', icon: <Clock3 className="h-3.5 w-3.5" /> }
        : { text: 'bg-blue-100 text-blue-800', icon: <RefreshCw className="h-3.5 w-3.5" /> };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${config.text}`}>{config.icon}{statusName[status] ?? status}</span>;
}

export function LegacyQueueModule({
  invoices,
  suppliers,
  isAdmin,
  loading,
  loadError,
  onReload,
  onOpenReview,
}: {
  invoices: BackendInvoiceDTO[];
  suppliers: SupplierDTO[];
  isAdmin: boolean;
  loading: boolean;
  loadError: string;
  onReload: () => void;
  onOpenReview: (invoiceId: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof statusChoices)[number][0]>('all');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BackendInvoiceDTO | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [archivedInvoices, setArchivedInvoices] = useState<BackendInvoiceDTO[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  useEffect(() => {
    if (status !== 'archived') return;
    let active = true;
    setArchivedLoading(true);
    api.listInvoices('archived')
      .then((rows) => { if (active) setArchivedInvoices(rows); })
      .catch(() => { if (active) setArchivedInvoices([]); })
      .finally(() => { if (active) setArchivedLoading(false); });
    return () => { active = false; };
  }, [status]);

  const supplierNames = useMemo(() => new Map(suppliers.map((supplier) => [supplier.tax_code, supplier.name])), [suppliers]);
  const sourceInvoices = status === 'archived' ? archivedInvoices : invoices;
  const visible = useMemo(() => sourceInvoices.filter((invoice) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [invoice.original_name, invoice.invoice_number, invoice.seller_tax_code, invoice.po_number, String(invoice.id)]
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesSearch && (status === 'all' || invoice.status === status);
  }), [sourceInvoices, search, status]);

  const uploadFiles = async (files: FileList | File[]) => {
    const batch = Array.from(files).filter((file) => /\.(pdf|png|jpe?g)$/i.test(file.name));
    if (!batch.length) {
      setMessage({ kind: 'error', text: 'Chọn tệp PDF, PNG hoặc JPG để tải lên.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    const added: number[] = [];
    const failures: string[] = [];
    for (const file of batch) {
      try {
        const invoice = await api.uploadInvoice(file);
        added.push(invoice.id);
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'Tải lên thất bại'}`);
      }
    }
    setUploading(false);
    if (input.current) input.current.value = '';
    onReload();
    if (failures.length) setMessage({ kind: 'error', text: `${added.length} tệp đã nhận bởi backend. ${failures.join(' · ')}` });
    else setMessage({ kind: 'success', text: `Backend đã nhận ${added.length} tệp${added.length ? ` (ID: ${added.join(', ')})` : ''}. Trạng thái OCR lấy từ máy chủ.` });
  };

  const openDetail = async (id: number) => {
    setDetailBusy(true);
    setDetail(null);
    setMessage(null);
    try { setDetail(await api.getInvoice(id)); }
    catch (cause) { setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Không tải được chi tiết hóa đơn.' }); }
    finally { setDetailBusy(false); }
  };

  const downloadFile = async (invoice: BackendInvoiceDTO) => {
    setBusyId(invoice.id);
    try {
      const blob = await api.getInvoiceFile(invoice.id);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = invoice.original_name;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (cause) { setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Không tải được file hóa đơn.' }); }
    finally { setBusyId(null); }
  };

  const retryOcr = async (invoice: BackendInvoiceDTO) => {
    setBusyId(invoice.id);
    setMessage(null);
    try {
      const result = await api.retryInvoiceOcr(invoice.id);
      setMessage({ kind: 'success', text: `Backend đã xử lý yêu cầu OCR cho hóa đơn #${result.id}. Trạng thái hiện tại: ${statusName[result.status] ?? result.status}.` });
      onReload();
    } catch (cause) { setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Không thể yêu cầu OCR lại.' }); }
    finally { setBusyId(null); }
  };

  const deleteInvoice = async (invoice: BackendInvoiceDTO) => {
    if (!window.confirm(`Xóa hóa đơn #${invoice.id} (${invoice.original_name}) khỏi backend?`)) return;
    setBusyId(invoice.id);
    setMessage(null);
    try {
      await api.deleteInvoice(invoice.id);
      setMessage({ kind: 'success', text: `Backend đã xóa hóa đơn #${invoice.id}.` });
      onReload();
    } catch (cause) { setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'Không thể xóa hóa đơn.' }); }
    finally { setBusyId(null); }
  };

  const dragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); };
  const counts = invoices.reduce<Record<string, number>>((result, invoice) => { result[invoice.status] = (result[invoice.status] ?? 0) + 1; return result; }, {});

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"><Layers className="h-6 w-6 text-blue-600" />Tiếp nhận và quản lý hóa đơn</h1><p className="mt-0.5 text-xs text-slate-500">Tiếp nhận chứng từ và theo dõi kết quả OCR, đối soát từ backend</p></div><div className="flex gap-2"><button type="button" onClick={() => setManualCreateOpen(true)} title="Mở biểu mẫu tạo hóa đơn thủ công" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5" />Tạo thủ công</button><button type="button" onClick={onReload} disabled={loading} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Làm mới</button></div></div>
    {message && <div role={message.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Đóng thông báo"><X className="h-4 w-4" /></button></div>}
    {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Không tải được dữ liệu hàng đợi: {loadError}</div>}

    <div onDragOver={dragOver} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files); }} onClick={() => !uploading && input.current?.click()} className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${dragging ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'} ${uploading ? 'cursor-wait opacity-70' : ''}`}>
      <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" disabled={uploading} onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); }} />
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">{uploading ? <RefreshCw className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}</div>
      <div className="text-sm font-bold text-slate-800">{uploading ? 'Đang gửi tệp đến backend…' : <>Kéo thả hóa đơn vào đây hoặc <span className="text-blue-600 underline">Chọn từ máy tính</span></>}</div>
      <p className="mt-1 text-xs text-slate-500">PDF (gốc/scan), PNG, JPG · File được lưu ở server và OCR do backend xử lý</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400"><span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" />Kiểm tra trùng file ở server</span><span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" />Không báo thành công khi API lỗi</span></div>
    </div>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between"><div className="text-sm font-bold text-slate-800"><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" />Hàng đợi OCR ({invoices.length} hồ sơ)</span><p className="mt-1 text-[10px] font-normal text-slate-500">Trạng thái được giữ theo kết quả máy chủ</p></div><div className="flex flex-wrap items-center gap-2"><label className="relative"><span className="sr-only">Tìm hóa đơn</span><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, số HĐ, MST, PO…" className="w-56 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-none" /></label><select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500"><option value="all">Tất cả trạng thái</option>{statusChoices.slice(1).map(([value, label]) => <option key={value} value={value}>{label} ({counts[value] ?? 0})</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-600"><tr><th className="px-4 py-3">Mã hồ sơ OCR</th><th className="px-3 py-3">Số HĐ & ký hiệu</th><th className="px-3 py-3">Nhà cung cấp</th><th className="px-3 py-3">PO tham chiếu</th><th className="px-3 py-3">Ngày lập</th><th className="px-3 py-3 text-right">Tổng thanh toán</th><th className="px-3 py-3 text-center">Độ tin cậy OCR</th><th className="px-3 py-3 text-center">Trạng thái</th><th className="px-3 py-3 text-center">Thanh toán</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">
        {visible.map((invoice) => <tr key={invoice.id} className="transition-colors hover:bg-slate-50"><td className="px-4 py-3"><div className="font-mono font-bold text-slate-800">#{invoice.id}</div><div className="max-w-52 truncate text-[10px] text-slate-500" title={invoice.original_name}>{invoice.original_name}</div></td><td className="px-3 py-3"><div className="font-mono font-semibold text-slate-800">{invoice.invoice_number || '—'}</div><div className="text-[10px] text-slate-500">Backend chưa trả ký hiệu riêng</div></td><td className="px-3 py-3"><div className="max-w-48 truncate font-medium text-slate-800">{supplierNames.get(invoice.seller_tax_code) ?? invoice.seller_tax_code ?? '—'}</div><div className="font-mono text-[10px] text-slate-500">{invoice.seller_tax_code || 'Chưa nhận dạng MST'}</div></td><td className="px-3 py-3 font-mono text-blue-700">{invoice.po_number || '—'}</td><td className="px-3 py-3 text-slate-600">{invoice.invoice_date || '—'}</td><td className="px-3 py-3 text-right font-mono font-semibold">{invoice.total_amount == null ? '—' : formatCurrencyVND(invoice.total_amount)}</td><td className="px-3 py-3 text-center font-mono">{invoice.ocr_confidence == null ? '—' : `${(invoice.ocr_confidence * 100).toFixed(1)}%`}</td><td className="px-3 py-3 text-center"><Badge status={invoice.status} /></td><td className="px-3 py-3 text-center" title="Backend hiện chưa cung cấp trạng thái thanh toán."><span className="text-[10px] text-slate-400">Chưa hỗ trợ</span></td><td className="whitespace-nowrap px-4 py-3 text-right"><div className="inline-flex items-center gap-1"><button type="button" onClick={() => void openDetail(invoice.id)} title="Xem chi tiết" aria-label={`Xem hóa đơn ${invoice.id}`} className="cursor-pointer rounded p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Eye className="h-3.5 w-3.5" /></button><button type="button" onClick={() => onOpenReview(invoice.id)} title="Đối soát" aria-label={`Đối soát hóa đơn ${invoice.id}`} className="cursor-pointer rounded p-1.5 text-indigo-700 hover:bg-indigo-50"><Layers className="h-3.5 w-3.5" /></button><button type="button" disabled={busyId === invoice.id} onClick={() => void retryOcr(invoice)} title="Yêu cầu OCR lại" aria-label={`OCR lại hóa đơn ${invoice.id}`} className="cursor-pointer rounded p-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busyId === invoice.id ? 'animate-spin' : ''}`} /></button><button type="button" disabled={busyId === invoice.id} onClick={() => void downloadFile(invoice)} title="Tải file gốc" aria-label={`Tải file hóa đơn ${invoice.id}`} className="cursor-pointer rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"><Download className="h-3.5 w-3.5" /></button>{isAdmin && <button type="button" disabled={busyId === invoice.id} onClick={() => void deleteInvoice(invoice)} title="Xóa hóa đơn" aria-label={`Xóa hóa đơn ${invoice.id}`} className="cursor-pointer rounded p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td></tr>)}
        {!visible.length && <tr><td colSpan={10} className="py-10 text-center text-slate-400">{loading || archivedLoading ? 'Đang tải hóa đơn…' : loadError ? 'Không có dữ liệu để hiển thị.' : 'Không tìm thấy hóa đơn OCR phù hợp.'}</td></tr>}
      </tbody></table></div>
    </section>

    {manualCreateOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualCreateOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="legacy-manual-invoice-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><div><h2 id="legacy-manual-invoice-title" className="text-sm font-bold text-slate-900">Tạo hóa đơn thủ công</h2><p className="mt-1 text-[10px] text-slate-500">Biểu mẫu chưa kết nối với API lưu hóa đơn</p></div><button type="button" onClick={() => setManualCreateOpen(false)} aria-label="Đóng biểu mẫu" className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-4 p-5"><div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Backend hiện chỉ tạo hồ sơ hóa đơn từ tệp tải lên. Các trường dưới đây đang khóa và không được lưu; hãy dùng khu vực tải tệp để tạo hồ sơ thật.</div><div className="grid gap-3 sm:grid-cols-2">{[['Số hóa đơn', 'Nhập số hóa đơn'], ['Ngày lập', 'YYYY-MM-DD'], ['Mã số thuế người bán', 'MST người bán'], ['Mã số thuế người mua', 'MST người mua'], ['Số đơn đặt hàng (PO)', 'PO tham chiếu'], ['Tổng thanh toán', 'VND']].map(([label, placeholder]) => <label key={label} className="space-y-1 text-[11px] font-medium text-slate-600"><span>{label}</span><input disabled placeholder={placeholder} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500 placeholder:text-slate-400" /></label>)}</div><label className="block space-y-1 text-[11px] font-medium text-slate-600"><span>Ghi chú</span><textarea disabled rows={3} placeholder="Ghi chú cho hóa đơn" className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500 placeholder:text-slate-400" /></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setManualCreateOpen(false)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Đóng</button><button type="button" disabled title="Chưa có API tạo hóa đơn thủ công." className="cursor-not-allowed rounded-lg bg-blue-300 px-3 py-2 text-xs font-semibold text-white">Lưu hóa đơn · chưa hỗ trợ</button></div></div></section></div>}

    {(detailBusy || detail) && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section role="dialog" aria-modal="true" aria-labelledby="legacy-invoice-detail-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><div><h2 id="legacy-invoice-detail-title" className="text-sm font-bold text-slate-900">Chi tiết hóa đơn {detail ? `#${detail.id}` : ''}</h2>{detail && <p className="mt-0.5 text-[10px] text-slate-500">{detail.original_name}</p>}</div><button type="button" onClick={() => setDetail(null)} aria-label="Đóng chi tiết" className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>{detailBusy ? <div className="p-8 text-center text-xs text-slate-500"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Đang tải chi tiết hóa đơn…</div> : detail && <div className="space-y-5 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Trạng thái', statusName[detail.status] ?? detail.status], ['Số hóa đơn', detail.invoice_number || '—'], ['Ngày lập', detail.invoice_date || '—'], ['MST người bán', detail.seller_tax_code || '—'], ['MST người mua', detail.buyer_tax_code || '—'], ['PO tham chiếu', detail.po_number || '—'], ['Tổng thanh toán', detail.total_amount == null ? '—' : formatCurrencyVND(detail.total_amount)], ['Độ tin cậy OCR', detail.ocr_confidence == null ? '—' : `${(detail.ocr_confidence * 100).toFixed(1)}%`], ['Tiếp nhận', new Date(detail.created_at).toLocaleString('vi-VN')]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</div></div>)}</div><div className="flex justify-end"><button type="button" onClick={() => void downloadFile(detail)} disabled={busyId === detail.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Download className="h-3.5 w-3.5" />Tải file gốc</button></div><div><h3 className="mb-2 text-xs font-bold text-slate-800">Dòng hàng OCR ({detail.items.length})</h3><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Mặt hàng</th><th className="px-3 py-2 text-right">SL</th><th className="px-3 py-2 text-right">Đơn giá</th><th className="px-3 py-2 text-right">Thành tiền</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.items.map((item, index) => <tr key={`${index}-${item.name ?? item.description}`}><td className="px-3 py-2">{item.name ?? item.description ?? '—'}</td><td className="px-3 py-2 text-right">{item.quantity ?? '—'}</td><td className="px-3 py-2 text-right">{item.unit_price == null ? '—' : formatCurrencyVND(item.unit_price)}</td><td className="px-3 py-2 text-right">{item.amount == null ? '—' : formatCurrencyVND(item.amount)}</td></tr>)}{!detail.items.length && <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-400">Backend chưa trả dòng hàng OCR.</td></tr>}</tbody></table></div></div>{detail.warnings.length > 0 && <div><h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" />Cảnh báo từ backend</h3><ul className="list-inside list-disc space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{detail.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message ?? warning.code}</li>)}</ul></div>}<details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Văn bản OCR gốc</summary><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">{detail.ocr_text || 'Backend chưa trả văn bản OCR.'}</pre></details></div>}</section></div>}
  </div>;
}
