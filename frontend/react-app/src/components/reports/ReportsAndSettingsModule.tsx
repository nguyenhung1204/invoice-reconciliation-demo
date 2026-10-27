import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Settings,
  Download,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  BellRing,
  History,
  FileCheck,
  Building,
  Save,
  Eye,
  X,
} from 'lucide-react';
import { InvoiceRecord, RuleSettings, UserProfile } from '../../types/index.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { api, mockActions, store } from '../../services/api.ts';
import type { AuditEventDTO } from '../../services/api.ts';
import { buildInvoiceXmlExport } from '../../utils/reportExport.ts';

interface ReportsAndSettingsModuleProps {
  invoices: InvoiceRecord[];
  settings: RuleSettings;
  currentUser: UserProfile;
}

export const ReportsAndSettingsModule: React.FC<ReportsAndSettingsModuleProps> = ({
  invoices,
  settings,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'REPORTS' | 'RULES' | 'LOGS'>('REPORTS');
  const [localSettings, setLocalSettings] = useState<RuleSettings>({ ...settings });
  const [saveToast, setSaveToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showXmlPreview, setShowXmlPreview] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEventDTO[]>(() => store.getAuditEvents());

  React.useEffect(() => {
    return store.subscribe(() => {
      setAuditEvents(store.getAuditEvents());
    });
  }, []);

  React.useEffect(() => {
    setLocalSettings({ ...settings });
  }, [settings]);

  // Export a read-only generic XML sample for approved invoices.
  const approvedInvoices = invoices.filter((inv) => inv.status === 'APPROVED');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      const saved = await mockActions.updateRuleSettings(localSettings);
      setLocalSettings(saved);
      setSaveToast({ type: 'success', message: 'Đã lưu cấu hình quy tắc vào MySQL.' });
      setTimeout(() => setSaveToast(null), 4000);
    } catch (error) {
      setSaveToast({
        type: 'error',
        message: error instanceof Error ? `Không lưu được cấu hình: ${error.message}` : 'Không lưu được cấu hình vào MySQL.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleExport = async (format: 'EXCEL' | 'CSV' | 'XML') => {
    const time = new Date().toISOString().substring(0, 10);
    if (format === 'EXCEL' || format === 'CSV') {
      try {
        const kind = format === 'EXCEL' ? 'xlsx' : 'csv';
        const blob = await api.downloadReport(kind);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `BaoCao_DoiSoat_HoaDon_${time}.${kind}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSaveToast({ type: 'success', message: `Đã xuất thành công tệp ${format} từ máy chủ!` });
        setTimeout(() => setSaveToast(null), 4000);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể tải tệp';
        setSaveToast({ type: 'error', message: `Lỗi xuất ${format} từ máy chủ: ${msg}` });
        setTimeout(() => setSaveToast(null), 5000);
        return;
      }
    }

    const filename = `BaoCao_HoaDon_DaDuyet_${time}.xml`;
    const content = buildInvoiceXmlExport(approvedInvoices.map((invoice) => ({
      code: invoice.code,
      invoiceNumber: invoice.header.invoiceNumber,
      series: invoice.header.invoiceSeries,
      issueDate: invoice.header.issueDate,
      sellerTaxCode: invoice.header.sellerTaxCode,
      total: invoice.header.grandTotal,
    })), time);

    const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSaveToast({ type: 'success', message: `Đã xuất XML tham khảo: ${filename}. Đây không phải mẫu nhập chính thức của phần mềm kế toán.` });
    setTimeout(() => setSaveToast(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề phân hệ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            Báo Cáo Định Kỳ, Đồng Bộ Kế Toán & Cấu Hình Hệ Thống
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tải báo cáo hóa đơn, chỉnh ngưỡng đối soát và xem nhật ký thao tác
          </p>
        </div>

        <button
          onClick={() => setShowXmlPreview(true)}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
        >
          <FileCode className="h-4 w-4" />
          Xuất XML tham khảo ({approvedInvoices.length} hóa đơn đã duyệt)
        </button>
      </div>

      {saveToast && (
        <div className={`rounded-xl border p-3 text-xs flex items-center justify-between animate-fade-in ${saveToast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`} role={saveToast.type === 'error' ? 'alert' : 'status'}>
          <div className="flex items-center gap-2">
            {saveToast.type === 'success'
              ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              : <X className="h-4 w-4 text-rose-600 shrink-0" />}
            <span>{saveToast.message}</span>
          </div>
          <button onClick={() => setSaveToast(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Tabs Chuyển đổi */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 shadow-2xs">
        <button
          onClick={() => setActiveTab('REPORTS')}
          className={`cursor-pointer pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'REPORTS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Download className="h-4 w-4" />
          Kỳ Báo Cáo & Xuất Dữ Liệu Hạch Toán
        </button>

        <button
          onClick={() => setActiveTab('RULES')}
          className={`cursor-pointer pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'RULES'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="h-4 w-4" />
          Cấu Hình Quy Tắc & Ngưỡng Dung Sai (Rule Engine)
        </button>

        <button
          onClick={() => setActiveTab('LOGS')}
          className={`cursor-pointer pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'LOGS'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          Nhật Ký Bảo Mật & Thao Tác Hệ Thống
        </button>
      </div>

      {/* TAB 1: BÁO CÁO VÀ XUẤT DỮ LIỆU */}
      {activeTab === 'REPORTS' && (
        <div className="rounded-b-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Thẻ báo cáo tổng hợp từ máy chủ */}
            <div className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition-colors flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    BÁO CÁO
                  </span>
                  <span className="text-[11px] text-slate-400">Dữ liệu từ máy chủ</span>
                </div>
                <h3 className="font-bold text-slate-900 mt-2 text-sm">
                  Báo Cáo Hóa Đơn Tổng Hợp
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tải danh sách hóa đơn hiện có trong hệ thống dưới dạng Excel hoặc CSV.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => handleExport('EXCEL')}
                  className="cursor-pointer flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 py-1.5 text-xs font-semibold text-slate-800 text-center"
                >
                  Xuất Excel (.xlsx)
                </button>
                <button
                  onClick={() => handleExport('CSV')}
                  className="cursor-pointer flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 py-1.5 text-xs font-semibold text-slate-800 text-center"
                >
                  Xuất CSV (.csv)
                </button>
              </div>
            </div>

            {/* Thẻ XML tham khảo; chưa phải định dạng tích hợp với phần mềm kế toán */}
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    XML
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold">Tham khảo</span>
                </div>
                <h3 className="font-bold text-emerald-950 mt-2 text-sm">
                  Xuất dữ liệu hóa đơn
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Xuất các hóa đơn đã duyệt thành XML tổng quát để xem hoặc xử lý tiếp. Định dạng nhập vào MISA/ERP chưa được tích hợp.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-200">
                <button
                  onClick={() => handleExport('XML')}
                  className="cursor-pointer w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-bold text-white text-center shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Tải XML tham khảo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CẤU HÌNH QUY TẮC & NGƯỠNG DUNG SAI (DYNAMIC RULE ENGINE) */}
      {activeTab === 'RULES' && (
        <form onSubmit={handleSaveSettings} className="rounded-b-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              Cấu Hình Quy Tắc Đối Soát Động (Dynamic Rule Engine)
            </h2>
            <p className="text-xs text-slate-500">
              Điều chỉnh các ngưỡng thuật toán kiểm tra tính hợp lệ của hóa đơn GTGT theo Thông tư 78
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* Ngưỡng dung sai VNĐ */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800 block">
                Ngưỡng dung sai làm tròn tiền (Tolerance Threshold):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={localSettings.toleranceThresholdVnd}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      toleranceThresholdVnd: Number(e.target.value),
                    })
                  }
                  className="w-36 rounded-lg border border-slate-300 p-2 font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="font-bold text-slate-600">VNĐ (±)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Mặc định: 10 VNĐ. Dùng để xử lý sai lệch do làm tròn số học tiền thuế GTGT và thành tiền giữa các phần mềm.
              </p>
            </div>

            {/* Ngưỡng Levenshtein */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800 block">
                Ngưỡng tương đồng tên mặt hàng tối thiểu (Fuzzy Levenshtein %):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={localSettings.fuzzyMatchingThresholdPct}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      fuzzyMatchingThresholdPct: Number(e.target.value),
                    })
                  }
                  className="w-36 rounded-lg border border-slate-300 p-2 font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="font-bold text-slate-600">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Mặc định: 80%. Tên hàng hóa trên Hóa đơn có độ khớp thấp hơn ngưỡng này sẽ bị cảnh báo tên không đồng nhất với PO.
              </p>
            </div>

            {/* Ngưỡng tin cậy OCR */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800 block">
                Ngưỡng độ tin cậy OCR tối thiểu không cảnh báo (PaddleOCR Confidence):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={99}
                  value={localSettings.ocrConfidenceThresholdPct}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      ocrConfidenceThresholdPct: Number(e.target.value),
                    })
                  }
                  className="w-36 rounded-lg border border-slate-300 p-2 font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="font-bold text-slate-600">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Mặc định: 85%. Các trường có điểm nhận dạng ký tự dưới 85% sẽ chuyển trạng thái sang <strong>Cần xác nhận thủ công</strong>.
              </p>
            </div>

            {/* Chu kỳ quét RPA */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800 block">
                Chu kỳ quét tự động của RPA Worker (APScheduler Interval):
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={localSettings.rpaScanIntervalMinutes}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      rpaScanIntervalMinutes: Number(e.target.value),
                    })
                  }
                  className="w-48 rounded-lg border border-slate-300 p-2 font-medium text-slate-900 bg-white"
                >
                  <option value={1}>Mỗi 1 phút (Test cao điểm)</option>
                  <option value={5}>Mỗi 5 phút (Tiêu chuẩn)</option>
                  <option value={15}>Mỗi 15 phút</option>
                  <option value={30}>Mỗi 30 phút</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400">
                Chu kỳ áp dụng khi có cấu hình thư mục inbox cục bộ. Email và thư mục SMB chưa được tích hợp.
              </p>
            </div>
          </div>

          {/* Cảnh báo tự động */}
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <BellRing className="h-4 w-4 text-blue-600" />
              Kênh Thông Báo Cảnh Báo Tự Động:
            </div>
            <div className="flex items-center gap-6 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.autoAlertEmail}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      autoAlertEmail: e.target.checked,
                    })
                  }
                  className="rounded text-blue-600"
                />
                Email cảnh báo (tùy chọn lưu cấu hình; chưa tích hợp gửi)
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.autoAlertTelegram}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      autoAlertTelegram: e.target.checked,
                    })
                  }
                  className="rounded text-blue-600"
                />
                Telegram (tùy chọn lưu cấu hình; chưa tích hợp gửi)
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSavingSettings ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: NHẬT KÝ BẢO MẬT & THAO TÁC HỆ THỐNG */}
      {activeTab === 'LOGS' && (
        <div className="rounded-b-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Lịch sử Hoạt động & Ghi nhận Thao tác Kế toán (System Audit Logs)
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Nhật ký ghi nhận từ API máy chủ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Thời gian</th>
                  <th className="py-2.5 px-3">Tài khoản & Vai trò</th>
                  <th className="py-2.5 px-3">Hồ sơ</th>
                  <th className="py-2.5 px-3">Hành động</th>
                  <th className="py-2.5 px-3">Chi tiết thay đổi</th>
                  <th className="py-2.5 px-4">Căn cứ / Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {auditEvents.length > 0 ? (
                  auditEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {ev.created_at?.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{ev.actor}</div>
                        <div className="text-[10px] text-blue-600 font-medium">{ev.actor_role || 'Chưa rõ vai trò'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {ev.entity}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {ev.action}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        <span className="text-slate-800">{ev.detail || '--'}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-[260px] truncate" title={ev.detail}>
                        {ev.detail || '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Chưa có nhật ký kiểm toán nào được ghi nhận trên hệ thống.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC VÀ XUẤT XML THAM KHẢO */}
      {showXmlPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Xem trước XML tham khảo
                </h3>
              </div>
              <button
                onClick={() => setShowXmlPreview(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 mb-3">
              Có {approvedInvoices.length} hóa đơn đã duyệt. XML này chỉ là định dạng tham khảo, chưa thể khẳng định tương thích với MISA/ERP.
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-900 text-slate-200 p-3 font-mono text-[11px] leading-relaxed">
              &lt;?xml version="1.0" encoding="utf-8"?&gt;<br />
              &lt;invoice_export version="1"&gt;<br />
              {approvedInvoices.map((inv) => (
                <div key={inv.code} className="pl-4 text-emerald-400">
                  &lt;invoice code="{inv.code}" invoice_number="{inv.header.invoiceNumber}" series="{inv.header.invoiceSeries}" seller_tax_code="{inv.header.sellerTaxCode}" total="{inv.header.grandTotal ?? ''}" /&gt;
                </div>
              ))}
              &lt;/invoice_export&gt;
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                XML tổng quát do ứng dụng tạo; không phải định dạng nhập liệu đã xác nhận
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowXmlPreview(false)}
                  className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    handleExport('XML');
                    setShowXmlPreview(false);
                  }}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 flex items-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Tải Xuống File XML
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
