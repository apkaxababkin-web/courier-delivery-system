import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Request } from '../model/types';
import { getStatusLabel, getStatusBadgeClass, getStatusIcon } from '../model/stats';

type CourierOption = {
  id: number;
  name: string;
};

interface TasksTableProps {
  requests: Request[];
  couriers?: CourierOption[];
  isLoading?: boolean;
  assigningRequestId?: number | null;
  deletingRequestId?: number | null;
  onAssignCourier?: (requestId: number, courierId: number | null) => void;
  onOpenRequest?: (request: Request, displayNumber: number) => void;
  onDeleteRequest?: (request: Request, displayNumber: number) => void;
}

function CompletionProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const size = 20;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - progress);
  const isDone = total > 0 && completed === total;

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isDone ? 'rgb(16 185 129)' : 'rgb(100 116 139)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>

      <span className={isDone ? 'text-emerald-600' : 'text-slate-600'}>
        {completed}/{total} выполнено
      </span>
    </div>
  );
}

export function TasksTable({

  requests,
  couriers = [],
  isLoading,
  assigningRequestId = null,
  deletingRequestId = null,
  onAssignCourier,
  onOpenRequest,
  onDeleteRequest,
}: TasksTableProps) {
  const totalRequests = requests.length;
  const completedRequests = requests.filter((request) => request.status === 'completed').length;


  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-950">Загружаем заявки</p>
            <p className="mt-1 text-sm text-slate-500">Получаем актуальные данные из системы.</p>
          </div>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
            <FileText className="h-5 w-5" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-950">Нет заявок</p>
            <p className="mt-1 text-sm text-slate-500">Измените фильтры или создайте новую заявку.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Список заявок</h2>
          <CompletionProgress completed={completedRequests} total={totalRequests} />
        </div>

        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Обновлено сейчас
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.08em] text-slate-500 backdrop-blur">
            <tr>
              <th className="px-5 py-3 font-semibold">ID</th>
              <th className="px-5 py-3 font-semibold">Статус</th>
              <th className="px-5 py-3 font-semibold">Отправитель</th>
              <th className="px-5 py-3 font-semibold">Адрес доставки</th>
              <th className="px-5 py-3 font-semibold">Курьер</th>
              <th className="px-5 py-3 font-semibold">Дата</th>
              <th className="px-5 py-3 text-right font-semibold">Действия</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {requests.map((request, index) => {
              const displayNumber = index + 1;
              const isDeleting = deletingRequestId === request.id;

              return (
                <tr
                  key={request.id}
                  onClick={() => onOpenRequest?.(request, displayNumber)}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                >
                  <td className="whitespace-nowrap px-5 py-4 align-middle text-sm font-semibold text-slate-950">
                    #{displayNumber}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 align-middle">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                        request.status
                      )}`}
                    >
                      {getStatusIcon(request.status)}
                      {getStatusLabel(request.status)}
                    </span>
                  </td>

                  <td className="px-5 py-4 align-middle">
                    <div className="font-medium text-slate-800">{request.senderName || 'N/A'}</div>
                    {request.recipientName && (
                      <div className="mt-1 text-xs text-slate-500">Получатель: {request.recipientName}</div>
                    )}
                  </td>

                  <td className="px-5 py-4 align-middle">
                    <div className="max-w-md truncate text-slate-600" title={request.deliveryAddress || 'N/A'}>
                      {request.deliveryAddress || 'N/A'}
                    </div>
                  </td>

                  <td className="px-5 py-4 align-middle" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={request.courierId ?? ''}
                      disabled={!onAssignCourier || assigningRequestId === request.id}
                      onChange={(event) => {
                        const value = event.target.value;
                        onAssignCourier?.(request.id, value ? Number(value) : null);
                      }}
                      className="h-9 w-44 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <option value="">Не назначен</option>
                      {couriers.map((courier) => (
                        <option key={courier.id} value={courier.id}>
                          {courier.name} #{courier.id}
                        </option>
                      ))}
                    </select>
                    {request.courierName && (
                      <div className="mt-1 text-xs text-slate-400">Сейчас: {request.courierName}</div>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 align-middle text-slate-500">
                    {request.createdAt ? new Date(request.createdAt).toLocaleDateString('ru-RU') : 'N/A'}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 text-right align-middle" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => onDeleteRequest?.(request, displayNumber)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 opacity-100 shadow-sm transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
