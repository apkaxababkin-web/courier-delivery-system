import type { Request } from '../model/types';
import { TaskCard } from './TaskCard';
import { EmptyState } from './EmptyState';

interface TasksListProps {
  requests: Request[];
  isLoading?: boolean;
  onEdit?: (request: Request) => void;
  onDelete?: (id: number) => void;
  onCreateClick?: () => void;
  onAiCreateClick?: () => void;
}

export function TasksList({
  requests,
  isLoading,
  onEdit,
  onDelete,
  onCreateClick,
  onAiCreateClick,
}: TasksListProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        onCreateClick={onCreateClick}
        onAiCreateClick={onAiCreateClick}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="space-y-3">
        {requests.map((request) => (
          <TaskCard
            key={request.id}
            request={request}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
