import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, ReceiptText } from 'lucide-react';

export function LegacyLoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="flex min-h-screen items-center justify-center bg-surface font-sans text-on-surface antialiased">
    <main className="flex w-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <section className="mx-auto flex w-full max-w-md flex-col justify-center rounded-xl border border-surface-container bg-surface-container-lowest p-8 shadow-lg">
          <div className="flex flex-col items-center pb-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-high p-2 shadow-sm"><ReceiptText className="h-7 w-7 text-secondary" /></div>
            <h1 className="mb-1 mt-2 text-xl font-semibold text-on-surface">Đăng nhập tài khoản</h1>
            <p className="text-xs font-medium text-on-surface-variant">AutoInvoice RPA — Hệ thống đối soát hóa đơn kế toán Thông tư 78</p>
          </div>
          {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><span className="material-symbols-outlined shrink-0 text-base text-rose-600">error</span><span className="flex-1">{error}</span></div>}
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-on-surface-variant" htmlFor="legacy-login-email">Email hoặc Tên đăng nhập</label>
              <div className="relative"><span className="material-symbols-outlined absolute left-3 top-2.5 text-lg text-on-surface-variant">person</span><input autoComplete="username" className="h-10 w-full rounded border border-surface-container bg-surface-container-lowest pl-10 pr-4 text-sm text-on-surface shadow-sm transition-all placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-secondary/40" id="legacy-login-email" placeholder="email@doanhnghiep.vn" required type="text" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-on-surface-variant" htmlFor="legacy-login-password">Mật khẩu</label>
              <div className="relative"><span className="material-symbols-outlined absolute left-3 top-2.5 text-lg text-on-surface-variant">lock</span><input autoComplete="current-password" className="h-10 w-full rounded border border-surface-container bg-surface-container-lowest pl-10 pr-10 text-sm text-on-surface shadow-sm transition-all placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-secondary/40" id="legacy-login-password" placeholder="••••••••••••" required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-2.5 top-2.5 flex cursor-pointer items-center text-on-surface-variant transition-colors hover:text-on-surface">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>
            <div className="pt-2"><button className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-container text-sm font-semibold text-on-primary shadow transition-all hover:bg-primary hover:shadow-md disabled:cursor-wait disabled:opacity-70" type="submit" disabled={busy}>{busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Đăng nhập<ArrowRight className="h-4 w-4" /></>}</button></div>
          </form>
        </section>
        <p className="mx-auto mt-4 max-w-md text-center text-[11px] text-on-surface-variant">Đăng nhập bằng tài khoản được cấp. Vai trò và quyền truy cập do máy chủ xác định.</p>
      </div>
    </main>
  </div>;
}
