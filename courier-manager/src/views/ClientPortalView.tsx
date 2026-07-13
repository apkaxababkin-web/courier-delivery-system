import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  LogOut,
  RefreshCw,
  Search,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import {
  getClientPortalHemotestReconciliation,
  getClientPortalProfile,
  getClientPortalRequests,
  loginClientPortal,
  type ClientPortalHemotestReconciliation,
  type ClientPortalProfile,
  type HemotestReconciliationItem,
  type Request,
} from '../lib/api';

type ClientPage = 'requests' | 'hemotest' | 'profile';
type RequestFilter = 'all' | 'current' | 'completed' | 'cancelled';
type PeriodFilter = 'month' | 'firstHalf' | 'secondHalf';

function MigLogo() {
  return (
    <div className="flex items-center text-left">
      <div>
        <div className="text-[34px] font-black italic leading-none tracking-[-0.08em] text-blue-700 sm:text-[38px]">
          МИГ
        </div>
        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Курьерская служба
        </div>
      </div>
    </div>
  );
}

function requestTypeLabel(type: Request['requestType']) {
  const labels: Record<Request['requestType'], string> = {
    delivery: 'Доставка',
    movement: 'Перемещение',
    nuts: 'Орехи',
    courier_call: 'Вызов курьера',
    pickup_from_tc: 'Транспортная компания',
    simple: 'Заявка',
  };

  return labels[type] || 'Заявка';
}

function statusLabel(status: Request['status']) {
  const labels: Record<Request['status'], string> = {
    pending: 'Ожидает',
    assigned: 'Курьер назначен',
    in_progress: 'В работе',
    completed: 'Доставлена',
    cancelled: 'Отменена',
  };

  return labels[status] || status;
}

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Irkutsk',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function requestDate(request: Request) {
  return request.completedAt || request.scheduledAt || request.createdAt;
}

function requestFrom(request: Request) {
  return (
    request.senderAddress
    || request.tcAddress
    || request.senderCompany
    || request.senderName
    || 'Не указан'
  );
}

function requestTo(request: Request) {
  return (
    request.deliveryAddress
    || request.recipientAddress
    || request.recipientCompany
    || request.recipientName
    || 'Не указан'
  );
}

function currentMonthValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function monthParts(value: string) {
  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  return {
    year,
    month,
    monthIndex: month - 1,
  };
}

function lastDayOfSelectedMonth(value: string) {
  const { year, month } = monthParts(value);
  return new Date(year, month, 0).getDate();
}

function matchesPeriod(
  request: Request,
  period: PeriodFilter,
  selectedMonth: string,
) {
  const value = requestDate(request);

  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  const { year, monthIndex } = monthParts(selectedMonth);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
  ) {
    return false;
  }

  const day = date.getDate();

  if (period === 'firstHalf') {
    return day >= 1 && day <= 15;
  }

  if (period === 'secondHalf') {
    return day >= 16;
  }

  return true;
}

function selectedMonthLabel(value: string) {
  const { year, monthIndex } = monthParts(value);

  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1));
}

function shiftMonth(value: string, offset: number) {
  const { year, monthIndex } = monthParts(value);
  const next = new Date(year, monthIndex + offset, 1);
  const month = String(next.getMonth() + 1).padStart(2, '0');

  return `${next.getFullYear()}-${month}`;
}

function formatMoney(value: unknown) {
  const amount = Number(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(amount)) return '—';

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatusBadge({ status }: { status: Request['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Доставлена
      </span>
    );
  }

  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        Отменена
      </span>
    );
  }

  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
        <Truck className="h-3.5 w-3.5" />
        В работе
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
      <Clock3 className="h-3.5 w-3.5" />
      {statusLabel(status)}
    </span>
  );
}

