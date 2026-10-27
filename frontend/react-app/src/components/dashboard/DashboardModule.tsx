import React, { useState } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  Zap,
  Cpu,
  ArrowUpRight,
  CheckCircle,
  Building2,
  Calendar,
} from 'lucide-react';
import { InvoiceRecord, SupplierMaster } from '../../types/index.ts';
import { calculateAverageConfidence } from '../../utils/matchingEngine.ts';
import { filterByDateRange, getDashboardDateRange, getMonthPeriod } from '../../utils/dashboardMetrics.ts';
import type { WorkerStatusDTO } from '../../services/api.ts';

interface DashboardModuleProps {
  invoices: InvoiceRecord[];
  suppliers: SupplierMaster[];
  workerStatus: WorkerStatusDTO | null;
  onSelectInvoice: (code: string) => void;
  onNavigateToMatching: () => void;
  onNavigateToQueue: () => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  invoices,
  suppliers,
  workerStatus,
  onSelectInvoice,
  onNavigateToMatching,
  onNavigateToQueue,
}) => {
  const currentMonth = getMonthPeriod();
  const now = new Date();
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = getMonthPeriod(previousMonthDate);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth);
  const [customStartDate, setCustomStartDate] = useState<string>(() => getDashboardDateRange(currentMonth, '', '').start || '');
  const [customEndDate, setCustomEndDate] = useState<string>(() => getDashboardDateRange(currentMonth, '', '').end || '');
  const customRangeSelected = selectedPeriod === 'CUSTOM';
  const periodRange = getDashboardDateRange(selectedPeriod, customStartDate, customEndDate);
  const periodInvoices = filterByDateRange(invoices, (invoice) => invoice.receivedAt, periodRange);

  const totalInvoices = periodInvoices.length;
  const matchedCount = periodInvoices.filter((invoice) => invoice.status === 'MATCHED' || invoice.status === 'APPROVED').length;
  const mismatchCount = periodInvoices.filter((invoice) => invoice.status === 'MISMATCH').length;
  const needConfirmCount = periodInvoices.filter((invoice) => invoice.status === 'NEED_CONFIRM').length;
  const waitingOcrCount = periodInvoices.filter((invoice) => invoice.status === 'OCR_PENDING').length;
  const autoMatchRate = totalInvoices > 0 ? (Math.round((matchedCount / totalInvoices) * 1000) / 10).toFixed(1) : '0.0';
  const avgOcrConfidence = calculateAverageConfidence(periodInvoices.map((invoice) => invoice.header.ocrAverageConfidence));

  const anomalyMap: Record<string, { label: string; count: number; color: string }> = {
    PRICE_MISMATCH: { label: 'Lệch đơn giá PO', count: 0, color: 'bg-rose-500' },
    QUANTITY_MISMATCH: { label: 'Lệch số lượng', count: 0, color: 'bg-amber-500' },
    MATH_ERROR: { label: 'Sai tổng tiền / phép tính', count: 0, color: 'bg-purple-500' },
    LOW_OCR_CONFIDENCE: { label: 'Điểm OCR thấp', count: 0, color: 'bg-indigo-500' },
    NO_PO: { label: 'Chưa liên kết PO', count: 0, color: 'bg-slate-400' },
    OTHER: { label: 'Sai lệch khác', count: 0, color: 'bg-blue-500' },
  };
  const anomalyGroupByType: Record<string, string> = {
    PRICE_MISMATCH: 'PRICE_MISMATCH',
    QUANTITY_MISMATCH: 'QUANTITY_MISMATCH',
    QTY_MISMATCH: 'QUANTITY_MISMATCH',
    GR_QUANTITY_MISMATCH: 'QUANTITY_MISMATCH',
    DELIVERY_SHORT: 'QUANTITY_MISMATCH',
    DELIVERY_WRONG: 'QUANTITY_MISMATCH',
    MATH_ERROR: 'MATH_ERROR',
    AMOUNT_MISMATCH: 'MATH_ERROR',
    LINE_AMOUNT_MISMATCH: 'MATH_ERROR',
    LOW_OCR_CONFIDENCE: 'LOW_OCR_CONFIDENCE',
    NO_PO: 'NO_PO',
    NO_PO_MATCH: 'NO_PO',
  };
  let totalAnomalyCount = 0;
  periodInvoices.forEach((invoice) => {
    invoice.anomalies.forEach((anomaly) => {
      totalAnomalyCount++;
      const key = anomalyGroupByType[anomaly.type] || 'OTHER';
      anomalyMap[key].count++;
    });
  });
  const anomalyBreakdown = Object.values(anomalyMap)
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, pct: totalAnomalyCount > 0 ? Math.round((item.count / totalAnomalyCount) * 100) : 0 }));

  const sevenDayBuckets: Record<string, { matched: number; mismatch: number; needConfirm: number }> = {};
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    sevenDayBuckets[key] = { matched: 0, mismatch: 0, needConfirm: 0 };
    return { key, label: date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit' }) };
  });
  invoices.forEach((invoice) => {
    const bucket = sevenDayBuckets[invoice.receivedAt?.slice(0, 10) || ''];
    if (!bucket) return;
    if (invoice.status === 'MATCHED' || invoice.status === 'APPROVED') bucket.matched++;
    else if (invoice.status === 'MISMATCH') bucket.mismatch++;
    else if (invoice.status === 'NEED_CONFIRM') bucket.needConfirm++;
  });
  const weeklyData = recentDays.map(({ key, label }) => ({ day: label, ...sevenDayBuckets[key] }));

  const supplierMetrics = suppliers.map((supplier) => {
    const supplierInvoices = periodInvoices.filter((invoice) => invoice.header.sellerTaxCode === supplier.taxCode);
    const reviewed = supplierInvoices.filter((invoice) => ['MATCHED', 'APPROVED', 'MISMATCH'].includes(invoice.status));
    const mismatched = reviewed.filter((invoice) => invoice.status === 'MISMATCH').length;
    return {
      supplier,
      invoiceCount: supplierInvoices.length,
      mismatchRate: reviewed.length > 0 ? Math.round((mismatched / reviewed.length) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.invoiceCount - a.invoiceCount).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Cpu className="h-6 w-6 text-blue-600" />
            Dashboard Thống Kê
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Số liệu lấy từ danh sách hóa đơn và thông tin máy chủ hiện có
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="text-slate-500 font-medium">Ngày tiếp nhận:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
              }}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
            >
              <option value={currentMonth}>Tháng này</option>
              <option value={previousMonth}>Tháng trước</option>
              <option value="LAST_90_DAYS">90 ngày gần nhất</option>
              <option value="ALL">Toàn bộ thời gian</option>
              <option value="CUSTOM">Tùy chọn khoảng ngày...</option>
            </select>
          </div>
          {customRangeSelected && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs shadow-2xs animate-fade-in">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500 font-mono"
              />
              <span className="text-slate-400 font-semibold">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}
          <button
            onClick={onNavigateToQueue}
            className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            Quản lý hàng đợi
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Thẻ KPI Tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Tổng hóa đơn tiếp nhận</span>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <FileCheck2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{totalInvoices}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Hóa đơn thuộc khoảng ngày đã chọn
          </div>
        </div>

        {/* KPI 2 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Tỷ lệ hóa đơn đã khớp</span>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{autoMatchRate}%</span>
            <span className="text-xs font-medium text-slate-600">
              (Độ tin cậy OCR TB: <strong className="text-blue-700">{avgOcrConfidence == null ? '—' : `${avgOcrConfidence.toFixed(1)}%`}</strong>)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Trạng thái theo kết quả đối soát đã lưu
          </div>
        </div>

        {/* KPI 3 */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase">Sai lệch chờ xử lý</span>
            <span className="rounded-lg bg-rose-100 p-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">{mismatchCount}</span>
            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              +{needConfirmCount} cần xác nhận
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-rose-600">Cần kế toán can thiệp</span>
            <button
              onClick={onNavigateToMatching}
              className="font-semibold text-rose-700 underline hover:text-rose-800 cursor-pointer"
            >
              Xem ngay &rarr;
            </button>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Chờ xử lý OCR</span>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Zap className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600">{waitingOcrCount}</span>
            <span className="text-xs font-medium text-slate-400">hóa đơn</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Chưa lưu thời gian xử lý OCR để tính tốc độ trung bình
          </div>
        </div>
      </div>

      {/* Cụm Biểu đồ: Stacked Bar Chart & Doughnut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Bar Chart (2 Cột) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Hóa đơn tiếp nhận trong 7 ngày gần nhất
              </h2>
              <p className="text-xs text-slate-500">
                Phân bổ theo trạng thái Khớp hoàn toàn, Phát hiện sai lệch và Cần xác nhận
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Khớp hoàn toàn
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Sai lệch (Mismatch)
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Cần xác nhận
              </span>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="space-y-4 pt-2">
            {weeklyData.map((item) => {
              const total = item.matched + item.mismatch + item.needConfirm;
              const matchedPct = total > 0 ? (item.matched / total) * 100 : 0;
              const mismatchPct = total > 0 ? (item.mismatch / total) * 100 : 0;
              const needConfirmPct = total > 0 ? (item.needConfirm / total) * 100 : 0;

              return (
                <div key={item.day} className="flex items-center gap-3 text-xs">
                  <span className="w-16 font-medium text-slate-600 shrink-0">{item.day}</span>
                  <div className="flex-1 flex h-6 overflow-hidden rounded-md bg-slate-100">
                    <div
                      style={{ width: `${matchedPct}%` }}
                      className="bg-emerald-500 transition-all flex items-center justify-center text-[10px] text-white font-bold"
                      title={`Khớp: ${item.matched}`}
                    >
                      {item.matched > 15 ? item.matched : ''}
                    </div>
                    <div
                      style={{ width: `${mismatchPct}%` }}
                      className="bg-rose-500 transition-all flex items-center justify-center text-[10px] text-white font-bold"
                      title={`Sai lệch: ${item.mismatch}`}
                    >
                      {item.mismatch > 2 ? item.mismatch : ''}
                    </div>
                    <div
                      style={{ width: `${needConfirmPct}%` }}
                      className="bg-amber-400 transition-all flex items-center justify-center text-[10px] text-slate-900 font-bold"
                      title={`Cần xác nhận: ${item.needConfirm}`}
                    >
                      {item.needConfirm > 1 ? item.needConfirm : ''}
                    </div>
                  </div>
                  <span className="w-12 text-right font-mono text-slate-500 shrink-0">
                    {total} HĐ
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Doughnut Chart Cơ cấu Sai lệch (1 Cột) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900">Cơ cấu Các loại Sai lệch Phát hiện</h2>
              <p className="text-xs text-slate-500">Phân tích nguyên nhân vi phạm quy tắc kế toán</p>
            </div>

            {/* Doughnut Bar Breakdown List */}
            <div className="space-y-3">
              {anomalyBreakdown.map((item) => (
                <div key={item.label} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-700 font-medium truncate pr-2">{item.label}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {item.pct}% ({item.count})
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      style={{ width: `${item.pct}%` }}
                      className={`h-full ${item.color} rounded-full`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 border border-slate-200/80 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-800">Nhận xét hệ thống:</span>{' '}
            {totalAnomalyCount > 0
              ? `Ghi nhận ${totalAnomalyCount} cảnh báo sai lệch từ dữ liệu thực tế. Cần kế toán viên kiểm tra lại đơn giá, số lượng và thông tin hóa đơn.`
              : 'Hiện chưa phát hiện sai lệch nào trên các hồ sơ hóa đơn.'}
          </div>
        </div>
      </div>

      {/* Hàng 3: trạng thái tác vụ và thống kê nhà cung cấp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-600" />
                Tác vụ tiếp nhận tự động
              </h2>
              <p className="text-xs text-slate-500">Trạng thái worker do máy chủ trả về</p>
            </div>
            <span className={workerStatus?.active ? 'rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold' : 'rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-[11px] font-bold'}>
              {workerStatus ? (workerStatus.active ? 'Đang theo dõi' : 'Chưa cấu hình') : 'Chưa có trạng thái'}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-800">
              {workerStatus?.mode === 'local_folder_poll' ? 'Quét thư mục inbox cục bộ' : 'Quét thư mục inbox'}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {workerStatus?.message || 'Chưa nhận được trạng thái từ API máy chủ.'}
            </p>
            <p className="mt-3 text-[11px] text-slate-500">
              Email/IMAP và thư mục SMB chưa được kết nối. Dashboard chưa có API nhật ký cho từng tệp.
            </p>
          </div>
        </div>

        {/* Bảng Top Nhà cung cấp & Tỷ lệ Sai lệch */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                Nhà cung cấp trong kỳ
              </h2>
              <p className="text-xs text-slate-500">Số hóa đơn và tỷ lệ sai lệch tính từ dữ liệu hiện có</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-2 font-semibold">Nhà cung cấp</th>
                  <th className="pb-2 font-semibold">Mã số thuế</th>
                  <th className="pb-2 font-semibold text-center">Số HĐ nhận</th>
                  <th className="pb-2 font-semibold text-right">Tỷ lệ sai lệch*</th>
                  <th className="pb-2 font-semibold text-center">Tra cứu MST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {supplierMetrics.length > 0 ? (
                  supplierMetrics.map(({ supplier: sup, invoiceCount, mismatchRate }) => (
                    <tr key={sup.code} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-medium text-slate-900 max-w-[160px] truncate">
                        {sup.name}
                      </td>
                      <td className="py-2.5 font-mono text-slate-500">{sup.taxCode}</td>
                      <td className="py-2.5 text-center font-bold text-slate-800">
                        {invoiceCount}
                      </td>
                      <td className="py-2.5 text-right font-bold">
                        <span
                          className={mismatchRate == null ? 'inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500' : mismatchRate > 15 ? 'inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-700' : mismatchRate > 5 ? 'inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700' : 'inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700'}
                        >
                          {mismatchRate == null ? '—' : String(mismatchRate) + '%'}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="inline-flex items-center text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          Chưa tra cứu
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                      Chưa có dữ liệu nhà cung cấp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-slate-400">* Tính trên các hóa đơn đã đối soát; trạng thái MST chỉ hiển thị khi có dịch vụ tra cứu.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
