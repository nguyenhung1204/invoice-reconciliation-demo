/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Sidebar, NavTabId } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { LoginScreen } from './components/auth/LoginScreen.tsx';
import { DashboardModule } from './components/dashboard/DashboardModule.tsx';
import { QueueModule } from './components/queue/QueueModule.tsx';
import { SplitScreenMatchingModule } from './components/matching/SplitScreenMatchingModule.tsx';
import { MasterDataModule } from './components/masterdata/MasterDataModule.tsx';
import { ReportsAndSettingsModule } from './components/reports/ReportsAndSettingsModule.tsx';
import { AccountingLedgerModule } from './components/accounting/AccountingLedgerModule.tsx';
import { api, store } from './services/api.ts';
import type { AuthenticatedUser } from './services/api.ts';
import { InvoiceRecord, GoodsReceipt, PurchaseOrder, SupplierMaster, RuleSettings, UserProfile } from './types/index.ts';
import type { WorkerStatusDTO } from './services/api.ts';

function toUserProfile(user: AuthenticatedUser): UserProfile {
  const roleDetails = {
    accountant: { role: 'ACCOUNTANT', label: 'Kế toán viên' },
    chief_accountant: { role: 'CHIEF_ACCOUNTANT', label: 'Kế toán trưởng' },
    admin: { role: 'ADMIN', label: 'Quản trị viên' },
  } as const;
  const role = roleDetails[user.role];
  return {
    id: user.email,
    name: user.email,
    role: role.role,
    roleLabel: role.label,
    department: '',
    avatar: user.email.slice(0, 2).toUpperCase(),
  };
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTabId>('dashboard');
  const [selectedInvoiceCode, setSelectedInvoiceCode] = useState<string>('INV-2026-0002');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'error' | 'signed_out' | 'signed_in'>('loading');
  const [authError, setAuthError] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);

  // Reactive state từ in-memory store
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(store.getInvoices());
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(store.getPurchaseOrders());
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>(store.getGoodsReceipts());
  const [suppliers, setSuppliers] = useState<SupplierMaster[]>(store.getSuppliers());
  const [workerStatus, setWorkerStatus] = useState<WorkerStatusDTO | null>(store.getWorkerStatus());
  const [settings, setSettings] = useState<RuleSettings>(store.getSettings());
  useEffect(() => {
    // Đăng ký lắng nghe thay đổi từ Store
    const unsubscribe = store.subscribe(() => {
      setInvoices(store.getInvoices());
      setPurchaseOrders(store.getPurchaseOrders());
      setGoodsReceipts(store.getGoodsReceipts());
      setSuppliers(store.getSuppliers());
      setWorkerStatus(store.getWorkerStatus());
      setSettings(store.getSettings());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (invoices.length > 0 && !invoices.some((i) => i.code === selectedInvoiceCode)) {
      setSelectedInvoiceCode(invoices[0].code);
    }
  }, [invoices, selectedInvoiceCode]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      setAuthState('loading');
      setAuthError('');
      try {
        const user = await api.restoreSession();
        if (!active) return;
        if (!user) {
          setCurrentUser(null);
          setAuthState('signed_out');
          return;
        }
        const profile = toUserProfile(user);
        store.setAuthenticatedUser(profile);
        await store.syncWithBackend();
        if (!active) return;
        setCurrentUser(profile);
        setAuthState('signed_in');
      } catch (error) {
        if (!active) return;
        setAuthError(error instanceof Error ? error.message : 'Không thể tải dữ liệu từ máy chủ.');
        setAuthState('error');
      }
    };
    void restore();
    return () => { active = false; };
  }, [authAttempt]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setAuthState('signed_out');
    };
    window.addEventListener('autoinvoice:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('autoinvoice:unauthorized', handleUnauthorized);
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const user = await api.login(email, password);
    const profile = toUserProfile(user);
    store.setAuthenticatedUser(profile);
    try {
      await store.syncWithBackend();
    } catch (error) {
      await api.logout();
      throw error;
    }
    setCurrentUser(profile);
    setAuthError('');
    setAuthState('signed_in');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // The local session is cleared even if the backend cannot record logout.
    } finally {
      setCurrentUser(null);
      setAuthState('signed_out');
      setCurrentTab('dashboard');
    }
  };

  if (authState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-600" role="status">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-blue-600" /> Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (authState === 'error') {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100 p-4">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-bold text-slate-900">Không thể kết nối tới hệ thống</h1>
          <p className="mt-2 text-sm text-rose-700" role="alert">{authError}</p>
          <button
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => { setAuthState('loading'); setAuthError(''); setAuthAttempt((attempt) => attempt + 1); }}
          >
            <RefreshCw className="h-4 w-4" /> Thử lại
          </button>
        </section>
      </main>
    );
  }

  if (authState === 'signed_out' || !currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const mismatchCount = invoices.filter(
    (i) => i.status === 'MISMATCH' || i.status === 'NEED_CONFIRM'
  ).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800 antialiased">
      {/* Cột Sidebar Điều Hướng */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setMobileMenuOpen(false);
        }}
        currentUser={currentUser}
        mismatchCount={mismatchCount}
        totalInvoiceCount={invoices.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Vùng Nội Dung Chính */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header Thanh trạng thái & Chuyển đổi vai trò */}
        <Header
          currentUser={currentUser}
          invoices={invoices}
          showScanAction={currentTab !== 'queue'}
          onSelectInvoice={(code) => setSelectedInvoiceCode(code)}
          onNavigateToMatching={() => setCurrentTab('matching')}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          onLogout={handleLogout}
        />

        {/* Màn hình phân hệ đang chọn */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1720px]">
            {currentTab === 'dashboard' && (
              <DashboardModule
                invoices={invoices}
                suppliers={suppliers}
                workerStatus={workerStatus}
                onSelectInvoice={(code) => setSelectedInvoiceCode(code)}
                onNavigateToMatching={() => setCurrentTab('matching')}
                onNavigateToQueue={() => setCurrentTab('queue')}
              />
            )}

            {currentTab === 'queue' && (
              <QueueModule
                invoices={invoices}
                canScan={currentUser.role === 'ADMIN'}
                onSelectInvoice={(code) => setSelectedInvoiceCode(code)}
                onNavigateToMatching={() => setCurrentTab('matching')}
              />
            )}

            {currentTab === 'matching' && (
              <SplitScreenMatchingModule
                invoices={invoices}
                selectedInvoiceCode={selectedInvoiceCode}
                onSelectInvoice={(code) => setSelectedInvoiceCode(code)}
                currentUser={currentUser}
              />
            )}

            {currentTab === 'masterdata' && (
              <MasterDataModule
                purchaseOrders={purchaseOrders}
                goodsReceipts={goodsReceipts}
                suppliers={suppliers}
                currentUser={currentUser}
              />
            )}

            {currentTab === 'reports' && (
              <ReportsAndSettingsModule
                invoices={invoices}
                settings={settings}
                currentUser={currentUser}
              />
            )}

            {currentTab === 'accounting' && (
              <AccountingLedgerModule currentUser={currentUser} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
