import { FileText, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';
import type { Statistics, StatusFilter } from '../model/types';

interface TasksStatsProps {
  stats: Statistics;
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
}

const cards: Array<{
  key: StatusFilter;
  label: string;
  value: keyof Statistics | 'total';
  icon: typeof FileText;
  valueClass: string;
  iconClass: string;
}> = [
  { key: 'all', label: 'Всего заявок', value: 'total', icon: FileText, valueClass: 'text-slate-950', iconClass: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'Новые', value: 'pending', icon: CheckCircle2, valueClass: 'text-emerald-600', iconClass: 'bg-emerald-50 text-emerald-600' },
  { key: 'in_progress', label: 'В работе', value: 'in_progress', icon: Clock, valueClass: 'text-amber-600', iconClass: 'bg-amber-50 text-amber-600' },
  { key: 'completed', label: 'Завершённые', value: 'completed', icon: TrendingUp, valueClass: 'text-purple-600', iconClass: 'bg-purple-50 text-purple-600' },
  { key: 'cancelled', label: 'Отменённые', value: 'cancelled', icon: XCircle, valueClass: 'text-red-600', iconClass: 'bg-red-50 text-red-600' },
];

export function TasksStats({ stats, selectedStatus, onStatusChange }: TasksStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = selectedStatus === card.key;

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onStatusChange(card.key)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              isActive ? 'border-slate-950 ring-4 ring-slate-950/5' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">{card.label}</p>
                <p className={`text-2xl font-semibold tracking-tight ${card.valueClass}`}>{stats[card.value]}</p>
              </div>
              <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${card.iconClass}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
