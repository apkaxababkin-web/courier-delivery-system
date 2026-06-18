import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { StatusFilter } from '../model/types';
import { formatLocalDateWithOptions, getLocalDateKey, toLocalDateKey } from '../../../lib/local-time';

type CalendarDay =
  | { key: string; day: null; date: null }
  | { key: string; day: number; date: Date };

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getTodayDate() {
  return getLocalDateKey();
}

function parseDateKey(date: string) {
  if (!date) return new Date();
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  return toLocalDateKey(date);
}

function formatDateLabel(date: string) {
  if (!date) return 'Выбрать дату';

  return formatLocalDateWithOptions(date, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }, date);
}

interface TasksToolbarProps {
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
  onAiCreateClick: () => void;
  hideDatePicker?: boolean;
}

export function TasksToolbar({
  selectedDate,
  onDateChange,
  searchQuery,
  onSearchChange,
  hideDatePicker = false,
}: TasksToolbarProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseDateKey(selectedDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const selectedDateObject = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const selectedDateKey = selectedDate || getTodayDate();
  const todayKey = getTodayDate();

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const mondayFirstOffset = firstDay === 0 ? 6 : firstDay - 1;

    return [
      ...Array.from({ length: mondayFirstOffset }, (_, index): CalendarDay => ({ key: `empty-${index}`, day: null, date: null })),
      ...Array.from({ length: daysInMonth }, (_, index): CalendarDay => {
        const day = index + 1;
        const date = new Date(year, month, day);
        return { key: toDateKey(date), day, date };
      }),
    ];
  }, [visibleMonth]);

  const handlePickDate = (date: Date) => {
    onDateChange(toDateKey(date));
    setIsCalendarOpen(false);
  };

  const handleCalendarToggle = () => {
    const date = parseDateKey(selectedDate);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsCalendarOpen((value) => !value);
  };

  const handleTodayClick = () => {
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    handlePickDate(today);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
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

              {!hideDatePicker && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  {isCalendarOpen ? (
                    <button
                      type="button"
                      aria-label="Закрыть календарь"
                      className="fixed inset-0 z-10 cursor-default bg-transparent"
                      onClick={() => setIsCalendarOpen(false)}
                    />
                  ) : null}

                  <button
                    type="button"
                    onClick={handleCalendarToggle}
                    className="relative z-20 inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
                  >
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <span className="whitespace-nowrap capitalize">{formatDateLabel(selectedDateKey)}</span>
                  </button>

                  {isCalendarOpen ? (
                    <div className="absolute left-0 top-14 z-30 w-[304px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/10">
                      <div className="mb-3 flex items-center justify-between gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label="Предыдущий месяц"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="text-center">
                          <div className="text-sm font-semibold text-slate-900">{MONTHS[visibleMonth.getMonth()]}</div>
                          <div className="text-xs text-slate-400">{visibleMonth.getFullYear()}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label="Следующий месяц"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {WEEK_DAYS.map((day) => (
                          <div key={day} className="py-1">
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((item) => {
                          if (!item.date) {
                            return <div key={item.key} className="h-9" />;
                          }

                          const dateKey = toDateKey(item.date);
                          const isSelected = dateKey === toDateKey(selectedDateObject);
                          const isToday = dateKey === todayKey;

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => handlePickDate(item.date)}
                              className={[
                                'inline-flex h-9 items-center justify-center rounded-xl text-sm font-medium transition',
                                isSelected
                                  ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                                isToday && !isSelected ? 'ring-1 ring-inset ring-slate-300' : '',
                              ].join(' ')}
                            >
                              {item.day}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={handleTodayClick}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          Сегодня
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsCalendarOpen(false)}
                          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          Закрыть
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
