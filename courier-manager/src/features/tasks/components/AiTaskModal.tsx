import { X, Sparkles, Loader } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { useState } from 'react';

interface AiTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  isLoading?: boolean;
}

export function AiTaskModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: AiTaskModalProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText('');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Создать заявку по тексту</h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-gray-600 text-sm">
          Опишите заявку в свободной форме, и ИИ автоматически заполнит все поля.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: Доставить документы от ООО Вектор в Москву, ул. Ленина, д. 10..."
          className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="flex gap-3 justify-end p-6 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !text.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Распознавание...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Распознать
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
