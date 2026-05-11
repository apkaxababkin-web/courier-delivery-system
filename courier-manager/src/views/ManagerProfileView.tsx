import { useState } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';

interface ManagerProfileViewProps {
  managerName: string;
  managerRole: string;
}

function getTrpcErrorMessage(payload: any, fallback: string) {
  return payload?.error?.message || payload?.error?.json?.message || fallback;
}

export default function ManagerProfileView({ managerName, managerRole }: ManagerProfileViewProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const managerUsername = localStorage.getItem('managerUsername') || 'manager';
  const managerEmail = localStorage.getItem('managerEmail') || 'Не указан';

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('Новый пароль должен быть не короче 6 символов');
      return;
    }

    if (newPassword !== repeatPassword) {
      setError('Новый пароль и повтор не совпадают');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('managerToken');
      if (!token) throw new Error('Сессия менеджера не найдена. Войдите заново.');

      const response = await fetch('/api/trpc/managerAuth.changePassword', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            token,
            currentPassword,
            newPassword,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getTrpcErrorMessage(payload, 'Не удалось изменить пароль'));
      }

      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setSuccess('Пароль успешно изменён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <UserRound size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Личный кабинет менеджера</h2>
              <p className="mt-1 text-sm text-slate-500">Профиль, безопасность и персональные настройки</p>
            </div>
          </div>
          <div className="hidden rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 md:block">
            Аккаунт активен
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Данные аккаунта</h3>
              <p className="text-sm text-slate-500">Информация текущего пользователя</p>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <p className="text-slate-500">Имя</p>
              <p className="mt-1 font-semibold text-slate-900">{managerName || 'Менеджер'}</p>
            </div>
            <div>
              <p className="text-slate-500">Роль</p>
              <p className="mt-1 font-semibold text-slate-900">{managerRole || 'Менеджер'}</p>
            </div>
            <div>
              <p className="text-slate-500">Логин</p>
              <p className="mt-1 font-semibold text-slate-900">{managerUsername}</p>
            </div>
            <div>
              <p className="text-slate-500">Email</p>
              <p className="mt-1 font-semibold text-slate-900">{managerEmail}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <KeyRound size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Смена пароля</h3>
              <p className="text-sm text-slate-500">После смены используйте новый пароль при следующем входе</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Текущий пароль</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Новый пароль</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
                minLength={6}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Повторите новый пароль</span>
              <input
                type="password"
                value={repeatPassword}
                onChange={(event) => setRepeatPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
                minLength={6}
              />
            </label>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? 'Сохраняем...' : 'Изменить пароль'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
