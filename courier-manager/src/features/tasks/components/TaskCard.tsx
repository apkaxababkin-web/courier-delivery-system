import type { Request } from '../model/types';
import { getStatusLabel, getStatusBadgeClass, getStatusIcon } from '../model/stats';
import { formatLocalDate } from '../../../lib/local-time';

interface TaskCardProps {
  request: Request;
}

export function TaskCard({ request }: TaskCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-950">#{request.id}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(request.status)}`}>
              {getStatusIcon(request.status)}
              {getStatusLabel(request.status)}
            </span>
          </div>
          <p className="text-sm text-gray-700 font-medium">{request.senderName || 'N/A'}</p>
          <p className="text-sm text-gray-600">{request.deliveryAddress || 'N/A'}</p>
          {request.createdAt && (
            <p className="text-xs text-slate-500 mt-2">
              {formatLocalDate(request.createdAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
