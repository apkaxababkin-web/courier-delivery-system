import { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import { StatusBadge } from '../StatusBadge';
import {
  getRequestActivity,
  type RequestActivity,
} from '../../../../lib/api';
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


const activityFieldLabels: Record<string, string> = {
  requestType: 'Тип заявки',
  clientId: 'Клиент',
  courierId: 'Курьер',

  recipientName: 'Имя получателя',
  recipientPhone: 'Телефон получателя',
  recipientAddress: 'Адрес получателя',
  recipientCompany: 'Компания получателя',
  recipientCity: 'Город получателя',

  deliveryAddress: 'Адрес доставки',
  deliveryCity: 'Город доставки',

  packageDescription: 'Описание груза',
  packageType: 'Тип груза',
  placesCount: 'Количество мест',

  senderName: 'Контактное лицо отправителя',
  senderCompany: 'Компания отправителя',
  senderCity: 'Город отправителя',
  senderAddress: 'Адрес отправителя',
  senderPhone: 'Телефон отправителя',

  items: 'Содержимое / позиции',
  callReason: 'Причина вызова',

  tcName: 'Транспортная компания',
  tcAddress: 'Адрес ТК',
  trackingNumber: 'Трек-номер',

  description: 'Описание',
  specialInstructions: 'Особые инструкции',
  comments: 'Комментарий',

  paymentMethod: 'Способ оплаты',
  paymentAmount: 'Сумма',
  deliveryFee: 'Стоимость доставки',

  deliveryTimeFrom: 'Время с',
  deliveryTimeTo: 'Время до',
  estimatedMinutes: 'Расчётное время',

  scheduledAt: 'Дата заявки',
  status: 'Статус',
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}


function formatActivityValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'не указано';
  }

  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет';
  }

  if (typeof value === 'string') {
    const parsedDate = new Date(value);
    if (
      value.includes('T') &&
      !Number.isNaN(parsedDate.getTime())
    ) {
      return formatDate(value);
    }
  }

  return String(value);
}

function parseActivityChanges(
  changes?: string | null,
): Array<{
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}> {
  if (!changes) return [];

  try {
    const parsed = JSON.parse(changes) as Record<
      string,
      {
        from?: unknown;
        to?: unknown;
      }
    >;

    return Object.entries(parsed)
      .filter(([field, value]) =>
        Boolean(
          value &&
          typeof value === 'object' &&
          ('from' in value || 'to' in value) &&
          field !== 'updatedAt' &&
          field !== 'scheduledPushSentAt' &&
          field !== 'courierId' &&
          field !== 'status',
        ),
      )
      .map(([field, value]) => ({
        field,
        label: activityFieldLabels[field] || field,
        from: value.from,
        to: value.to,
      }));
  } catch {
    return [];
  }
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
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-900">
        {String(value)}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  columns = 2,
}: {
  title: string;
  children: React.ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
      <div
        className={
          columns === 3
            ? 'grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3'
            : 'grid gap-x-5 gap-y-3 sm:grid-cols-2'
        }
      >
        {children}
      </div>
    </section>
  );
}

function getActivityPresentation(item: RequestActivity) {
  const actorName =
    item.actorName ||
    (item.actorType === 'courier'
      ? 'Курьер'
      : item.actorType === 'system'
        ? 'Система'
        : 'Менеджер');

  switch (item.action) {
    case 'created':
      return {
        title: 'Заявка создана',
        person: actorName,
      };

    case 'updated':
      return {
        title: 'Заявка изменена',
        person: actorName,
      };

    case 'courier_assigned': {
      const assignedCourier =
        item.note?.match(/^Назначен курьер:\s*(.+)$/)?.[1]?.trim();

      return {
        title: 'Назначен курьер',
        person: assignedCourier || actorName,
      };
    }

    case 'courier_unassigned':
      return {
        title: 'Назначение курьера снято',
        person: actorName,
      };

    case 'started':
      return {
        title: 'Заявка в работе',
        person: actorName,
      };

    case 'completed':
      return {
        title: 'Заявка выполнена',
        person: actorName,
      };

    case 'cancelled':
      return {
        title: 'Заявка отменена',
        person: actorName,
      };

    default:
      return {
        title: item.note || 'Статус заявки изменён',
        person: actorName,
      };
  }
}

