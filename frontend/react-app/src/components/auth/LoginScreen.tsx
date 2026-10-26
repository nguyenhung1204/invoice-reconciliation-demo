import React, { useState } from 'react';
import { ArrowRight, Bot, LoaderCircle } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 p-4 backdrop-blur-xs">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tracking-tight text-slate-900">AutoInvoice</span>
              <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">RPA</span>
            </div>
            <div className="mt-1 text-xs font-medium leading-none text-slate-500">Hệ thống Đối soát Hóa đơn VAT</div>
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">Đăng nhập hệ thống</h1>
          <p className="text-xs text-slate-500">Đối soát hóa đơn theo quyền được cấp cho tài khoản.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="login-email">
              Email tài khoản
            </label>
            <input
              id="login-email"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600" htmlFor="login-password">
              Mật khẩu
            </label>
            <input
              id="login-password"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && <p className="text-center text-xs font-medium text-rose-600" role="alert">{error}</p>}
          <button
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <>Đăng nhập hệ thống <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      </section>
    </main>
  );
};
