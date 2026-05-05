import type { Request } from '../model/types';
import { getStatusLabel, getStatusBadgeClass, getStatusIcon } from '../model/stats';

interface TasksTableProps {
  requests: Request[];
  isLoading?: boolean;
}

export function TasksTable({ requests, isLoading }: TasksTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Нет заявок</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">ID</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Статус</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Отправитель</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Адрес доставки</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Дата</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">#{request.id}</td>
              <td className="px-6 py-4 text-sm">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(request.status)}`}>
                  {getStatusIcon(request.status)}
                  {getStatusLabel(request.status)}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">{request.senderName || 'N/A'}</td>
              <td className="px-6 py-4 text-sm text-gray-700">{request.deliveryAddress || 'N/A'}</td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {request.createdAt ? new Date(request.createdAt).toLocaleDateString('ru-RU') : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