function RequestTable({
  requests,
  totalAmount,
}: {
  requests: Request[];
  totalAmount: number;
}) {
  if (requests.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white px-5 py-14 text-center text-sm text-slate-500">
        Заявок по выбранному периоду и фильтру нет
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className="w-[110px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Заявка
              </th>
              <th className="w-[145px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Дата
              </th>
              <th className="w-[150px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Тип
              </th>
              <th className="min-w-[210px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Откуда
              </th>
              <th className="min-w-[210px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Куда
              </th>
              <th className="w-[170px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Курьер
              </th>
              <th className="w-[90px] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Мест
              </th>
              <th className="w-[135px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Время
              </th>
              <th className="w-[125px] px-4 py-4 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Стоимость
              </th>
              <th className="w-[165px] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Статус
              </th>
            </tr>
          </thead>

          <tbody>
            {requests.map((request) => {
              const note =
                request.comments
                || request.specialInstructions
                || '';

              return (
                <tr
                  key={request.id}
                  className="group border-b border-slate-100 transition last:border-b-0 hover:bg-blue-50/35"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="font-black text-slate-950">
                      №{request.id}
                    </div>

                    {request.status === 'completed' ? (
                      <div className="mt-1 text-[11px] font-medium text-emerald-700">
                        Выполнена
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="whitespace-nowrap text-sm font-semibold text-slate-700">
                      {formatDate(requestDate(request))}
                    </div>

                    {request.status === 'completed' && request.completedAt ? (
                      <div className="mt-1 text-[11px] text-slate-400">
                        Завершена: {formatDate(request.completedAt)}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4 align-top">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                      {requestTypeLabel(request.requestType)}
                    </span>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="max-w-[260px] text-sm font-semibold leading-5 text-slate-800">
                      {requestFrom(request)}
                    </div>

                    {request.senderName || request.senderCompany ? (
                      <div className="mt-1 max-w-[260px] text-xs leading-5 text-slate-400">
                        {request.senderName || request.senderCompany}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="max-w-[260px] text-sm font-semibold leading-5 text-slate-800">
                      {requestTo(request)}
                    </div>

                    {request.recipientName || request.recipientCompany ? (
                      <div className="mt-1 max-w-[260px] text-xs leading-5 text-slate-400">
                        {request.recipientName || request.recipientCompany}
                      </div>
                    ) : null}

                    {note ? (
                      <div
                        className="mt-2 max-w-[260px] truncate text-xs text-slate-500"
                        title={note}
                      >
                        {note}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-slate-800">
                      {request.courierName || 'Не назначен'}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-center align-top">
                    <span className="inline-flex min-w-8 justify-center rounded-xl bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700">
                      {request.placesCount ?? '—'}
                    </span>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="whitespace-nowrap text-sm font-semibold text-slate-700">
                      {request.deliveryTimeFrom || request.deliveryTimeTo
                        ? `${request.deliveryTimeFrom || '—'} — ${request.deliveryTimeTo || '—'}`
                        : '—'}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-right align-top">
                    <div className="whitespace-nowrap text-sm font-black text-slate-950">
                      {request.status === 'completed'
                        && request.deliveryFee !== null
                        && request.deliveryFee !== undefined
                        ? formatMoney(request.deliveryFee)
                        : '—'}
                    </div>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <StatusBadge status={request.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4">
        <div className="text-sm font-semibold text-slate-500">
          Показано заявок: {requests.length}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-500">
            Общая сумма:
          </span>
          <span className="text-xl font-black text-slate-950">
            {formatMoney(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}

type HemotestPeriod = {
  key: string;
  label: string;
  dates: string[];
};

function hemotestDateKey(value: unknown) {
  return String(value || '').slice(0, 10);
}

function dateKeyParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function isSundayDate(value: string) {
  const { year, month, day } = dateKeyParts(value);
  return new Date(year, month - 1, day).getDay() === 0;
}

function buildHemotestPeriods(
  items: HemotestReconciliationItem[],
): HemotestPeriod[] {
  const monthKeys = Array.from(
    new Set(
      items
        .map((item) => hemotestDateKey(item.date).slice(0, 7))
        .filter(
          (value) =>
            /^\d{4}-\d{2}$/.test(value)
            && value >= '2026-07',
        ),
    ),
  ).sort();

  const periods: HemotestPeriod[] = [];

  for (const monthKey of monthKeys) {
    const [year, month] = monthKey.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const monthName = new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
    }).format(new Date(year, month - 1, 1));

    const firstDates = Array.from(
      { length: 15 },
      (_, index) =>
        `${monthKey}-${String(index + 1).padStart(2, '0')}`,
    );

    const secondDates = Array.from(
      { length: lastDay - 15 },
      (_, index) =>
        `${monthKey}-${String(index + 16).padStart(2, '0')}`,
    );

    periods.push({
      key: `${monthKey}-1`,
      label: `${monthName[0].toUpperCase()}${monthName.slice(1)}-1`,
      dates: firstDates,
    });

    periods.push({
      key: `${monthKey}-2`,
      label: `${monthName[0].toUpperCase()}${monthName.slice(1)}-2`,
      dates: secondDates,
    });
  }

  return periods;
}

function downloadHemotestReconciliation(
  period: HemotestPeriod,
  points: Array<{
    pointId: number;
    pointName: string;
    address: string;
  }>,
  pickedKeys: Set<string>,
) {
  const rows = [
    [
      'Точка сбора',
      ...period.dates.map((date) => {
        const day = Number(date.slice(8, 10));
        return isSundayDate(date)
          ? `${day} / ВС`
          : String(day);
      }),
    ],
    ...points.map((point) => [
      `${point.pointName} • ${point.address}`,
      ...period.dates.map((date) =>
        pickedKeys.has(`${date}:${point.pointId}`)
          ? 'Собрано'
          : '',
      ),
    ]),
  ];

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <table border="1">
          ${rows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (cell) =>
                      `<td>${String(cell)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('')}
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `mig-hemotest-${period.key}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function HemotestReconciliationPanel({
  data,
  onRefresh,
}: {
  data: ClientPortalHemotestReconciliation;
  onRefresh: () => void;
}) {
  const periods = useMemo(
    () => buildHemotestPeriods(data.items),
    [data.items],
  );

  const [periodKey, setPeriodKey] = useState('');

  const latestPickupDate = data.items
    .map((item) => hemotestDateKey(item.date))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()
    .at(-1);

  const latestPeriodKey = latestPickupDate
    ? `${latestPickupDate.slice(0, 7)}-${
        Number(latestPickupDate.slice(8, 10)) <= 15 ? '1' : '2'
      }`
    : '';

  const selectedPeriod =
    periods.find((period) => period.key === periodKey)
    || periods.find((period) => period.key === latestPeriodKey)
    || periods[periods.length - 1];

  const points = useMemo(
    () =>
      Array.from(
        new Map(
          data.items.map((item) => [
            item.pointId,
            {
              pointId: item.pointId,
              pointName: item.pointName,
              address: item.address,
            },
          ]),
        ).values(),
      ).sort((a, b) => {
        const byName = a.pointName.localeCompare(
          b.pointName,
          'ru',
        );

        return byName || a.address.localeCompare(b.address, 'ru');
      }),
    [data.items],
  );

  const pickedKeys = useMemo(
    () =>
      new Set(
        data.items.map(
          (item) =>
            `${hemotestDateKey(item.date)}:${item.pointId}`,
        ),
      ),
    [data.items],
  );

  if (!selectedPeriod) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold text-slate-700">
          Собранных точек пока нет
        </div>
      </div>
    );
  }

  const itemsByDate = new Map<
    string,
    HemotestReconciliationItem[]
  >();

  for (const item of data.items) {
    const date = hemotestDateKey(item.date);

    if (!date) continue;

    const rows = itemsByDate.get(date) || [];
    rows.push(item);
    itemsByDate.set(date, rows);
  }

  function priceFor(date: string, pointId: number) {
    if (!pickedKeys.has(`${date}:${pointId}`)) return 0;

    if (!isSundayDate(date)) {
      return data.tariffs.pointPrice;
    }

    const rows = [...(itemsByDate.get(date) || [])].sort(
      (a, b) => {
        const aTime = a.pickedAt
          ? new Date(a.pickedAt).getTime()
          : 0;
        const bTime = b.pickedAt
          ? new Date(b.pickedAt).getTime()
          : 0;

        return aTime - bTime || a.pointId - b.pointId;
      },
    );

    const index = rows.findIndex(
      (item) => item.pointId === pointId,
    );

    return index <= 0
      ? data.tariffs.sundayFirstPointPrice
      : data.tariffs.sundayNextPointPrice;
  }

  const dayCounts = selectedPeriod.dates.map((date) => ({
    date,
    isSunday: isSundayDate(date),
    count: points.filter((point) =>
      pickedKeys.has(`${date}:${point.pointId}`),
    ).length,
  }));

  const totalPoints = dayCounts.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  const totalAmount = selectedPeriod.dates.reduce(
    (sum, date) =>
      sum
      + points.reduce(
        (daySum, point) =>
          daySum + priceFor(date, point.pointId),
        0,
      ),
    0,
  );

  const graphMax = Math.max(
    ...dayCounts.map((row) => row.count),
    1,
  );

  const pointColumnWidth = 280;
  const dateColumnWidth = 58;
  const graphStep = dateColumnWidth;
  const graphWidth =
    selectedPeriod.dates.length * dateColumnWidth;

  const graphPoints = dayCounts
    .map((row, index) => {
      const x =
        index * dateColumnWidth
        + dateColumnWidth / 2;
      const y =
        row.count > 0
          ? 84
            - Math.max(
                8,
                Math.round((row.count / graphMax) * 68),
              )
          : 84;

      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">
            Сверка Гемотест
          </h1>

          <div className="mt-3 flex flex-wrap gap-2">
            {periods.map((period) => (
              <button
                key={period.key}
                type="button"
                onClick={() => setPeriodKey(period.key)}
                className={`inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold ${
                  selectedPeriod.key === period.key
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Обновить
          </button>

          <button
            type="button"
            onClick={() =>
              downloadHemotestReconciliation(
                selectedPeriod,
                points,
                pickedKeys,
              )
            }
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <Download className="h-4 w-4" />
            Скачать Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-slate-200">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns:
              `${pointColumnWidth}px ${graphWidth}px`,
          }}
        >
          <div className="border-r border-slate-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Итого
            </div>
            <div className="mt-3 text-xl font-semibold">
              {totalPoints} точек
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {formatMoney(totalAmount)}
            </div>
          </div>

          <div className="p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              График по дням
            </div>

            <svg
              width={graphWidth}
              height="100"
              viewBox={`0 0 ${graphWidth} 100`}
              className="block"
            >
              <line
                x1="0"
                y1="84"
                x2={graphWidth}
                y2="84"
                stroke="#e2e8f0"
              />

              <polyline
                fill="none"
                stroke="#020617"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={graphPoints}
              />

              {dayCounts.map((row, index) => {
                const x =
                  index * dateColumnWidth
                  + dateColumnWidth / 2;
                const y =
                  row.count > 0
                    ? 84
                      - Math.max(
                          8,
                          Math.round(
                            (row.count / graphMax) * 68,
                          ),
                        )
                    : 84;

                return (
                  <g key={row.date}>
                    <circle
                      cx={x}
                      cy={y}
                      r="3.5"
                      fill={row.isSunday ? '#f59e0b' : '#020617'}
                    />

                    {row.count > 0 ? (
                      <text
                        x={x}
                        y={Math.max(10, y - 8)}
                        textAnchor="middle"
                        className="fill-slate-500 text-[9px]"
                      >
                        {row.count}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed border-collapse text-[11px]"
          style={{
            minWidth:
              pointColumnWidth
              + selectedPeriod.dates.length
              * dateColumnWidth,
          }}
        >
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th
                style={{
                  width: pointColumnWidth,
                  minWidth: pointColumnWidth,
                  maxWidth: pointColumnWidth,
                }}
                className="border border-slate-200 px-3 py-3 text-left"
              >
                Точка сбора
              </th>

              {selectedPeriod.dates.map((date) => (
                <th
                  key={date}
                  style={{
                    width: dateColumnWidth,
                    minWidth: dateColumnWidth,
                    maxWidth: dateColumnWidth,
                  }}
                  className={`border border-slate-200 px-2 py-3 text-center ${
                    isSundayDate(date)
                      ? 'bg-amber-50 text-amber-700'
                      : ''
                  }`}
                >
                  {date.slice(8, 10)}
                  {isSundayDate(date) ? (
                    <div className="mt-1 text-[9px]">ВС</div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {points.map((point) => (
              <tr key={point.pointId}>
                <td className="border border-slate-200 px-3 py-3">
                  <div className="font-semibold text-slate-950">
                    {point.pointName}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {point.address}
                  </div>
                </td>

                {selectedPeriod.dates.map((date) => (
                  <td
                    key={`${date}:${point.pointId}`}
                    style={{
                      width: dateColumnWidth,
                      minWidth: dateColumnWidth,
                      maxWidth: dateColumnWidth,
                    }}
                    className={`border border-slate-200 px-2 py-3 text-center ${
                      isSundayDate(date)
                        ? 'bg-amber-50/60'
                        : ''
                    }`}
                  >
                    {priceFor(date, point.pointId) > 0
                      ? `${priceFor(date, point.pointId)} ₽`
                      : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoginPanel({
  onLogin,
  externalError,
}: {
  onLogin: () => void;
  externalError: string;
}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!login.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const result = await loginClientPortal(login.trim(), password);

      localStorage.setItem('clientPortalToken', result.token);
      onLogin();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось войти',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 lg:flex lg:flex-col lg:justify-center lg:p-12">
          <div className="relative z-10 max-w-2xl">
            <MigLogo />

            <div className="mt-24">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
                Личный кабинет клиента
              </p>

              <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-slate-950">
                Все ваши доставки в одном месте.
              </h1>

              <p className="mt-8 max-w-xl text-base leading-8 text-slate-500">
                Следите за статусами заявок, назначением курьера и историей выполненных доставок.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-gradient-to-b from-white to-slate-50 p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <MigLogo />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Вход
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Введите логин и пароль, выданные менеджером МИГ.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Логин
                  </label>

                  <input
                    type="text"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    placeholder="Введите логин"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Пароль
                  </label>

                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    placeholder="Введите пароль"
                    autoComplete="current-password"
                  />
                </div>

                {error || externalError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error || externalError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSubmitting ? 'Вход…' : 'Войти'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ClientPortalView() {
  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [hemotestData, setHemotestData] =
    useState<ClientPortalHemotestReconciliation | null>(null);
  const [page, setPage] = useState<ClientPage>('requests');
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(() =>
    typeof window !== 'undefined'
      ? Boolean(localStorage.getItem('clientPortalToken'))
      : false,
  );
  const [error, setError] = useState('');

  async function loadPortal() {
    try {
      setError('');

      const [profileResult, requestRows] = await Promise.all([
        getClientPortalProfile(),
        getClientPortalRequests(),
      ]);

      const hemotestResult =
        profileResult.client.id === 6
          ? await getClientPortalHemotestReconciliation()
          : null;

      setProfile(profileResult);
      setRequests(requestRows);
      setHemotestData(hemotestResult);

      if (profileResult.client.id === 6) {
        setPage('hemotest');
      }
    } catch (loadError) {
      localStorage.removeItem('clientPortalToken');
      setProfile(null);
      setRequests([]);
      setHemotestData(null);

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить кабинет',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('clientPortalToken');

    if (!token) {
      setIsLoading(false);
      return;
    }

    void loadPortal();
  }, []);

  useEffect(() => {
    if (!profile) return;

    const eventSource = new EventSource('/api/live');

    eventSource.addEventListener('requests_changed', () => {
      void getClientPortalRequests()
        .then((rows) => {
          setRequests(rows);
          setError('');
        })
        .catch(() => undefined);
    });

    return () => eventSource.close();
  }, [profile]);

  const ownerName = profile
    ? (
        profile.account.ownerName
        || profile.client.contactPerson
        || profile.client.name
      )
    : '';

  const periodRequests = useMemo(
    () =>
      requests.filter((request) =>
        matchesPeriod(request, period, selectedMonth),
      ),
    [period, requests, selectedMonth],
  );

  const currentRequests = useMemo(
    () =>
      periodRequests.filter(
        (request) =>
          request.status !== 'completed'
          && request.status !== 'cancelled',
      ),
    [periodRequests],
  );

  const completedRequests = useMemo(
    () => periodRequests.filter((request) => request.status === 'completed'),
    [periodRequests],
  );

  const cancelledRequests = useMemo(
    () => periodRequests.filter((request) => request.status === 'cancelled'),
    [periodRequests],
  );

  const visibleRequests = useMemo(() => {
    const source =
      filter === 'current'
        ? currentRequests
        : filter === 'completed'
          ? completedRequests
          : filter === 'cancelled'
            ? cancelledRequests
            : periodRequests;

    const normalized = search.trim().toLocaleLowerCase('ru');

    return source
      .filter((request) => {
        if (!normalized) return true;

        return [
          request.id,
          requestFrom(request),
          requestTo(request),
          request.recipientName,
          request.senderName,
          request.courierName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(normalized);
      })
      .sort(
        (a, b) =>
          new Date(requestDate(b)).getTime()
          - new Date(requestDate(a)).getTime(),
      );
  }, [
    cancelledRequests,
    completedRequests,
    currentRequests,
    filter,
    periodRequests,
    search,
  ]);

  const visibleTotalAmount = useMemo(
    () =>
      visibleRequests.reduce((sum, request) => {
        if (request.status !== 'completed') return sum;

        const amount = Number(
          String(request.deliveryFee ?? '').replace(',', '.'),
        );

        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0),
    [visibleRequests],
  );

  const selectedLastDay = lastDayOfSelectedMonth(selectedMonth);
  const currentMonth = currentMonthValue();

  function handleLogout() {
    localStorage.removeItem('clientPortalToken');
    setProfile(null);
    setRequests([]);
    setHemotestData(null);
    setError('');
    setPage('requests');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Загрузка личного кабинета…
      </div>
    );
  }

  if (!profile) {
    return (
      <LoginPanel
        externalError={error}
        onLogin={() => {
          setError('');
          setPage('requests');
          setIsLoading(true);
          void loadPortal();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
          <MigLogo />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage('requests')}
              className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold ${
                page === 'requests'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              Заявки
            </button>

            {profile.client.id === 6 ? (
              <button
                type="button"
                onClick={() => setPage('hemotest')}
                className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold ${
                  page === 'hemotest'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                Сверка
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setPage('profile')}
              className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold ${
                page === 'profile'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <User className="h-4 w-4" />
              Профиль
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {page === 'hemotest' && profile.client.id === 6 ? (
          hemotestData ? (
            <HemotestReconciliationPanel
              data={hemotestData}
              onRefresh={() => {
                setIsLoading(true);
                void loadPortal();
              }}
            />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Сверка Гемотест загружается…
            </div>
          )
        ) : page === 'requests' ? (
          <section>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Здравствуйте, {ownerName}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {profile.client.name}
                </p>
                <p className="mt-1 text-sm capitalize text-slate-400">
                  Период: {selectedMonthLabel(selectedMonth)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true);
                    void loadPortal();
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Обновить
                </button>
              </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">
                  Всего заявок
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {periodRequests.length}
                </div>
              </div>

              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <div className="text-sm font-medium text-blue-700">
                  Текущие
                </div>
                <div className="mt-2 text-3xl font-semibold text-blue-950">
                  {currentRequests.length}
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="text-sm font-medium text-emerald-700">
                  Выполненные
                </div>
                <div className="mt-2 text-3xl font-semibold text-emerald-950">
                  {completedRequests.length}
                </div>
              </div>
            </div>

            <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div
            className={`flex flex-wrap items-center gap-2 ${
              profile.client.id === 6 ? 'hidden' : ''
            }`}
          >
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedMonth((current) =>
                          shiftMonth(current, -1),
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white"
                      aria-label="Предыдущий месяц"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <input
                      type="month"
                      value={selectedMonth}
                      max={currentMonth}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setSelectedMonth(event.target.value);
                      }}
                      className="h-9 min-w-[165px] bg-transparent px-2 text-sm font-bold text-slate-800 outline-none"
                    />

                    <button
                      type="button"
                      disabled={selectedMonth >= currentMonth}
                      onClick={() =>
                        setSelectedMonth((current) => {
                          const next = shiftMonth(current, 1);
                          return next > currentMonth
                            ? currentMonth
                            : next;
                        })
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Следующий месяц"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {[
                    ['month', 'Весь месяц'],
                    ['firstHalf', '1–15'],
                    ['secondHalf', `16–${selectedLastDay}`],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPeriod(value as PeriodFilter)}
                      className={`h-10 rounded-full border px-4 text-sm font-bold transition ${
                        period === value
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-0 w-full xl:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск по номеру, адресу или курьеру"
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ['all', `Все ${periodRequests.length}`],
                  ['current', `Текущие ${currentRequests.length}`],
                  ['completed', `Доставлены ${completedRequests.length}`],
                  ['cancelled', `Отменены ${cancelledRequests.length}`],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as RequestFilter)}
                    className={`h-10 rounded-full border px-4 text-sm font-bold transition ${
                      filter === value
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <RequestTable
              requests={visibleRequests}
              totalAmount={visibleTotalAmount}
            />
          </section>
        ) : null}

        {page === 'profile' ? (
          <section>
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight">
                Профиль
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Данные аккаунта и компании.
              </p>
            </div>

            <div className="max-w-3xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-6 flex items-center gap-4 rounded-3xl bg-slate-50 p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-xl font-bold text-white">
                  {ownerName.charAt(0).toUpperCase()}
                </div>

                <div>
                  <p className="text-base font-bold">{ownerName}</p>
                  <p className="text-sm text-slate-500">
                    {profile.client.name}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['Компания', profile.client.name],
                  ['Логин', profile.account.login],
                  ['Адрес', profile.client.address],
                  ['Контактное лицо', profile.client.contactPerson || ownerName],
                  ['Телефон', profile.client.phone || '—'],
                  ['Email', profile.client.email || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-2 text-sm font-medium text-slate-500">
                      {label}
                    </div>
                    <div className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage('requests')}
                  className="inline-flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  К заявкам
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
