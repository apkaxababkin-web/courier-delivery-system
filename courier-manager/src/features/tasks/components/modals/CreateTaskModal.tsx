import { useState } from 'react';
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

const initialFormData: TaskFormData = {
  requestType: 'delivery',
  clientId: undefined,
  senderName: '',
  senderPhone: '',
  senderAddress: '',
  recipientName: '',
  recipientPhone: '',
  deliveryAddress: '',
  packageDescription: '',
  comments: '',
  paymentMethod: 'paid',
};

export function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  isLoading,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<TaskFormData>(initialFormData);

  if (!isOpen) return null;

  const updateField = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onSubmit({
      ...formData,
      requestType: formData.requestType || 'delivery',
      recipientName: formData.recipientName || '',
      recipientPhone: formData.recipientPhone || '',
      deliveryAddress: formData.deliveryAddress || formData.recipientAddress || '',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      overlayStyle={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)' }}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Создать заявку</h2>
            <p className="mt-1 text-sm text-slate-500">
              Заполните основные данные для новой курьерской заявки.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Тип заявки</label>
              <select
                value={formData.requestType || 'delivery'}
                onChange={(e) => updateField('requestType', e.target.value as TaskFormData['requestType'])}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
              >
                <option value="delivery">Доставка</option>
                <option value="movement">Перемещение</option>
                <option value="courier_call">Вызов курьера</option>
                <option value="pickup_from_tc">Забор из ТК</option>
                <option value="simple">Простая заявка</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Клиент</label>
              <select
                value={formData.clientId || ''}
                onChange={(e) => updateField('clientId', e.target.value ? Number(e.target.value) : undefined)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
              >
                <option value="">Без клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Отправитель"
              value={formData.senderName || ''}
              onChange={(value) => updateField('senderName', value)}
              placeholder="Имя отправителя"
            />
            <Field
              label="Телефон отправителя"
              value={formData.senderPhone || ''}
              onChange={(value) => updateField('senderPhone', value)}
              placeholder="+7..."
            />
            <Field
              label="Получатель *"
              value={formData.recipientName || ''}
              onChange={(value) => updateField('recipientName', value)}
              placeholder="Имя получателя"
              required
            />
            <Field
              label="Телефон получателя *"
              value={formData.recipientPhone || ''}
              onChange={(value) => updateField('recipientPhone', value)}
              placeholder="+7..."
              required
            />
            <Field
              label="Адрес забора"
              value={formData.senderAddress || ''}
              onChange={(value) => updateField('senderAddress', value)}
              placeholder="Откуда забрать"
            />
            <Field
              label="Адрес доставки *"
              value={formData.deliveryAddress || ''}
              onChange={(value) => updateField('deliveryAddress', value)}
              placeholder="Куда доставить"
              required
            />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Описание груза</label>
              <textarea
                value={formData.packageDescription || ''}
                onChange={(e) => updateField('packageDescription', e.target.value)}
                placeholder="Документы, посылка, груз..."
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Комментарий</label>
              <textarea
                value={formData.comments || ''}
                onChange={(e) => updateField('comments', e.target.value)}
                placeholder="Особенности доставки, инструкции для курьера..."
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Создание...' : 'Создать заявку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
      />
    </div>
  );
}
