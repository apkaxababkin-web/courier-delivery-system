import { Inbox, Plus, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onCreateClick?: () => void;
  onAiCreateClick?: () => void;
}

export function EmptyState({ onCreateClick, onAiCreateClick }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="flex justify-center mb-4">
        <div className="bg-gray-100 p-4 rounded-full">
          <Inbox className="w-8 h-8 text-gray-400" />
        </div>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Заявок пока нет</h3>
      <p className="text-gray-600 mb-8">
        Создайте первую заявку вручную или через искусственный интеллект
      </p>
      <div className="flex gap-3 justify-center">
        {onCreateClick && (
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Создать заявку
          </button>
        )}
        {onAiCreateClick && (
          <button
            onClick={onAiCreateClick}
            className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            Создать по тексту
          </button>
        )}
      </div>
    </div>
  );
}
