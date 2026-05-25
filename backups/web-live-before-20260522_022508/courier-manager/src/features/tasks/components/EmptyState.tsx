import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  onCreateClick?: () => void;
  onAiCreateClick?: () => void;
}

export function EmptyState({}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mb-4 flex justify-center">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Inbox className="h-8 w-8 text-slate-400" />
        </div>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-950">Заявок пока нет</h3>
      <p className="mx-auto max-w-md text-sm text-slate-500">
        Для создания новой заявки используйте верхнюю панель действий.
      </p>
    </div>
  );
}
