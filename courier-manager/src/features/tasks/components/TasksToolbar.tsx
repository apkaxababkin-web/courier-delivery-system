import { Plus, Sparkles, Search } from 'lucide-react';
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

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Новые' },
  { value: 'assigned', label: 'Назначена' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'cancelled', label: 'Отменённые' },
];

export function TasksToolbar({
  selectedStatus,
  onStatusChange,
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
      {/* Filters Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        {/* Status Chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onStatusChange(chip.value)}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${
                selectedStatus === chip.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Date Range and Search */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search */}
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по клиенту или адресу..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Создать заявку
        </button>
        <button
          onClick={onAiCreateClick}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          <Sparkles className="w-5 h-5" />
          Создать по тексту
        </button>
      </div>
    </div>
  );
}
