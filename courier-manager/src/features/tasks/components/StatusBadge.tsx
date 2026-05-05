import { getStatusLabel, getStatusBadgeClass, getStatusIcon } from '../model/stats';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(status)}`}>
      {getStatusIcon(status)}
      {getStatusLabel(status)}
    </span>
  );
}
