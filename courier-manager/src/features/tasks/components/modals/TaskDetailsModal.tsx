import { X, Pencil } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import { StatusBadge } from '../StatusBadge';
import type { Request } from '../../model/types';

interface TaskDetailsModalProps {
  isOpen: boolean;
  request: Request | null;
  displayNumber: number | null;
  onClose: () => void;
  onEdit: () => void;
}

const requestTypeLabels: Record<Request['requestType'], string> = {
  delivery: 'Доставка',
  movement: 'Перемещение',
  nuts: 'Орехи',
  courier_call: 'Вызов курьера',
  pickup_from_tc: 'Забор из ТК',
  simple: 'Простая заявка',
};

const paymentLabels: Record<NonNullable<Request['paymentMethod']>, string> = {
  paid: 'Оплачено',
  transfer: 'Перевод',
  cash: 'Наличные',
  terminal: 'Терминал',
  qr: 'QR',
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU');
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === undefined || value === null || value === '') return null;

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
        {String(value)}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-950">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function TaskDetailsModal({
  isOpen,
  request,
  displayNumber,
  onClose,
  onEdit,
}: TaskDetailsModalProps) {
  if (!request) return null;

  const payment =
    request.paymentMethod && paymentLabels[request.paymentMethod]
      ? paymentLabels[request.paymentMethod]
      : request.paymentMethod;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">
              {displayNumber ? `Заявка #${displayNumber}` : 'Заявка'}
            </h2>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {requestTypeLabels[request.requestType] || request.requestType}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        <Section title="Основное">
          <Field label="Клиент ID" value={request.clientId} />
          <Field label="Курьер" value={request.courierName || request.courierId} />
          <Field label="Количество мест" value={request.placesCount} />
          <Field label="Описание груза" value={request.packageDescription} />
          <Field label="Тип груза" value={request.packageType} />
          <Field label="Расчётное время, мин." value={request.estimatedMinutes} />
        </Section>

        <Section title="Отправитель">
          <Field label="Имя" value={request.senderName} />
          <Field label="Компания" value={request.senderCompany} />
          <Field label="Телефон" value={request.senderPhone} />
          <Field label="Город" value={request.senderCity} />
          <Field label="Адрес" value={request.senderAddress} />
        </Section>

        <Section title="Получатель">
          <Field label="Имя" value={request.recipientName} />
          <Field label="Компания" value={request.recipientCompany} />
          <Field label="Телефон" value={request.recipientPhone} />
          <Field label="Город" value={request.recipientCity} />
          <Field label="Адрес" value={request.recipientAddress} />
          <Field label="Адрес доставки" value={request.deliveryAddress} />
          <Field label="Город доставки" value={request.deliveryCity} />
        </Section>

        <Section title="Детали заявки">
          <Field label="Содержимое / позиции" value={request.items} />
          <Field label="Причина вызова" value={request.callReason} />
          <Field label="Транспортная компания" value={request.tcName} />
          <Field label="Адрес ТК" value={request.tcAddress} />
          <Field label="Трек-номер" value={request.trackingNumber} />
          <Field label="Описание" value={request.description} />
          <Field label="Особые инструкции" value={request.specialInstructions} />
          <Field label="Комментарии" value={request.comments} />
        </Section>

        <Section title="Оплата и время">
          <Field label="Способ оплаты" value={payment} />
          <Field label="Сумма" value={request.paymentAmount} />
          <Field label="Стоимость доставки" value={request.deliveryFee} />
          <Field label="Доставка с" value={request.deliveryTimeFrom} />
          <Field label="Доставка до" value={request.deliveryTimeTo} />
          <Field label="Запланировано" value={formatDate(request.scheduledAt)} />
          <Field label="Создано" value={formatDate(request.createdAt)} />
          <Field label="Выполнено" value={formatDate(request.completedAt)} />
          <Field label="Обновлено" value={formatDate(request.updatedAt)} />
        </Section>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Закрыть
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Pencil className="h-4 w-4" />
          Редактировать
        </button>
      </div>
    </Modal>
  );
}
