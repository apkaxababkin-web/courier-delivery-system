import { CalendarDays, Plus, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { StatusFilter } from '../model/types';

interface TasksToolbarProps {
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  dateFrom: string;
  onDateFromChange: (date: string) => void;
  dateTo: string;
  onDateToChange: (date: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
  onAiCreateClick: () => void;
}

export function TasksToolbar({
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  searchQuery,
  onSearchChange,
  onCreateClick,
  onAiCreateClick,
}: TasksToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1 lg:max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  type="text"
                  placeholder="Поиск по клиенту, адресу, телефону или комментарию..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-slate-400" />

                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                    className="bg-transparent text-sm text-slate-600 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-slate-400" />

                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                    className="bg-transparent text-sm text-slate-600 outline-none"
                  />
                </div>

                <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-950">
                  <SlidersHorizontal className="h-4 w-4" />
                  Фильтры
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={onCreateClick}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95"
              >
                <Plus className="h-4 w-4" />
                Создать заявку
              </button>

              <button
                onClick={onAiCreateClick}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Sparkles className="h-4 w-4" />
                Создать по тексту
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
