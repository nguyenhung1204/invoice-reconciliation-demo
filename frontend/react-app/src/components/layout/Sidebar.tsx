import React from 'react';
import {
  LayoutDashboard,
  Layers,
  GitCompare,
  Database,
  FileSpreadsheet,
  Wallet,
  Bot,
} from 'lucide-react';
import { UserProfile } from '../../types/index.ts';

export type NavTabId = 'dashboard' | 'queue' | 'matching' | 'masterdata' | 'reports' | 'accounting';

interface SidebarProps {
  currentTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  currentUser: UserProfile;
  mismatchCount: number;
  totalInvoiceCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  mismatchCount,
  totalInvoiceCount,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTabId,
      label: 'Tổng quan & Giám sát',
      sublabel: 'KPIs & Tiến trình RPA Worker',
      icon: LayoutDashboard,
    },
    {
      id: 'queue' as NavTabId,
      label: 'Tiếp nhận và quản lý hóa đơn',
      sublabel: 'Tiếp nhận & Xử lý tự động',
      icon: Layers,
      badge: totalInvoiceCount,
      badgeColor: 'bg-blue-100 text-blue-700',
    },
    {
      id: 'matching' as NavTabId,
      label: 'Đối soát 3 bên',
      sublabel: 'Human-in-the-loop (HĐ - PO - GR)',
      icon: GitCompare,
      badge: mismatchCount > 0 ? mismatchCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-700 font-bold',
    },
    {
      id: 'masterdata' as NavTabId,
      label: 'Dữ liệu PO & Phiếu Kho',
      sublabel: 'Đơn hàng, GR & Nhà cung cấp',
      icon: Database,
    },
    {
      id: 'accounting' as NavTabId,
      label: 'Sổ sách Thu - Chi',
      sublabel: 'Phiếu thu, phiếu chi & tồn quỹ',
      icon: Wallet,
    },
    {
      id: 'reports' as NavTabId,
      label: 'Báo cáo & Cấu hình',
      sublabel: 'Đồng bộ MISA/ERP & Dung sai',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 shrink-0 border-r border-slate-800 bg-slate-900 text-slate-300 flex flex-col justify-between select-none transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-base tracking-tight">AutoInvoice</span>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                    RPA
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium leading-none mt-1">
                  Hệ thống Đối soát Hóa đơn
                </div>
              </div>
            </div>
          </div>

          {/* Navigation List */}
          <nav className="p-3 space-y-1.5" aria-label="Menu chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`cursor-pointer w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold leading-tight truncate">
                      {item.label}
                    </div>
                    <div
                      className={`text-[10px] truncate leading-tight mt-0.5 ${
                        isActive ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {item.sublabel}
                    </div>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                        isActive
                          ? 'bg-white text-blue-900 font-bold'
                          : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Info: User & Architecture info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-blue-400 font-bold text-xs border border-slate-700">
                {currentUser.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-blue-400 truncate">
                  {currentUser.roleLabel}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/80 pt-2">
              <span>Hệ thống:</span>
              <span className="text-emerald-400 font-medium">Mock Frontend</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
