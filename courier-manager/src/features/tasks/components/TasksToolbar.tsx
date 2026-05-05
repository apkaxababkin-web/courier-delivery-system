import { Plus, Sparkles } from 'lucide-react';

interface TasksToolbarProps {
  onCreateClick: () => void;
  onAiCreateClick: () => void;
}

export function TasksToolbar({ onCreateClick, onAiCreateClick }: TasksToolbarProps) {
  return (
    <div className="flex gap-3">
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
  );
}
