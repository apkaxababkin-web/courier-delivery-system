import { X } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import type { TaskFormData, Client } from '../../model/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
  clients: Client[];
  isLoading?: boolean;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  isLoading,
}: CreateTaskModalProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Создать заявку</h2>
      </div>
      <div className="p-6 max-h-96 overflow-y-auto">
        <p className="text-gray-600 text-sm">
          Используйте форму ниже для создания новой заявки.
        </p>
        {/* Form content will be implemented based on existing TasksView form */}
      </div>
      <div className="flex gap-3 justify-end p-6 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Отмена
        </button>
        <button
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Создание...' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}
