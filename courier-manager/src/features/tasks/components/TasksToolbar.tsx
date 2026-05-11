import { Plus, Sparkles, Search, CalendarDays } from 'lucide-react';
import type { StatusFilter } from '../model/types';

interface TasksToolbarProps {
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
  onAiCreateClick: () => void;
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все заявки' },
  { value: 'pending', label: 'Новые' },
  { value: 'assigned', label: 'Назначена' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'cancelled', label: 'Отменённые' },
];

export function TasksToolbar({
  selectedStatus,
  onStatusChange,
  selectedDate,
  onDateChange,
  searchQuery,
  onSearchChange,
  onCreateClick,
  onAiCreateClick,
}: TasksToolbarProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onStatusChange(chip.value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                selectedStatus === chip.value
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск по клиенту, адресу, телефону или комментарию..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative min-w-[220px]">
              <CalendarDays className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              onClick={onCreateClick}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-5 w-5" />
              Создать заявку
            </button>

            <button
              onClick={onAiCreateClick}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Sparkles className="h-5 w-5" />
              Создать по тексту
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
