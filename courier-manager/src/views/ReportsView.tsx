import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, Download } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  getBillingReviewRequests,
  setBillingChecked,
  updateBillingReviewFields,
  updateRequestClient,
  type Client,
  type Request,
} from '../lib/api';
import * as XLSX from 'xlsx';

type ClientTab = {
  id: number | null;
  name: string;
  count: number;
};

function toDateKey(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getRequestDate(request: Request) {
  return toDateKey(request.completedAt);
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  return {
    from: toDateKey(first.toISOString()),
    to: toDateKey(last.toISOString()),
  };
}

function formatDate(value?: string | null) {
  const key = value?.slice(0, 10) || '';

  if (!key) return '—';

  const [year, month, day] = key.split('-');

  if (!year || !month || !day) return '—';

  return `${day}.${month}.${year}`;
}

function requestSender(request: Request) {
  return (
    request.senderCompany
    || request.senderName
    || request.tcName
    || '—'
  );
}

function requestRecipient(request: Request) {
  return (
    request.recipientCompany
    || request.recipientName
    || '—'
  );
}

function requestFromAddress(request: Request) {
  return (
    request.senderAddress
    || request.tcAddress
    || '—'
  );
}

function requestToAddress(request: Request) {
  return (
    request.recipientAddress
    || request.deliveryAddress
    || '—'
  );
}

function statusLabel(status: Request['status']) {
  const labels: Record<Request['status'], string> = {
    pending: 'Новая',
    assigned: 'Назначена',
    in_progress: 'В работе',
    completed: 'Выполнена',
    cancelled: 'Отменена',
  };

  return labels[status] || status;
}

function statusClass(status: Request['status']) {
  if (status === 'completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'cancelled') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (status === 'in_progress') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}


function exportBillingXlsx(
  client: Client,
  requests: Request[],
  dateFrom: string,
  dateTo: string,
) {
  const checkedRequests = requests.filter((request) => Boolean(request.billingCheckedAt));

  const total = checkedRequests.reduce(
    (sum, request) => sum + Number(request.deliveryFee ?? 0),
    0,
  );

  const rows: (string | number)[][] = [
    ['РАСЧЁТ ЗА ВЫПОЛНЕННЫЕ РАБОТЫ'],
    [],
    ['Клиент', client.name],
    ['Юридическое наименование', client.legalName || client.name],
    ['ИНН', client.inn || ''],
    ['КПП', client.kpp || ''],
    ['Юридический адрес', client.legalAddress || client.address || ''],
    ['Период', `${formatDate(dateFrom)} — ${formatDate(dateTo)}`],
    [],
    [
      'Дата выполнения',
      '№ заявки',
      'Клиент',
      'Отправитель',
      'Получатель',
      'Откуда',
      'Куда',
      'Курьер',
      'Мест',
      'Стоимость доставки',
      'Комментарий',
    ],
    ...checkedRequests.map((request) => [
      formatDate(getRequestDate(request)),
      request.id,
      client.name,
      requestSender(request),
      requestRecipient(request),
      requestFromAddress(request),
      requestToAddress(request),
      request.courierName || '',
      request.placesCount ?? '',
      Number(request.deliveryFee ?? 0),
      request.comments || '',
    ]),
    [],
    ['', '', '', '', '', '', '', '', 'ИТОГО', total, ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 28 },
    { wch: 24 },
    { wch: 24 },
    { wch: 35 },
    { wch: 35 },
    { wch: 24 },
    { wch: 8 },
    { wch: 22 },
    { wch: 45 },
  ];

  const titleCell = worksheet['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16 },
      alignment: { horizontal: 'center' },
    };
  }

  const headerRow = 10;
  for (let column = 0; column < 11; column += 1) {
    const cell = XLSX.utils.encode_cell({
      r: headerRow - 1,
      c: column,
    });

    if (worksheet[cell]) {
      worksheet[cell].s = {
        font: { bold: true },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Расчёт');

  const safeClientName = client.name
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'client';

  XLSX.writeFile(
    workbook,
    `Расчёт_${safeClientName}_${dateFrom}_${dateTo}.xlsx`,
  );
}

export default function ReportsView() {
  const initialRange = useMemo(() => getCurrentMonthRange(), []);
  const [activeTab, setActiveTab] = useState<'review' | 'documents'>('review');

  const [requests, setRequests] = useState<Request[]>([]);
  const [billingRequests, setBillingRequests] = useState<Request[]>([]);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selectedClientId, setSelectedClientId] = useState<number | null | 'all'>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [savingRequestId, setSavingRequestId] = useState<number | null>(null);
  const [billingRefreshVersion, setBillingRefreshVersion] = useState(0);
  const [error, setError] = useState('');

  async function loadData() {
    try {
      setError('');
      const [requestRows, clientRows] = await Promise.all([
        getAllRequests(),
        getAllClients(),
      ]);

      setRequests(requestRows);
      setClients(
        [...clientRows].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить отчёт',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();

    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource('/api/live');

        eventSource.addEventListener('requests_changed', () => {
          void loadData();
          setBillingRefreshVersion((version) => version + 1);
        });

        eventSource.onerror = () => {
          eventSource?.close();

          if (!closed && reconnectTimer === null) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, 3000);
          }
        };
      } catch {
        // Отчёт продолжит работать без live-обновления.
      }
    };

    connect();

    return () => {
      closed = true;
      eventSource?.close();

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof selectedClientId !== 'number') {
      setBillingRequests([]);
      setIsBillingLoading(false);
      return;
    }

    let cancelled = false;

    setBillingRequests([]);
    setIsBillingLoading(true);

    void getBillingReviewRequests(selectedClientId, dateFrom, dateTo)
      .then((rows) => {
        if (!cancelled) setBillingRequests(rows);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Не удалось загрузить проверку работ',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsBillingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedClientId, dateFrom, dateTo, billingRefreshVersion]);

  const periodRequests = useMemo(() => {
    return requests.filter((request) => {
      if (request.status !== 'completed') return false;

      const date = getRequestDate(request);

      if (!date) return false;
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;

      return true;
    });
  }, [requests, dateFrom, dateTo]);

  const clientTabs = useMemo<ClientTab[]>(() => {
    const counts = new Map<number | null, number>();

    for (const request of periodRequests) {
      if (request.status !== 'completed') {
        continue;
      }

      const clientId = request.clientId ?? null;
      counts.set(clientId, (counts.get(clientId) || 0) + 1);
    }

    const tabs: ClientTab[] = clients
      .map((client) => ({
        id: client.id,
        name: client.name,
        count: counts.get(client.id) || 0,
      }))
      .filter((client) => client.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, 'ru');
      });

    const withoutClientCount = counts.get(null) || 0;

    if (withoutClientCount > 0) {
      tabs.push({
        id: null,
        name: 'Без клиента',
        count: withoutClientCount,
      });
    }

    return tabs;
  }, [clients, periodRequests]);

  const visibleRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru');
    const sourceRequests =
      typeof selectedClientId === 'number'
        ? billingRequests
        : periodRequests;

    return sourceRequests
      .filter((request) => {
        if (selectedClientId !== 'all') {
          const requestClientId = request.clientId ?? null;

          if (requestClientId !== selectedClientId) {
            return false;
          }
        }

        if (!normalizedSearch) return true;

        const searchable = [
          request.id,
          requestSender(request),
          requestRecipient(request),
          requestFromAddress(request),
          requestToAddress(request),
          request.courierName,
          request.comments,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('ru');

        return searchable.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const dateCompare = getRequestDate(b).localeCompare(getRequestDate(a));

        if (dateCompare !== 0) return dateCompare;

        return b.id - a.id;
      });
  }, [periodRequests, billingRequests, search, selectedClientId]);

  const reviewSummary = useMemo(() => {
    let checked = 0;
    let totalAmount = 0;

    for (const request of visibleRequests) {
      if (request.billingCheckedAt) checked += 1;

      const amount = Number(request.deliveryFee);
      if (Number.isFinite(amount)) totalAmount += amount;
    }

    return {
      checked,
      unchecked: visibleRequests.length - checked,
      totalAmount,
    };
  }, [visibleRequests]);

  async function changeRequestClient(
    requestId: number,
    value: string,
  ) {
    const clientId = value ? Number(value) : null;
    const previous = requests.find((request) => request.id === requestId);

    if (!previous) return;

    setSavingRequestId(requestId);
    setError('');

    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? { ...request, clientId: clientId ?? undefined }
          : request,
      ),
    );

    try {
      await updateRequestClient(requestId, clientId);
    } catch (saveError) {
      setRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? previous
            : request,
        ),
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось изменить клиента',
      );
    } finally {
      setSavingRequestId(null);
    }
  }

  async function saveReviewDeliveryFee(
    request: Request,
    rawValue: string,
  ) {
    const normalized = rawValue.trim().replace(',', '.');
    if (!normalized) return;

    const nextValue = Number(normalized);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setError('Стоимость должна быть числом не меньше нуля');
      return;
    }

    const currentValue =
      request.deliveryFee === null || request.deliveryFee === undefined
        ? null
        : Number(request.deliveryFee);

    if (currentValue === nextValue) return;

    try {
      setSavingRequestId(request.id);
      setError('');

      await updateBillingReviewFields(request.id, {
        deliveryFee: nextValue,
      });

      const updateRow = (row: Request): Request =>
        row.id === request.id
          ? {
              ...row,
              deliveryFee: nextValue,
              billingCheckedAt: null,
              billingCheckedByManagerId: null,
            }
          : row;

      setRequests((rows) => rows.map(updateRow));
      setBillingRequests((rows) => rows.map(updateRow));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось сохранить стоимость',
      );
    } finally {
      setSavingRequestId(null);
    }
  }

  async function saveReviewComments(
    request: Request,
    comments: string,
  ) {
    const currentComments = request.comments || '';
    if (currentComments === comments) return;

    try {
      setSavingRequestId(request.id);
      setError('');

      await updateBillingReviewFields(request.id, { comments });

      const updateRow = (row: Request): Request =>
        row.id === request.id
          ? {
              ...row,
              comments,
              billingCheckedAt: null,
              billingCheckedByManagerId: null,
            }
          : row;

      setRequests((rows) => rows.map(updateRow));
      setBillingRequests((rows) => rows.map(updateRow));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось сохранить комментарий',
      );
    } finally {
      setSavingRequestId(null);
    }
  }

  async function toggleBillingChecked(request: Request) {
    const checked = !request.billingCheckedAt;

    try {
      setSavingRequestId(request.id);
      setError('');

      await setBillingChecked(request.id, checked);

      const checkedAt = checked ? new Date().toISOString() : null;

      const updateRow = (row: Request): Request =>
        row.id === request.id
          ? {
              ...row,
              billingCheckedAt: checkedAt,
              billingCheckedByManagerId: checked
                ? row.billingCheckedByManagerId
                : null,
            }
          : row;

      setRequests((rows) => rows.map(updateRow));
      setBillingRequests((rows) => rows.map(updateRow));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось изменить отметку проверки',
      );
    } finally {
      setSavingRequestId(null);
    }
  }

  const selectedClient =
    typeof selectedClientId === 'number'
      ? clients.find((client) => client.id === selectedClientId) ?? null
      : null;

  const checkedBillingRequests = useMemo(
    () => billingRequests.filter((request) => Boolean(request.billingCheckedAt)),
    [billingRequests],
  );

  const checkedBillingTotal = useMemo(
    () =>
      checkedBillingRequests.reduce(
        (sum, request) => sum + Number(request.deliveryFee ?? 0),
        0,
      ),
    [checkedBillingRequests],
  );

    return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Расчёты
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Проверка выполненных работ и выставление документов клиентам.
        </p>
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'review'
              ? 'bg-slate-950 text-white'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Проверка работ
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'documents'
              ? 'bg-slate-950 text-white'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Выставление документов
        </button>
      </div>

      {activeTab === 'documents' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Дата от
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Дата до
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </label>

              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Клиент
                </span>
                <select
                  value={typeof selectedClientId === 'number' ? selectedClientId : ''}
                  onChange={(event) =>
                    setSelectedClientId(
                      event.target.value ? Number(event.target.value) : 'all',
                    )
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                >
                  <option value="">Выберите клиента</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {!selectedClient ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              Выберите клиента для формирования расчёта.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Клиент
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {selectedClient.name}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Проверено заявок
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {checkedBillingRequests.length}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Сумма
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {checkedBillingTotal.toFixed(2)} ₽
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <div className="font-semibold text-slate-950">
                    Готовый расчёт
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    В документ попадут только заявки со статусом «Проверено».
                  </div>
                </div>

                <button
                  type="button"
                  disabled={checkedBillingRequests.length === 0}
                  onClick={() =>
                    exportBillingXlsx(
                      selectedClient,
                      checkedBillingRequests,
                      dateFrom,
                      dateTo,
                    )
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Скачать Excel
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Дата от
            </span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Дата до
            </span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>
          </label>

          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Поиск
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Номер, адрес, отправитель, получатель"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>
          </label>

          <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
            Заявок: {visibleRequests.length}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Заявок</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {visibleRequests.length}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-medium text-emerald-700">Проверено</div>
          <div className="mt-1 text-xl font-semibold text-emerald-800">
            {reviewSummary.checked}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-medium text-amber-700">Не проверено</div>
          <div className="mt-1 text-xl font-semibold text-amber-800">
            {reviewSummary.unchecked}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Сумма</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {reviewSummary.totalAmount.toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ₽
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          <button
            type="button"
            onClick={() => setSelectedClientId('all')}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              selectedClientId === 'all'
                ? 'bg-slate-950 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Все
            <span className="ml-2 opacity-70">{periodRequests.length}</span>
          </button>

          {clientTabs.map((client) => (
            <button
              key={client.id ?? 'without-client'}
              type="button"
              onClick={() => setSelectedClientId(client.id)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                selectedClientId === client.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {client.name}
              <span className="ml-2 opacity-70">{client.count}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1900px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Дата</th>
                <th className="px-4 py-3 font-semibold">№</th>
                <th className="min-w-[220px] px-4 py-3 font-semibold">Клиент</th>
                <th className="px-4 py-3 font-semibold">Отправитель</th>
                <th className="px-4 py-3 font-semibold">Получатель</th>
                <th className="min-w-[240px] px-4 py-3 font-semibold">Откуда</th>
                <th className="min-w-[240px] px-4 py-3 font-semibold">Куда</th>
                <th className="px-4 py-3 font-semibold">Курьер</th>
                <th className="px-4 py-3 text-center font-semibold">Мест</th>
                <th className="min-w-[140px] px-4 py-3 font-semibold">Стоимость</th>
                <th className="min-w-[280px] px-4 py-3 font-semibold">Комментарий</th>
                <th className="min-w-[150px] px-4 py-3 font-semibold">Проверено</th>
                <th className="px-4 py-3 font-semibold">Статус</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading || isBillingLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                    Загрузка заявок…
                  </td>
                </tr>
              ) : visibleRequests.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                    За выбранный период заявок нет
                  </td>
                </tr>
              ) : (
                visibleRequests.map((request) => (
                  <tr
                    key={request.id}
                    className={`align-top ${
                      request.billingCheckedAt
                        ? 'hover:bg-slate-50/70'
                        : 'bg-amber-50/40 hover:bg-amber-50/70'
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(getRequestDate(request))}
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {request.id}
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={request.clientId ?? ''}
                        disabled={savingRequestId === request.id}
                        onChange={(event) => {
                          void changeRequestClient(
                            request.id,
                            event.target.value,
                          );
                        }}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-wait disabled:opacity-60"
                      >
                        <option value="">Без клиента</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {requestSender(request)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {requestRecipient(request)}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {requestFromAddress(request)}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {requestToAddress(request)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {request.courierName || '—'}
                    </td>

                    <td className="px-4 py-3 text-center font-semibold text-slate-800">
                      {request.placesCount ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={request.deliveryFee ?? ''}
                        disabled={savingRequestId === request.id}
                        onBlur={(event) => {
                          void saveReviewDeliveryFee(
                            request,
                            event.currentTarget.value,
                          );
                        }}
                        className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-wait disabled:opacity-60"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <textarea
                        defaultValue={request.comments || ''}
                        disabled={savingRequestId === request.id}
                        onBlur={(event) => {
                          void saveReviewComments(
                            request,
                            event.currentTarget.value,
                          );
                        }}
                        rows={2}
                        className="min-h-10 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-wait disabled:opacity-60"
                      />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        disabled={savingRequestId === request.id}
                        onClick={() => {
                          void toggleBillingChecked(request);
                        }}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                          request.billingCheckedAt
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {request.billingCheckedAt ? 'Проверено' : 'Не проверено'}
                      </button>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}
                      >
                        {statusLabel(request.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
