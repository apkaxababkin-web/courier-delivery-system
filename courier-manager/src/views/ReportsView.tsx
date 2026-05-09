import { BarChart3, CheckCircle2, Mail, Package, RefreshCcw, Truck } from 'lucide-react';
import { useManagerRealtime } from '../lib/useManagerRealtime';
import { RealtimeStatusCard } from '../components/RealtimeStatusCard';

function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function StatCard({ title, value, hint, icon: Icon }: { title: string; value: number | string; hint: string; icon: any }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon size={24} />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{hint}</p>
    </div>
  );
}

export default function ReportsView() {
  const realtime = useManagerRealtime(5000);
  const tasks = realtime.snapshot?.tasks ?? [];
  const requests = realtime.snapshot?.requests ?? [];
  const mails = realtime.snapshot?.mails ?? [];
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const activeTasks = tasks.filter((task) => task.status === 'assigned' || task.status === 'in_progress').length;
  const completedRequests = requests.filter((request) => request.status === 'completed').length;
  const pendingRequests = requests.filter((request) => request.status === 'pending' || request.status === 'assigned').length;
  const deliveredMails = mails.filter((mail) => mail.status === 'delivered').length;
  const notDeliveredMails = mails.filter((mail) => mail.status === 'not_delivered').length;

  return (
    <div className="space-y-6 p-6">
      <RealtimeStatusCard isRefreshing={realtime.isRefreshing} error={realtime.error} lastSyncAt={realtime.lastSyncAt} onRefresh={() => realtime.refresh(true)} />

      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-slate-200"><BarChart3 size={16} />Realtime analytics</div>
            <h2 className="mt-4 text-3xl font-bold">Отчёты по доставкам</h2>
            <p className="mt-2 max-w-2xl text-slate-300">Показатели строятся по реальным данным realtime snapshot: заявки, задачи, письма и статусы доставки.</p>
          </div>
          <button onClick={() => realtime.refresh(true)} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
            <RefreshCcw size={16} className={realtime.isRefreshing ? 'animate-spin' : ''} />Обновить
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Всего задач" value={tasks.length} hint={`${completedTasks} завершено, ${activeTasks} активно`} icon={Package} />
        <StatCard title="Всего заявок" value={requests.length} hint={`${completedRequests} завершено, ${pendingRequests} ожидают`} icon={Truck} />
        <StatCard title="Писем в системе" value={mails.length} hint={`${deliveredMails} доставлено, ${notDeliveredMails} не доставлено`} icon={Mail} />
        <StatCard title="Completion rate" value={`${pct(completedTasks, tasks.length)}%`} hint="По завершённым задачам" icon={CheckCircle2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Сводка по заявкам</h3>
          <div className="mt-5 space-y-3">
            {['pending', 'assigned', 'in_progress', 'completed', 'cancelled'].map((status) => <div key={status} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-600">{status}</span><span className="text-sm font-bold text-slate-900">{requests.filter((request) => request.status === status).length}</span></div>)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Сводка по письмам</h3>
          <div className="mt-5 space-y-3">
            {['not_delivered', 'delivered', 'failed'].map((status) => <div key={status} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-600">{status}</span><span className="text-sm font-bold text-slate-900">{mails.filter((mail) => mail.status === status).length}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
