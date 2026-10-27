import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Menu,
  ChevronDown,
} from 'lucide-react';
import { UserProfile, InvoiceRecord } from '../../types/index.ts';
import { api, mockActions, WorkerStatusDTO } from '../../services/api.ts';

interface HeaderProps {
  currentUser: UserProfile;
  invoices: InvoiceRecord[];
  showScanAction: boolean;
  onSelectInvoice: (code: string) => void;
  onNavigateToMatching: () => void;
  onToggleMobileMenu?: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  invoices,
  showScanAction,
  onSelectInvoice,
  onNavigateToMatching,
  onToggleMobileMenu,
  onLogout,
}) => {
  const [workerStatus, setWorkerStatus] = useState<WorkerStatusDTO | null>(null);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showUserDropdown, setShowUserDropdown] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanFeedback, setScanFeedback] = useState<{
    status: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Lấy trạng thái thực từ backend; không hiển thị bộ đếm giả ở giao diện.
  useEffect(() => {
    let active = true;
    const loadWorkerStatus = async () => {
      try {
        const status = await api.getWorkerStatus();
        if (active) setWorkerStatus(status);
      } catch {
        if (active) setWorkerStatus(null);
      }
    };
    void loadWorkerStatus();
    const interval = window.setInterval(() => void loadWorkerStatus(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!scanFeedback) return;
    const timeout = window.setTimeout(() => setScanFeedback(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [scanFeedback]);

  // Danh sách các bất thường cần cảnh báo
  const pendingAnomalies = invoices.filter(
    (inv) => inv.status === 'MISMATCH' || inv.status === 'NEED_CONFIRM'
  );

  const handleTriggerScan = async () => {
    setIsScanning(true);
    try {
      const res = await mockActions.triggerRpaScan();
      setScanFeedback({ status: res.status, message: res.message });
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur shadow-xs">
      {/* Mobile Hamburger & RPA Worker Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          title="Mở menu hệ thống"
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div
          title={workerStatus?.message || 'Đang lấy trạng thái thư mục nhận từ máy chủ'}
          className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs"
          aria-live="polite"
        >
          <span className={`h-2 w-2 rounded-full ${workerStatus?.active ? 'bg-emerald-500' : workerStatus ? 'bg-amber-500' : 'bg-slate-400 animate-pulse'}`} />
          <span className={`font-medium ${workerStatus?.active ? 'text-emerald-700' : 'text-slate-600'}`}>
            {workerStatus ? (workerStatus.active ? 'Quét thư mục tự động' : 'Chưa cấu hình thư mục') : 'Đang kiểm tra nguồn nhận'}
          </span>
        </div>

        {showScanAction && currentUser.role === 'ADMIN' && (
          <button
            type="button"
            onClick={handleTriggerScan}
            disabled={isScanning}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Đang quét...' : 'Quét thư mục'}
          </button>
        )}

        {showScanAction && scanFeedback && (
          <span
            role={scanFeedback.status === 'error' ? 'alert' : 'status'}
            className={`hidden xl:flex max-w-72 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs animate-fade-in ${
              scanFeedback.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
              scanFeedback.status === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' :
              'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {scanFeedback.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{scanFeedback.message}</span>
          </span>
        )}
      </div>

      {/* Right controls: Notifications & User Account */}
      <div className="flex items-center gap-4">
        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="cursor-pointer relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="Thông báo cảnh báo sai lệch đối soát"
            aria-label="Cảnh báo sai lệch"
          >
            <Bell className="h-5 w-5" />
            {pendingAnomalies.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
                {pendingAnomalies.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 z-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Cảnh báo sai lệch chờ xử lý ({pendingAnomalies.length})
                </span>
                <span className="text-[11px] text-slate-400">Thông tư 78</span>
              </div>

              {pendingAnomalies.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-emerald-500" />
                  Tuyệt vời! Toàn bộ hóa đơn đã được đối soát khớp 3 bên.
                </div>
              ) : (
                <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {pendingAnomalies.map((inv) => (
                    <button
                      key={inv.code}
                      onClick={() => {
                        onSelectInvoice(inv.code);
                        onNavigateToMatching();
                        setShowNotifications(false);
                      }}
                      className="cursor-pointer w-full text-left p-2 hover:bg-slate-50 rounded-lg transition-colors flex items-start gap-2.5"
                    >
                      <span
                        className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                          inv.status === 'MISMATCH' ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">{inv.code}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              inv.status === 'MISMATCH'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {inv.status === 'MISMATCH' ? 'Phát hiện lệch' : 'Độ tin cậy OCR thấp'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">
                          {inv.header.sellerName}
                        </p>
                        <p className="text-[10px] text-rose-600 font-medium mt-0.5 line-clamp-1">
                          {inv.anomalies[0]?.title || 'Cần kiểm tra chi tiết'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Account Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="cursor-pointer flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Thông tin tài khoản cá nhân"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
              {currentUser.avatar}
            </div>
            <div className="text-left">
              <div className="font-semibold leading-tight text-slate-900">{currentUser.name}</div>
              <div className="text-[10px] text-blue-600 font-medium">{currentUser.roleLabel}</div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50 animate-fade-in">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shrink-0 shadow-inner">
                  {currentUser.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 text-sm truncate leading-tight">{currentUser.name}</div>
                  <div className="text-xs text-blue-600 font-medium mt-0.5">{currentUser.roleLabel}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{currentUser.department || 'Khối Tài chính & Vận hành'}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={onLogout}
                  className="cursor-pointer w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Đăng xuất khỏi hệ thống
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
