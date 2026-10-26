import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Cpu,
  FileText,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { BackendInvoiceDTO, DashboardDTO, WorkerStatusDTO } from '../../services/api.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';

const warningLabels: Record<string, string> = {
  PRICE_MISMATCH: 'Lệch đơn giá hợp đồng (PO)',
  QUANTITY_MISMATCH: 'Lệch số lượng',
  MATH_ERROR: 'Sai số học trên hóa đơn',
  DUPLICATE_INVOICE: 'Hóa đơn trùng lặp',
  PO_NOT_FOUND: 'Không tìm thấy PO tham chiếu',
  LOW_OCR_CONFIDENCE: 'Độ tin cậy OCR thấp',
  TAX_CODE_RISK: 'Cảnh báo mã số thuế',
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    needs_review: 'Cần rà soát', ocr_done: 'OCR hoàn tất', reviewed: 'Đã rà soát',
    matched: 'Khớp', mismatch: 'Sai lệch', approved: 'Đã phê duyệt', archived: 'Lưu trữ',
  };
  return labels[value] ?? value;
}

export function LegacyDashboardModule({
  dashboard,
  worker,
  invoices,
  loading,
  error,
  canScan,
  scanBusy,
  scanMessage,
  onRetry,
  onScanNow,
  onNavigateToMatching,
  onNavigateToQueue,
  onOpenInvoice,
}: {
  dashboard: DashboardDTO | null;
  worker: WorkerStatusDTO | null;
  invoices: BackendInvoiceDTO[];
  loading: boolean;
  error: string;
  canScan: boolean;
  scanBusy: boolean;
  scanMessage: string;
  onRetry: () => void;
  onScanNow: () => void;
  onNavigateToMatching: () => void;
  onNavigateToQueue: () => void;
  onOpenInvoice?: (id: number) => void;
}) {
  const matched = (dashboard?.by_status.matched ?? 0) + (dashboard?.by_status.approved ?? 0);
  const mismatch = dashboard?.by_status.mismatch ?? 0;
  const total = dashboard?.total ?? 0;
  const matchPercent = total ? Math.round(matched / total * 1000) / 10 : 0;
  const errorRows = dashboard?.error_causes ?? [];
  const errorTotal = errorRows.reduce((sum, row) => sum + row.count, 0);
  const week = dashboard?.weekly ?? [];
  const maxDay = Math.max(1, ...week.map((day) => day.matched + day.mismatch + day.review));

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"><Cpu className="h-6 w-6 text-blue-600" />Dashboard Thống Kê & Giám Sát Tiến Trình RPA</h1><p className="mt-0.5 text-xs text-slate-500">Giám sát quy trình tự động trích xuất OCR và đối soát 3 bên theo Thông tư 78/2021/TT-BTC</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs" title="Dashboard API chưa hỗ trợ lọc theo kỳ.">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <span className="font-medium text-slate-500">Kỳ báo cáo</span>
          <select aria-label="Kỳ báo cáo" disabled className="max-w-40 cursor-not-allowed border-0 bg-transparent p-0 pr-5 text-xs font-bold text-slate-900 opacity-100 outline-none">
            <option>Toàn bộ dữ liệu · xu hướng 7 ngày</option>
            <option>Tháng này</option>
            <option>Quý này</option>
            <option>Năm nay</option>
            <option>Tùy chọn ngày</option>
          </select>
        </label>
        <button type="button" onClick={onNavigateToQueue} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">Mở hàng đợi <ArrowRight className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onRetry} disabled={loading} aria-label="Tải lại dashboard" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>

    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><span>{error}</span><button type="button" onClick={onRetry} className="font-semibold underline">Thử lại</button></div>}
    {scanMessage && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{scanMessage}</div>}

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Tổng hóa đơn tiếp nhận" value={loading && !dashboard ? '…' : String(total)} detail="Số liệu do API dashboard trả về" icon={<FileText className="h-5 w-5" />} color="blue" />
      <KpiCard label="Khớp tự động / đã duyệt" value={`${matchPercent.toFixed(1)}%`} detail={`${matched} trên ${total} hóa đơn`} icon={<CheckCircle2 className="h-5 w-5" />} color="green" />
      <KpiCard label="Sai lệch chờ xử lý" value={String(mismatch + (dashboard?.needs_review ?? 0))} detail={`${mismatch} hóa đơn có trạng thái sai lệch`} icon={<AlertTriangle className="h-5 w-5" />} color="rose" action={onNavigateToMatching} />
      <KpiCard label="RPA Worker" value={worker ? (worker.active ? 'Đang hoạt động' : 'Tạm dừng') : 'Đang tải…'} detail={worker?.message ?? 'Trạng thái do API worker trả về'} icon={<ScanLine className="h-5 w-5" />} color="indigo" />
    </div>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h2 className="text-sm font-bold text-slate-900">Xu hướng Đối soát Hóa đơn 7 ngày gần nhất</h2><p className="text-xs text-slate-500">Phân bổ theo trạng thái trả về từ backend</p></div><div className="flex flex-wrap gap-3 text-[11px] text-slate-600"><Legend color="bg-emerald-500" label="Khớp" /><Legend color="bg-rose-500" label="Sai lệch" /><Legend color="bg-amber-400" label="Cần rà soát" /></div></div>
        {week.length ? <div className="grid min-h-48 grid-cols-7 items-end gap-3 border-b border-slate-200 px-1 pb-2">{week.map((day) => {
          const dayTotal = day.matched + day.mismatch + day.review;
          const height = Math.max(6, dayTotal / maxDay * 100);
          const matchedHeight = dayTotal ? day.matched / dayTotal * height : 0;
          const mismatchHeight = dayTotal ? day.mismatch / dayTotal * height : 0;
          const reviewHeight = dayTotal ? day.review / dayTotal * height : 0;
          return <div key={day.day} className="flex h-full flex-col items-center justify-end gap-2 text-center"><span className="text-[10px] font-mono text-slate-500">{dayTotal}</span><div title={`${dayTotal} hóa đơn`} className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md bg-slate-100" style={{ height: `${height}%`, minHeight: 6 }}><span className="bg-amber-400" style={{ height: `${reviewHeight}px` }} /><span className="bg-rose-500" style={{ height: `${mismatchHeight}px` }} /><span className="bg-emerald-500" style={{ height: `${matchedHeight}px` }} /></div><span className="text-[10px] text-slate-500">{dateLabel(day.day)}</span></div>;
        })}</div> : <EmptyState loading={loading} label="Backend chưa có dữ liệu xu hướng 7 ngày." />}
        <p className="mt-3 text-[10px] text-slate-400">Biểu đồ dùng số liệu API; không có dữ liệu mẫu hoặc chỉ số giả lập.</p>
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs">
        <div className="mb-4 border-b border-rose-100 pb-3"><h2 className="text-sm font-bold text-slate-900">Cơ cấu các loại sai lệch</h2><p className="text-xs text-slate-500">Phân tích nguyên nhân theo quy tắc backend</p></div>
        {errorRows.length ? <div className="space-y-3">{errorRows.map((row) => <div key={row.code}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="text-slate-700">{warningLabels[row.code] ?? row.code}</span><strong className="font-mono text-slate-900">{row.count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-rose-500" style={{ width: `${errorTotal ? row.count / errorTotal * 100 : 0}%` }} /></div></div>)}</div> : <EmptyState loading={loading} label="Chưa có cảnh báo từ backend." />}
      </section>
    </div>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-1">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Cpu className="h-4 w-4 text-blue-600" />Giám sát Worker</h2><p className="text-xs text-slate-500">{worker?.mode ?? 'Chế độ chưa được báo cáo'}</p></div>{canScan && <button type="button" onClick={onScanNow} disabled={scanBusy} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${scanBusy ? 'animate-spin' : ''}`} />Quét ngay</button>}</div>
        <div className={`rounded-lg border p-4 text-xs ${worker?.active ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex items-center gap-2 font-semibold">{worker?.active ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}{worker?.active ? 'Worker đang hoạt động' : 'Worker chưa hoạt động'}</div><p className="mt-1 leading-relaxed">{worker?.message ?? 'Đang tải trạng thái worker.'}</p>{!canScan && <p className="mt-2 text-[10px] opacity-80">Chỉ quản trị viên được gọi quét thủ công.</p>}</div>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-700">Lịch chạy định kỳ</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Chưa có dữ liệu API</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[10px] text-slate-500">Chu kỳ<input aria-label="Chu kỳ chạy scheduler" disabled value="Backend chưa công bố lịch" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500" /></label>
            <label className="grid gap-1 text-[10px] text-slate-500">Lần chạy tiếp theo<input aria-label="Lần chạy scheduler tiếp theo" disabled value="Không có trong API hiện tại" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500" /></label>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Lịch sử từng lần quét cũng chưa được backend cung cấp; nút quét thủ công gọi API thật.</p>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Building2 className="h-4 w-4 text-blue-600" />Nhà cung cấp có nhiều hóa đơn</h2><p className="text-xs text-slate-500">{dashboard?.supplier_count ?? 0} nhà cung cấp trong danh mục</p></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><th className="pb-2">Nhà cung cấp</th><th className="pb-2">Mã số thuế</th><th className="pb-2 text-right">Số HĐ nhận</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard?.top_suppliers.map((supplier) => <tr key={supplier.tax_code}><td className="max-w-64 truncate py-2.5 font-medium text-slate-900" title={supplier.name}>{supplier.name}</td><td className="py-2.5 font-mono text-slate-500">{supplier.tax_code}</td><td className="py-2.5 text-right font-bold">{supplier.invoices}</td></tr>)}{!dashboard?.top_suppliers.length && <tr><td colSpan={3} className="py-8 text-center text-slate-400">Chưa có dữ liệu nhà cung cấp.</td></tr>}</tbody></table></div>
      </section>
    </div>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><h2 className="text-sm font-bold text-slate-900">Hóa đơn mới tiếp nhận</h2><p className="mt-1 text-[11px] text-slate-500">Theo dõi chất lượng chứng từ và trạng thái xử lý backend</p></div><button type="button" onClick={onNavigateToQueue} className="text-xs font-semibold text-blue-700 hover:underline">Xem tất cả hàng đợi →</button></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600"><tr><th className="px-4 py-3">Mã HĐ / tệp</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Thời gian tiếp nhận</th><th className="px-3 py-3 text-right">Tổng thanh toán</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard?.recent.map((invoice) => <tr key={invoice.id} className="hover:bg-slate-50"><td className="px-4 py-3"><span className="font-mono font-bold text-slate-800">#{invoice.id}</span><span className="ml-2 text-slate-600">{invoice.name}</span></td><td className="px-3 py-3"><StatusBadge status={invoice.status} /></td><td className="px-3 py-3 text-slate-500">{new Date(invoice.created_at).toLocaleString('vi-VN')}</td><td className="px-3 py-3 text-right font-mono">{invoice.amount === null ? '—' : formatCurrencyVND(invoice.amount)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => onOpenInvoice ? onOpenInvoice(invoice.id) : onNavigateToQueue()} className="cursor-pointer font-semibold text-blue-700 hover:underline">Đối soát →</button></td></tr>)}{!dashboard?.recent.length && <tr><td colSpan={5} className="py-8 text-center text-slate-400">{loading ? 'Đang tải…' : 'Chưa có hóa đơn.'}</td></tr>}</tbody></table></div>
    </section>
    <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><CircleAlert className="h-3.5 w-3.5" />Các thống kê và trạng thái trên màn hình lấy từ FastAPI; chức năng báo cáo chi tiết nằm trong phân hệ Báo cáo.</p>
  </div>;
}

function KpiCard({ label, value, detail, icon, color, action }: { label: string; value: string; detail: string; icon: ReactNode; color: 'blue' | 'green' | 'rose' | 'indigo'; action?: () => void }) {
  const tone = { blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-100 text-rose-600', indigo: 'bg-indigo-50 text-indigo-600' }[color];
  return <article className={`rounded-xl border p-4 shadow-xs ${color === 'rose' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone}`}>{icon}</span></div><div className="mt-3 text-2xl font-bold text-slate-900">{value}</div><div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{detail}</span>{action && <button type="button" onClick={action} className="shrink-0 cursor-pointer font-semibold text-rose-700 underline">Xem ngay</button>}</div></article>;
}

function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>; }
function EmptyState({ loading, label }: { loading: boolean; label: string }) { return <div className="py-8 text-center text-xs text-slate-400">{loading ? 'Đang tải dữ liệu…' : label}</div>; }
function StatusBadge({ status }: { status: string }) {
  const matched = status === 'matched' || status === 'approved';
  const mismatch = status === 'mismatch';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${matched ? 'bg-emerald-100 text-emerald-800' : mismatch ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{matched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{statusLabel(status)}</span>;
}
