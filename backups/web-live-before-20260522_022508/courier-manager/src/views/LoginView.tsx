import { useState } from 'react';
import { ArrowRight, Lock, User } from 'lucide-react';

interface LoginViewProps {
  onLogin: (token: string) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/trpc/managerAuth.login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { username: username.trim(), password } }),
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('API Error:', response.status, errorData);
        throw new Error('Неверный логин или пароль');
      }

      const data = await response.json();
      const token = data.result?.data?.json?.token || data.result?.data?.token;
      const manager = data.result?.data?.json?.manager || data.result?.data?.manager;

      if (!token || !manager) throw new Error('Неверные учётные данные');

      localStorage.setItem('managerToken', token);
      localStorage.setItem('managerUsername', manager.username || username.trim());
      localStorage.setItem('managerName', manager.name || username.trim());
      localStorage.setItem('managerRole', manager.role || 'Менеджер');
      localStorage.setItem('managerPhone', manager.phone || '');
      localStorage.setItem('managerEmail', manager.email || '');
      onLogin(token);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при входе';
      console.error('Login error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.04),transparent_35%)]" />

          <div className="relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-lg font-semibold text-white shadow-lg shadow-slate-950/10">CD</div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-950">Courier Delivery</h1>
                <p className="text-sm text-slate-500">Manager Console</p>
              </div>
            </div>

            <div className="mt-24 max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Operations Workspace</p>
              <h2 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-slate-950">Управление доставками и заявками в одном рабочем пространстве.</h2>
              <p className="mt-8 max-w-xl text-base leading-8 text-slate-500">Интерфейс для менеджеров, курьеров и операторов: быстрые действия, таблицы заявок, фильтры и контроль статусов без перегруженного UI.</p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-4">
            {[
              ['24/7', 'операционная панель'],
              ['API', 'единая система'],
              ['SaaS', 'рабочий интерфейс'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
                <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-lg font-semibold text-white shadow-lg shadow-slate-950/10">CD</div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Courier Delivery</h1>
              <p className="mt-2 text-sm text-slate-500">Панель управления заявками и курьерами.</p>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-8">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Вход в систему</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">Используйте аккаунт менеджера. Демо-вход отключён, чтобы не путать рабочую авторизацию.</p>
              </div>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Имя пользователя</label>
                  <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-slate-300 focus-within:bg-white">
                    <User className="h-4 w-4 text-slate-400" />
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" disabled={loading} autoComplete="username" />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Пароль</label>
                  <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-slate-300 focus-within:bg-white">
                    <Lock className="h-4 w-4 text-slate-400" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" disabled={loading} autoComplete="current-password" />
                  </div>
                </div>

                {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

                <button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">
                  <span>{loading ? 'Вход...' : 'Войти в систему'}</span>
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Рабочий вход</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Логин и пароль задаются в таблице менеджеров. Пароль можно будет сменить в разделе аккаунта после входа.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
