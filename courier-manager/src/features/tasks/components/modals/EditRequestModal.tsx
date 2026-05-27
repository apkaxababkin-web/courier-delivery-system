import { useEffect, useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import type { Request } from '../../model/types';

type EditableRequest = Partial<Pick<
  Request,
  | 'requestType'
  | 'senderName'
  | 'senderPhone'
  | 'senderAddress'
  | 'recipientName'
  | 'recipientPhone'
  | 'recipientAddress'
  | 'deliveryAddress'
  | 'packageDescription'
  | 'specialInstructions'
  | 'deliveryTimeFrom'
  | 'deliveryTimeTo'
  | 'placesCount'
  | 'comments'
  | 'paymentMethod'
  | 'paymentAmount'
>>;

interface EditRequestModalProps {
  request: Request | null;
  displayNumber: number | null;
  isOpen: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onSave: (requestId: number, data: EditableRequest) => void;
  onDelete: (request: Request, displayNumber: number) => void;
}

const requestTypeLabels: Record<string, string> = {
  delivery: 'Доставка',
  movement: 'Перемещение',
  nuts: 'Орехи',
  courier_call: 'Вызов курьера',
  pickup_from_tc: 'ТК',
  simple: 'Простая заявка',
};

export function EditRequestModal({
  request,
  displayNumber,
  isOpen,
  isSaving,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}: EditRequestModalProps) {
  const [formData, setFormData] = useState<EditableRequest>({});

  useEffect(() => {
    if (!request || !isOpen) return;
    setFormData({
      requestType: request.requestType,
      senderName: request.senderName || '',
      senderPhone: request.senderPhone || '',
      senderAddress: request.senderAddress || '',
      recipientName: request.recipientName || '',
      recipientPhone: request.recipientPhone || '',
      recipientAddress: request.recipientAddress || '',
      deliveryAddress: request.deliveryAddress || '',
      packageDescription: request.packageDescription || '',
      specialInstructions: request.specialInstructions || '',
      deliveryTimeFrom: request.deliveryTimeFrom || '',
      deliveryTimeTo: request.deliveryTimeTo || '',
      placesCount: request.placesCount,
      comments: request.comments || '',
      paymentMethod: request.paymentMethod || 'paid',
      paymentAmount: request.paymentAmount || 0,
    });
  }, [request, isOpen]);

  if (!request || !isOpen) return null;

  const updateField = <K extends keyof EditableRequest>(field: K, value: EditableRequest[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(request.id, {
      ...formData,
      recipientName: formData.recipientName || formData.senderName || 'Без получателя',
      recipientPhone: formData.recipientPhone || formData.senderPhone || '',
      deliveryAddress: formData.deliveryAddress || formData.recipientAddress || formData.senderAddress || '',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-h-[92vh] w-[min(980px,calc(100vw-32px))] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      overlayStyle={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)' }}
    >
      <form onSubmit={submit} className="flex max-h-[92vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Заявка {displayNumber ? `#${displayNumber}` : `ID ${request.id}`}
              </h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                {requestTypeLabels[request.requestType] || request.requestType}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Карточка заявки: можно быстро поменять основные данные.</p>
          </div>

          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-950">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-950">Отправитель</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Имя отправителя" value={formData.senderName || ''} onChange={(value) => updateField('senderName', value)} />
              <Field label="Телефон отправителя" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} />
              <Field label="Адрес отправителя" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} className="md:col-span-2" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-950">Получатель</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Имя получателя" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} />
              <Field label="Телефон получателя" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} />
              <Field label="Адрес доставки" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} className="md:col-span-2" />
              <Field label="Квартира/офис" value={formData.recipientAddress || ''} onChange={(value) => updateField('recipientAddress', value)} className="md:col-span-2" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-950">Детали</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} />
              <Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} />
              <Field label="Количество мест" inputMode="numeric" value={formData.placesCount ?? ''} onChange={(value) => updateField('placesCount', value === '' ? undefined : Number(value))} />
              <Textarea label="Описание/груз" value={formData.packageDescription || ''} onChange={(value) => updateField('packageDescription', value)} className="md:col-span-3" />
              <Textarea label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-3" />
              <Textarea label="Особые инструкции" value={formData.specialInstructions || ''} onChange={(value) => updateField('specialInstructions', value)} className="md:col-span-3" />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={isSaving || isDeleting}
            onClick={() => onDelete(request, displayNumber || request.id)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Удалить заявку
          </button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
              Отмена
            </button>
            <button disabled={isSaving || isDeleting} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSaving ? 'Сохраняем...' : 'Сохранить изменения'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  className = '',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white"
      />
    </label>
  );
}
