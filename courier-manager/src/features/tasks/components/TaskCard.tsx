import type { Request } from '../model/types';
import { getStatusLabel, getStatusBadgeClass, getStatusIcon } from '../model/stats';

interface TaskCardProps {
  request: Request;
}

export function TaskCard({ request }: TaskCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-gray-900">#{request.id}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(request.status)}`}>
              {getStatusIcon(request.status)}
              {getStatusLabel(request.status)}
            </span>
          </div>
          <p className="text-sm text-gray-700 font-medium">{request.senderName || 'N/A'}</p>
          <p className="text-sm text-gray-600">{request.deliveryAddress || 'N/A'}</p>
          {request.createdAt && (
            <p className="text-xs text-gray-500 mt-2">
              {new Date(request.createdAt).toLocaleDateString('ru-RU')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