function ActivityHistory({
  requestId,
  isOpen,
}: {
  requestId: number;
  isOpen: boolean;
}) {
  const [activity, setActivity] = useState<RequestActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !requestId) return;

    let cancelled = false;

    setLoading(true);
    setFailed(false);

    getRequestActivity(requestId)
      .then((rows) => {
        if (!cancelled) {
          setActivity(rows);
        }
      })
      .catch((error) => {
        console.error('[RequestActivity] Failed to load:', error);

        if (!cancelled) {
          setActivity([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-950">
          История заявки
        </h3>
      </div>

      {loading ? (
        <div className="py-3 text-sm text-slate-400">
          Загрузка истории…
        </div>
      ) : failed ? (
        <div className="py-3 text-sm text-rose-500">
          Не удалось загрузить историю
        </div>
      ) : activity.length === 0 ? (
        <div className="py-3 text-sm text-slate-400">
          История изменений пока отсутствует
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {activity.map((item) => {
            const presentation = getActivityPresentation(item);
            const changes =
              item.action === 'updated'
                ? parseActivityChanges(item.changes)
                : [];

            return (
              <div
                key={item.id}
                className="grid grid-cols-[12px_minmax(0,1fr)_auto] gap-x-2 border-b border-slate-100 py-2.5 last:border-b-0"
              >
                <div className="pt-[7px]">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                </div>

                <div className="min-w-0">
                  <div className="text-sm text-slate-900">
                    <span className="font-semibold">
                      {presentation.title}
                    </span>

                    {presentation.person && (
                      <>
                        <span className="mx-2 text-slate-300">—</span>
                        <span>{presentation.person}</span>
                      </>
                    )}
                  </div>

                  {changes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {changes.map((change) => (
                        <div
                          key={`${item.id}-${change.field}`}
                          className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                        >
                          <span className="text-slate-500">
                            {change.label}:
                          </span>{' '}

                          <span className="text-slate-400">
                            {formatActivityValue(change.from)}
                          </span>

                          <span className="mx-1.5 text-slate-300">→</span>

                          <span className="font-medium text-slate-800">
                            {formatActivityValue(change.to)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="whitespace-nowrap pl-3 text-xs text-slate-400">
                  {formatActivityDate(item.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
      className="flex max-h-[calc(100vh-32px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
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

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Основное" columns={3}>
            <Field label="Клиент ID" value={request.clientId} />
            <Field label="Курьер" value={request.courierName || request.courierId} />
            <Field label="Количество мест" value={request.placesCount} />
            <Field label="Описание груза" value={request.packageDescription} />
            <Field label="Тип груза" value={request.packageType} />
            <Field label="Расчётное время, мин." value={request.estimatedMinutes} />
          </Section>

          <div className="space-y-4">
            <Section title="Оплата" columns={3}>
              <Field label="Способ оплаты" value={payment} />
              <Field label="Сумма" value={request.paymentAmount} />
              <Field label="Стоимость доставки" value={request.deliveryFee} />
            </Section>

            {(request.deliveryTimeFrom || request.deliveryTimeTo) && (
              <Section title="Время">
                <Field label="Доставка с" value={request.deliveryTimeFrom} />
                <Field label="Доставка до" value={request.deliveryTimeTo} />
              </Section>
            )}
          </div>

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

          <div className="lg:col-span-2">
            <Section title="Детали заявки" columns={3}>
              <Field label="Содержимое / позиции" value={request.items} />
              <Field label="Причина вызова" value={request.callReason} />
              <Field label="Транспортная компания" value={request.tcName} />
              <Field label="Адрес ТК" value={request.tcAddress} />
              <Field label="Трек-номер" value={request.trackingNumber} />
              <Field label="Описание" value={request.description} />
              <Field label="Особые инструкции" value={request.specialInstructions} />
              <Field label="Комментарии" value={request.comments} />
            </Section>
          </div>

          <div className="lg:col-span-2">
            <ActivityHistory
              requestId={request.id}
              isOpen={isOpen}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Закрыть
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Pencil className="h-4 w-4" />
          Редактировать
        </button>
      </div>
    </Modal>
  );
}
