import React, { useState } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  Zap,
  TrendingUp,
  Cpu,
  ShieldAlert,
  Clock,
  ArrowUpRight,
  Filter,
  CheckCircle,
  XCircle,
  Building2,
  Calendar,
} from 'lucide-react';
import { InvoiceRecord, RpaScanLog, SupplierMaster } from '../../types/index.ts';

interface DashboardModuleProps {
  invoices: InvoiceRecord[];
  suppliers: SupplierMaster[];
  rpaLogs: RpaScanLog[];
  onSelectInvoice: (code: string) => void;
  onNavigateToMatching: () => void;
  onNavigateToQueue: () => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  invoices,
  suppliers,
  rpaLogs,
  onSelectInvoice,
  onNavigateToMatching,
  onNavigateToQueue,
}) => {
  // Tính toán số liệu thống kê thực tế
  const totalInvoices = invoices.length;
  const matchedCount = invoices.filter((i) => i.status === 'MATCHED').length;
  const mismatchCount = invoices.filter((i) => i.status === 'MISMATCH').length;
  const needConfirmCount = invoices.filter((i) => i.status === 'NEED_CONFIRM').length;

  const autoMatchRate = invoices.length > 0
    ? (Math.round((matchedCount / invoices.length) * 1000) / 10).toFixed(1)
    : '0.0';
  const avgOcrConfidence = invoices.length > 0
    ? (
        invoices.reduce((sum, i) => sum + i.header.ocrAverageConfidence, 0) /
        invoices.length
      ).toFixed(1)
    : '0.0';

  // Phân tích cơ cấu sai lệch thực tế từ danh sách hóa đơn
  const anomalyMap: Record<string, { label: string; count: number; color: string }> = {
    PRICE_MISMATCH: { label: 'Lệch đơn giá hợp đồng (PO)', count: 0, color: 'bg-rose-500' },
    QUANTITY_MISMATCH: { label: 'Lệch số lượng thực nhập (GR)', count: 0, color: 'bg-amber-500' },
    MATH_ERROR: { label: 'Sai công thức thuế / tiền TT78', count: 0, color: 'bg-purple-500' },
    SHA256_DUPLICATE: { label: 'Trùng mã băm SHA-256', count: 0, color: 'bg-blue-500' },
    NO_PO_MATCH: { label: 'Chưa liên kết PO tham chiếu', count: 0, color: 'bg-slate-400' },
  };

  let totalAnomalyCount = 0;
  invoices.forEach((inv) => {
    inv.anomalies.forEach((a) => {
      totalAnomalyCount++;
      const key = a.type in anomalyMap ? a.type : 'NO_PO_MATCH';
      anomalyMap[key].count++;
    });
  });

  const anomalyBreakdown = Object.values(anomalyMap)
    .filter((item) => totalAnomalyCount === 0 || item.count > 0)
    .map((item) => ({
      ...item,
      pct: totalAnomalyCount > 0 ? Math.round((item.count / totalAnomalyCount) * 100) : 0,
    }));

  // Dữ liệu phân bổ theo ngày thực tế từ hóa đơn
  const dateGroups: Record<string, { matched: number; mismatch: number; needConfirm: number }> = {};
  invoices.forEach((inv) => {
    const rawDate = inv.header.issueDate || inv.receivedAt?.slice(0, 10) || 'Hôm nay';
    if (!dateGroups[rawDate]) {
      dateGroups[rawDate] = { matched: 0, mismatch: 0, needConfirm: 0 };
    }
    if (inv.status === 'MATCHED') dateGroups[rawDate].matched++;
    else if (inv.status === 'MISMATCH') dateGroups[rawDate].mismatch++;
    else if (inv.status === 'NEED_CONFIRM') dateGroups[rawDate].needConfirm++;
  });

  const weeklyData = Object.keys(dateGroups).length > 0
    ? Object.entries(dateGroups)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([day, stats]) => ({
          day,
          ...stats,
        }))
    : [{ day: 'Hôm nay', matched: matchedCount, mismatch: mismatchCount, needConfirm: needConfirmCount }];

  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-10-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-10-31');
  const [showCustomDate, setShowCustomDate] = useState<boolean>(false);

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Cpu className="h-6 w-6 text-blue-600" />
            Dashboard Thống Kê & Giám Sát Tiến Trình RPA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Giám sát quy trình tự động trích xuất OCR và đối soát 3 bên theo Thông tư 78/2021/TT-BTC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="text-slate-500 font-medium">Kỳ kế toán:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                setShowCustomDate(e.target.value === 'CUSTOM');
              }}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
            >
              <option value="2026-10">Tháng 10/2026 (Kỳ hiện tại)</option>
              <option value="2026-09">Tháng 09/2026</option>
              <option value="2026-08">Tháng 08/2026</option>
              <option value="2026-Q4">Quý IV / 2026</option>
              <option value="2026-Q3">Quý III / 2026</option>
              <option value="2026-YEAR">Cả năm 2026</option>
              <option value="CUSTOM">Tùy chọn khoảng ngày...</option>
            </select>
          </div>
          {showCustomDate && (
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
            <span className="text-xs font-medium text-emerald-600 flex items-center">
              <TrendingUp className="h-3.5 w-3.5 mr-0.5" /> +14.2%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Tiếp nhận qua Email IMAP & Thư mục SMB
          </div>
        </div>

        {/* KPI 2 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Tỷ lệ khớp tự động</span>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{autoMatchRate}%</span>
            <span className="text-xs font-medium text-slate-600">
              (Độ tin cậy OCR TB: <strong className="text-blue-700">{avgOcrConfidence}%</strong>)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Khớp cả 3 tiêu chí: Đơn giá, Số lượng & Thuế GTGT
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
            <span className="text-xs font-semibold text-slate-500 uppercase">Tốc độ xử lý RPA + OCR</span>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Zap className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600">3.6 giây</span>
            <span className="text-xs font-medium text-slate-400">/ hóa đơn</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Nhanh gấp <strong className="text-emerald-600">66 lần</strong> so với kiểm tra thủ công (4 phút)
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
                Xu hướng Đối soát Hóa đơn 7 ngày gần nhất
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
              const matchedPct = (item.matched / total) * 100;
              const mismatchPct = (item.mismatch / total) * 100;
              const needConfirmPct = (item.needConfirm / total) * 100;

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

      {/* Hàng 3: Khung Giám sát RPA Worker (APScheduler) & Top Nhà cung cấp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Khung Giám sát RPA Worker & Bộ lọc Tiếp nhận Tự động 4 Tầng */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-600" />
                Tiến trình Ngầm APScheduler & Bộ lọc 4 Tầng
              </h2>
              <p className="text-xs text-slate-500">Giám sát hoạt động của 2 cron job tự động hóa</p>
            </div>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
              Scheduler Active
            </span>
          </div>

          {/* 2 Cron Jobs Info */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                Job 1: Quét Mail & SMB
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Chu kỳ: Mỗi 5 phút (Interval)</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-0.5">● Hoạt động bình thường</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                Job 2: Tổng hợp Cuối ngày
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Lịch chạy: 17:30 hàng ngày</div>
              <div className="text-[11px] text-blue-600 font-medium mt-0.5">Chờ kích hoạt ca tối</div>
            </div>
          </div>

          {/* Nhật ký lọc 4 tầng */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Nhật ký lọc tệp tự động (Mới nhất)</span>
              <span className="text-[11px] font-normal text-slate-400">4 Tầng Kiểm Soát</span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
              {rpaLogs.length > 0 ? (
                rpaLogs.map((log) => {
                  const isAccepted = log.status === 'ACCEPTED';
                  return (
                    <div key={log.id} className="pt-1.5 text-xs flex items-start gap-2">
                      {isAccepted ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 truncate">{log.fileName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                        </div>
                        {isAccepted ? (
                          <div className="text-[11px] text-emerald-700">
                            Hợp lệ &rarr; Đã nạp vào hàng đợi OpenCV & PaddleOCR
                          </div>
                        ) : (
                          <div className="text-[11px] text-rose-600 line-clamp-1">
                            Từ chối: {log.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Chưa có nhật ký lọc tệp tự động.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bảng Top Nhà cung cấp & Tỷ lệ Sai lệch */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                Top Nhà Cung Cấp & Tỷ Lệ Sai Lệch
              </h2>
              <p className="text-xs text-slate-500">Theo dõi chất lượng chứng từ và cảnh báo rủi ro thuế</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-2 font-semibold">Nhà cung cấp</th>
                  <th className="pb-2 font-semibold">Mã số thuế</th>
                  <th className="pb-2 font-semibold text-center">Số HĐ nhận</th>
                  <th className="pb-2 font-semibold text-right">Tỷ lệ sai lệch</th>
                  <th className="pb-2 font-semibold text-center">Pháp lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {suppliers.length > 0 ? (
                  suppliers.slice(0, 5).map((sup) => (
                    <tr key={sup.code} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-medium text-slate-900 max-w-[160px] truncate">
                        {sup.name}
                      </td>
                      <td className="py-2.5 font-mono text-slate-500">{sup.taxCode}</td>
                      <td className="py-2.5 text-center font-bold text-slate-800">
                        {sup.totalInvoicesReceived}
                      </td>
                      <td className="py-2.5 text-right font-bold">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded ${
                            sup.mismatchRate > 15
                              ? 'bg-rose-100 text-rose-700'
                              : sup.mismatchRate > 5
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {sup.mismatchRate}%
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {sup.legalStatus === 'ACTIVE' ? (
                          <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                            Rủi ro cao
                          </span>
                        )}
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
          </div>
        </div>
      </div>
    </div>
  );
};
