import { useState } from 'react';
import { UserRound, Save } from 'lucide-react';

interface Props {
  managerName: string;
  managerRole: string;
  onNameChange: (name: string) => void;
}

export default function ManagerProfileView({ managerName, managerRole, onNameChange }: Props) {
  const [name, setName] = useState(managerName || '');
  const [saved, setSaved] = useState(false);

  const saveName = () => {
    const nextName = name.trim() || 'Менеджер';
    localStorage.setItem('managerName', nextName);
    onNameChange(nextName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="w-full space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Личный кабинет</h2>
            <p className="text-sm text-slate-500">Настройки профиля менеджера</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Профиль</h3>
          <p className="mt-1 text-sm text-slate-500">Это имя будет отображаться в верхней панели сайта.</p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Имя менеджера</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-100"
                placeholder="Например: Айдар"
              />
            </label>

            <button
              onClick={saveName}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              Сохранить имя
            </button>

            {saved && <p className="text-sm font-medium text-emerald-600">Имя сохранено</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Безопасность</h3>
          <p className="mt-1 text-sm text-slate-500">Смена пароля будет подключена следующим шагом через API.</p>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            Роль: <span className="font-semibold text-slate-950">{managerRole || 'Менеджер'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
