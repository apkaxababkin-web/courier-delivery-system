import { Activity, AlertCircle, CheckCircle2, RefreshCcw } from 'lucide-react';
import { formatLocalTime } from '../lib/local-time';

interface RealtimeStatusCardProps {
  isRefreshing?: boolean;
  error?: string | null;
  lastSyncAt?: string | null;
  onRefresh?: () => void;
}

export function RealtimeStatusCard({
  isRefreshing = false,
  error = null,
  lastSyncAt = null,
  onRefresh,
}: RealtimeStatusCardProps) {
  const isHealthy = !error;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-5 shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_35%)]" />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isHealthy ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            {isHealthy ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Activity size={14} />
              Realtime Sync
            </div>

            <div className={`mt-1 text-lg font-semibold ${isHealthy ? 'text-slate-900' : 'text-red-700'}`}>
              {isHealthy ? 'Система синхронизирована' : 'Ошибка синхронизации'}
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {error
                ? error
                : lastSyncAt
                  ? `Последнее обновление: ${formatLocalTime(lastSyncAt)}`
                  : 'Ожидание первого обновления'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>
    </div>
  );
}
