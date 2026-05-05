import { FileText, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import type { Statistics } from '../model/types';

interface TasksStatsProps {
  stats: Statistics;
}

export function TasksStats({ stats }: TasksStatsProps) {
  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Total */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-2">Всего заявок</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-blue-100 p-3 rounded-lg">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Pending (New) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-2">Новые</p>
            <p className="text-3xl font-bold text-green-600">{stats.pending}</p>
          </div>
          <div className="bg-green-100 p-3 rounded-lg">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
        </div>
      </div>

      {/* Assigned */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-2">Назначена</p>
            <p className="text-3xl font-bold text-blue-600">{stats.assigned}</p>
          </div>
          <div className="bg-blue-100 p-3 rounded-lg">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* In Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-2">В работе</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.in_progress}</p>
          </div>
          <div className="bg-yellow-100 p-3 rounded-lg">
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
        </div>
      </div>

      {/* Completed */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-2">Завершённые</p>
            <p className="text-3xl font-bold text-purple-600">{stats.completed}</p>
          </div>
          <div className="bg-purple-100 p-3 rounded-lg">
            <TrendingUp className="w-6 h-6 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
