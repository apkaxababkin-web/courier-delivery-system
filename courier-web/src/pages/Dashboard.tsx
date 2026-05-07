import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, MapPin, Clock, CheckCircle, AlertCircle, RefreshCcw } from 'lucide-react';

interface Task {
  id: number;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled' | string;
  senderName?: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryAddress?: string;
  senderAddress?: string;
  createdAt: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  placesCount?: number;
  courierName?: string | null;
}

type Filter = 'all' | 'assigned' | 'in_progress' | 'completed';

const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_STORAGE_KEY = 'courierToken';

const unwrapTrpc = async <T,>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Request failed');
  }

  return data?.result?.data?.json || data?.result?.data || data;
};

const statusLabels: Record<string, string> = {
  assigned: 'Назначено',
  in_progress: 'В работе',
  completed: 'Выполнено',
  cancelled: 'Отменено',
  pending: 'Ожидает',
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'in_progress':
      return 'border-slate-300 bg-slate-100 text-slate-900';
    case 'completed':
      return 'border-slate-300 bg-slate-200 text-slate-950';
    case 'cancelled':
      return 'border-slate-300 bg-white text-slate-500';
    default:
      return 'border-slate-200 bg-white text-slate-700';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'assigned':
      return <AlertCircle className="h-4 w-4" />;
    case 'in_progress':
      return <Clock className="h-4 w-4" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4" />;
    default:
      return <MapPin className="h-4 w-4" />;
  }
};

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setError('');
      setIsLoading(true);
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!token) {
        throw new Error('Нет токена курьера');
      }

      const input = encodeURIComponent(JSON.stringify({ token }));
      const response = await fetch(`${API_URL}/api/trpc/tasks.all?input=${input}`);
      const data = await unwrapTrpc<Task[]>(response);
      setTasks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load courier tasks:', error);
      setError('Не удалось загрузить заявки. Проверьте соединение и авторизацию.');
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((task) => task.status === filter);
  }, [filter, tasks]);

  const counters = {
    total: tasks.length,
    assigned: tasks.filter((task) => task.status === 'assigned').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'assigned', label: 'Назначено' },
    { id: 'in_progress', label: 'В работе' },
    { id: 'completed', label: 'Выполнено' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Курьер</h1>
            <p className="text-sm text-slate-500">{user?.name || user?.username || 'Смена курьера'}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadTasks}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCcw className="h-4 w-4" />
              Обновить
            </button>
            <button
              onClick={logout}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Выход
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Всего" value={counters.total} />
          <StatCard label="Назначено" value={counters.assigned} />
          <StatCard label="В работе" value={counters.inProgress} />
          <StatCard label="Выполнено" value={counters.completed} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {filters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filter === item.id
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Загрузка заявок...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <MapPin className="mx-auto mb-4 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">Нет заявок для отображения</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(task.status)}`}>
                        {getStatusIcon(task.status)}
                        {statusLabels[task.status] || task.status}
                      </span>
                      <span className="text-xs font-medium text-slate-400">#{task.id}</span>
                    </div>

                    <h2 className="text-base font-semibold text-slate-950">
                      {task.recipientName || task.senderName || 'Заявка без имени'}
                    </h2>
                    {task.recipientPhone && <p className="mt-1 text-sm text-slate-500">Тел: {task.recipientPhone}</p>}
                    {task.senderAddress && <p className="mt-2 text-sm text-slate-500">Забрать: {task.senderAddress}</p>}
                    {task.deliveryAddress && <p className="mt-1 text-sm text-slate-700">Доставить: {task.deliveryAddress}</p>}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:text-right">
                    {task.deliveryTimeFrom || task.deliveryTimeTo ? (
                      <p>{task.deliveryTimeFrom || '—'} — {task.deliveryTimeTo || '—'}</p>
                    ) : (
                      <p>{new Date(task.createdAt).toLocaleDateString('ru-RU')}</p>
                    )}
                    {task.placesCount ? <p className="text-xs text-slate-500">Мест: {task.placesCount}</p> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
