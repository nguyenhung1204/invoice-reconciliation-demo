import { useState } from 'react';
import {
  Bell,
  Bot,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitCompare,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import type { BackendInvoiceDTO, WorkerStatusDTO } from '../../services/api.ts';
import type { UserProfile } from '../../types/index.ts';

export type LegacyModuleId = 'dashboard' | 'queue' | 'matching' | 'masterdata' | 'accounting' | 'reports';

const navigation: Array<{
  id: LegacyModuleId;
  label: string;
  sublabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Tổng quan & Giám sát', sublabel: 'KPIs & Tiến trình RPA Worker', icon: LayoutDashboard },
  { id: 'queue', label: 'Tiếp nhận và quản lý hóa đơn', sublabel: 'Tiếp nhận & Xử lý tự động', icon: Layers },
  { id: 'matching', label: 'Đối soát 3 bên', sublabel: 'Human-in-the-loop (HĐ - PO - GR)', icon: GitCompare },
  { id: 'masterdata', label: 'Dữ liệu PO & Phiếu Kho', sublabel: 'Đơn hàng, GR & Nhà cung cấp', icon: Database },
  { id: 'accounting', label: 'Sổ sách Thu - Chi', sublabel: 'Phiếu thu, phiếu chi & tồn quỹ', icon: Wallet },
  { id: 'reports', label: 'Báo cáo & Cấu hình', sublabel: 'Đồng bộ MISA/ERP & Dung sai', icon: FileSpreadsheet },
];

export function LegacySidebar({
  currentModule,
  onSelectModule,
  currentUser,
  mismatchCount,
  totalInvoiceCount,
  mobileOpen,
  onCloseMobile,
}: {
  currentModule: LegacyModuleId;
  onSelectModule: (module: LegacyModuleId) => void;
  currentUser: UserProfile;
  mismatchCount: number;
  totalInvoiceCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {mobileOpen && <button type="button" aria-label="Đóng menu" onClick={onCloseMobile} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 select-none flex-col justify-between border-r border-slate-800 bg-slate-900 text-slate-300 transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div>
          <div className="border-b border-slate-800 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30"><Bot className="h-6 w-6" /></div>
              <div>
                <div className="flex items-center gap-1.5"><span className="text-base font-bold tracking-tight text-white">AutoInvoice</span><span className="rounded border border-blue-500/30 bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">RPA</span></div>
                <div className="mt-1 text-[11px] font-medium leading-none text-slate-400">Hệ thống Đối soát Hóa đơn</div>
              </div>
            </div>
          </div>
          <nav className="space-y-1.5 p-3" aria-label="Menu chính">
            {navigation.map(({ id, label, sublabel, icon: Icon }) => {
              const active = currentModule === id;
              const badge = id === 'queue' ? totalInvoiceCount : id === 'matching' && mismatchCount ? mismatchCount : undefined;
              return <button key={id} type="button" onClick={() => onSelectModule(id)} className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all ${active ? 'bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}>
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold leading-tight">{label}</span><span className={`mt-0.5 block truncate text-[10px] leading-tight ${active ? 'text-blue-100' : 'text-slate-400'}`}>{sublabel}</span></span>
                {badge !== undefined && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white font-bold text-blue-900' : id === 'matching' ? 'bg-rose-100 font-bold text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{badge}</span>}
              </button>;
            })}
          </nav>
        </div>
        <div className="border-t border-slate-800 bg-slate-950/60 p-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-blue-400">{currentUser.avatar}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-white">{currentUser.name}</div><div className="truncate text-[10px] text-blue-400">{currentUser.roleLabel}</div></div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-400"><span>Nguồn nghiệp vụ:</span><span className="font-medium text-emerald-400">FastAPI</span></div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function LegacyHeader({
  currentUser,
  invoices,
  worker,
  onSelectInvoice,
  onNavigateToMatching,
  onToggleMobileMenu,
  onLogout,
  onScanNow,
  scanBusy,
  scanMessage,
}: {
  currentUser: UserProfile;
  invoices: BackendInvoiceDTO[];
  worker: WorkerStatusDTO | null;
  onSelectInvoice: (invoiceId: string) => void;
  onNavigateToMatching: () => void;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onScanNow: () => void;
  scanBusy: boolean;
  scanMessage: string;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const attention = invoices.filter((invoice) => ['mismatch', 'needs_review'].includes(invoice.status));
  const canScan = currentUser.role === 'ADMIN';

  return <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-xs backdrop-blur sm:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" onClick={onToggleMobileMenu} className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" title="Mở menu hệ thống" aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
      <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs sm:flex">
        <span className={`h-2 w-2 rounded-full ${worker?.active ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
        <span className="font-semibold text-slate-800">RPA Worker:</span><span className={worker?.active ? 'font-medium text-emerald-700' : 'font-medium text-slate-500'}>{worker?.active ? 'Đang hoạt động' : worker ? 'Tạm dừng' : 'Chưa xác định'}</span>
        {worker?.mode && <span className="max-w-48 truncate text-slate-500">· {worker.mode}</span>}
      </div>
      {canScan && <button type="button" onClick={onScanNow} disabled={scanBusy} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${scanBusy ? 'animate-spin' : ''}`} />{scanBusy ? 'Đang quét…' : 'Quét Email/SMB ngay'}</button>}
      {scanMessage && <span role="status" className="hidden max-w-64 truncate rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 lg:inline">{scanMessage}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
      <div className="relative">
        <button type="button" onClick={() => setNotificationsOpen((open) => !open)} className="relative cursor-pointer rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900" title="Thông báo cảnh báo sai lệch đối soát" aria-label="Cảnh báo sai lệch"><Bell className="h-5 w-5" />{attention.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs">{attention.length}</span>}</button>
        {notificationsOpen && <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2"><span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700"><TriangleAlert className="h-4 w-4 text-rose-500" />Cảnh báo chờ xử lý ({attention.length})</span><span className="text-[11px] text-slate-400">Thông tư 78</span></div>
          {attention.length === 0 ? <div className="p-4 text-center text-xs text-slate-500"><CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-emerald-500" />Không có hóa đơn cần xử lý.</div> : <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">{attention.map((invoice) => <button key={invoice.id} type="button" onClick={() => { onSelectInvoice(String(invoice.id)); onNavigateToMatching(); setNotificationsOpen(false); }} className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-slate-50"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${invoice.status === 'mismatch' ? 'bg-rose-500' : 'bg-amber-500'}`} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-slate-900">{invoice.invoice_number || `#${invoice.id}`}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${invoice.status === 'mismatch' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{invoice.status === 'mismatch' ? 'Phát hiện lệch' : 'Cần rà soát'}</span></span><span className="mt-0.5 block truncate text-[11px] text-slate-600">{invoice.original_name}</span><span className="mt-0.5 block line-clamp-1 text-[10px] font-medium text-rose-600">{invoice.warnings[0]?.message || 'Cần kiểm tra chi tiết'}</span></span></button>)}</div>}
        </div>}
      </div>
      <div className="relative">
        <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 sm:px-3" title="Thông tin tài khoản cá nhân">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">{currentUser.avatar}</span><span className="hidden text-left sm:block"><span className="block font-semibold leading-tight text-slate-900">{currentUser.name}</span><span className="block text-[10px] font-medium text-blue-600">{currentUser.roleLabel}</span></span>
        </button>
        {accountOpen && <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><div className="border-b border-slate-100 pb-3"><div className="text-xs font-bold text-slate-900">{currentUser.name}</div><div className="mt-1 text-[11px] text-slate-500">{currentUser.roleLabel}</div><div className="mt-2 rounded-lg bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-800">Quyền truy cập được xác thực bởi máy chủ.</div></div><button type="button" onClick={onLogout} className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><LogOut className="h-4 w-4 text-rose-500" />Đăng xuất tài khoản</button></div>}
      </div>
    </div>
  </header>;
}

export function LegacyMobileClose({ onClose }: { onClose: () => void }) {
  return <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>;
}
