import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, Download, FileSpreadsheet, ArrowLeft, Pencil, RefreshCw } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  getAllMails,
  getPartners,
  getBillingOverview,
  recalcClientQuotes,
  recalcRequestQuote,
  issueBillingDocument,
  setBillingChecked,
  setMailBillingChecked,
  updateBillingReviewFields,
  updateRequestClient,
  type BillingDocumentRow,
  type BillingQuoteState,
  type BillingReviewRequest,
  type Client,
  type Request,
  type Mail,
  type Partner,
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


function formatPartnerDeliveryDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('ru-RU');
}

function PartnerReconciliation() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [checkingMailId, setCheckingMailId] = useState<number | null>(null);
  const [mailCheckOverrides, setMailCheckOverrides] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');

  async function loadPartnerReconciliation() {
    try {
      setError('');

      const [partnerRows, mailRows] = await Promise.all([
        getPartners(),
        getAllMails({ status: 'delivered' }),
      ]);

      setPartners(
        [...partnerRows].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      );
      setMails(mailRows);
    } catch (loadError) {
      console.error('Failed to load partner reconciliation:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить сверку партнёров',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPartnerReconciliation();

    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource('/api/live');

        eventSource.addEventListener('mails_changed', () => {
          void loadPartnerReconciliation();
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
        // Сверка продолжит работать без live-обновлений.
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

  const selectedPartner = useMemo(
    () =>
      typeof selectedPartnerId === 'number'
        ? partners.find((partner) => partner.id === selectedPartnerId) ?? null
        : null,
    [partners, selectedPartnerId],
  );

  const partnerMails = useMemo(() => {
    if (!selectedPartner) return [];

    return mails
      .filter(
        (mail) =>
          mail.status === 'delivered'
          && mail.partnerId === selectedPartner.id,
      )
      .sort((a, b) => {
        const aTime = new Date(a.deliveredAt || a.createdAt).getTime();
        const bTime = new Date(b.deliveredAt || b.createdAt).getTime();

        return bTime - aTime;
      });
  }, [mails, selectedPartner]);

  const isMailChecked = (mail: Mail) =>
    mailCheckOverrides[mail.id] ?? Boolean(mail.billingCheckedAt);

  const checkedCount = partnerMails.filter(isMailChecked).length;

  const totalWeight = partnerMails.reduce((sum, mail) => {
    const weight = Number(mail.weight);
    return Number.isFinite(weight) ? sum + weight : sum;
  }, 0);

  async function toggleMailChecked(mail: Mail) {
    const nextChecked = !isMailChecked(mail);

    try {
      setCheckingMailId(mail.id);

      await setMailBillingChecked(mail.id, nextChecked);

      setMailCheckOverrides((prev) => ({
        ...prev,
        [mail.id]: nextChecked,
      }));
    } catch (toggleError) {
      console.error('Failed to change mail reconciliation check:', toggleError);
      alert(
        `Не удалось изменить статус проверки: ${
          toggleError instanceof Error
            ? toggleError.message
            : 'неизвестная ошибка'
        }`,
      );
    } finally {
      setCheckingMailId(null);
    }
  }

  function downloadPartnerReconciliation() {
    if (!selectedPartner || partnerMails.length === 0) return;

    const rows = [
      [
        'Дата доставки',
        'Партнёр',
        'Накладная',
        'Получатель',
        'Телефон',
        'Адрес',
        'Вес, кг',
        'Проверено',
      ],
      ...partnerMails.map((mail) => [
        formatPartnerDeliveryDate(mail.deliveredAt || mail.createdAt),
        selectedPartner.name,
        mail.waybillNumber,
        mail.recipientName || '',
        mail.recipientPhone || '',
        mail.deliveryAddress || '',
        mail.weight || '',
        isMailChecked(mail) ? 'Да' : 'Нет',
      ]),
      [],
      ['Итого доставленных писем', partnerMails.length],
      ['Проверено', checkedCount],
      ['Общий вес, кг', totalWeight],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Сверка');

    const safePartnerName =
      selectedPartner.name
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim() || 'partner';

    XLSX.writeFile(
      workbook,
      `Сверка_${safePartnerName}.xlsx`,
    );
  }

  return (
    <div className="space-y-4">
      {!selectedPartner && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-950">
              Партнёры
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Выберите партнёра для сверки
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {partners.map((partner) => {
              const deliveredCount = mails.filter(
                (mail) =>
                  mail.status === 'delivered'
                  && mail.partnerId === partner.id,
              ).length;

              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => setSelectedPartnerId(partner.id)}
                  className="flex min-h-[56px] w-full items-center justify-between bg-white px-5 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="truncate pr-4">
                    {partner.name}
                  </span>

                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    {deliveredCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Загрузка сверки...
        </div>
      ) : !selectedPartner ? null : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedPartnerId('')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                title="Назад к партнёрам"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">
                  Сверка партнёра
                </div>
                <div className="truncate text-lg font-semibold text-slate-950">
                  {selectedPartner.name}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={partnerMails.length === 0}
              onClick={downloadPartnerReconciliation}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Скачать Excel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Доставлено
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-950">
                {partnerMails.length}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs font-medium text-emerald-700">
                Проверено
              </div>
              <div className="mt-1 text-xl font-semibold text-emerald-800">
                {checkedCount}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-medium text-amber-700">
                Не проверено
              </div>
              <div className="mt-1 text-xl font-semibold text-amber-800">
                {partnerMails.length - checkedCount}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Общий вес, кг
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-950">
                {totalWeight.toLocaleString('ru-RU', {
                  maximumFractionDigits: 3,
                })}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-950">
                Сверка партнёра
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPartner.name}. Только доставленные письма.
              </p>
            </div>

            {partnerMails.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
                <FileSpreadsheet className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-950">
                  Доставленных писем для сверки пока нет
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Письма появятся после доставки.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] table-fixed border-collapse text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Дата доставки</th>
                      <th className="px-5 py-3 font-semibold">Накладная</th>
                      <th className="px-5 py-3 font-semibold">Получатель</th>
                      <th className="px-5 py-3 font-semibold">Телефон</th>
                      <th className="px-5 py-3 font-semibold">Адрес</th>
                      <th className="px-5 py-3 font-semibold">Вес, кг</th>
                      <th className="px-5 py-3 font-semibold">Проверено</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {partnerMails.map((mail) => (
                      <tr
                        key={mail.id}
                        className={
                          isMailChecked(mail)
                            ? 'hover:bg-slate-50/80'
                            : 'bg-amber-50/40 hover:bg-amber-50/70'
                        }
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatPartnerDeliveryDate(mail.deliveredAt)}
                        </td>

                        <td className="px-5 py-4 font-semibold text-slate-950">
                          {mail.waybillNumber}
                        </td>

                        <td className="px-2 py-2 text-center text-[11px] text-slate-600">
                          {mail.recipientName || '—'}
                        </td>

                        <td className="px-2 py-2 text-center text-[11px] text-slate-600">
                          {mail.recipientPhone || '—'}
                        </td>

                        <td className="max-w-[420px] truncate px-5 py-4 text-slate-600">
                          {mail.deliveryAddress || '—'}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {mail.weight
                            ? Number(mail.weight).toLocaleString('ru-RU', {
                                maximumFractionDigits: 3,
                              })
                            : '—'}
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            disabled={checkingMailId === mail.id}
                            onClick={() => void toggleMailChecked(mail)}
                            className={`inline-flex h-9 min-w-[110px] items-center justify-center rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isMailChecked(mail)
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {checkingMailId === mail.id
                              ? 'Сохраняем...'
                              : isMailChecked(mail)
                                ? 'Проверено'
                                : 'Проверить'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsView() {
  const initialRange = useMemo(() => getCurrentMonthRange(), []);
  const [activeTab, setActiveTab] = useState<'partners' | 'documents'>('documents');

  const [requests, setRequests] = useState<Request[]>([]);
  const [billingOverview, setBillingOverview] = useState<{
    requests: BillingReviewRequest[];
    counts: { total: number; ready: number; checked: number; billed: number; unpriced: number };
    checkedAmount: number;
    readyAmount: number;
    documents: BillingDocumentRow[];
  } | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selectedClientId, setSelectedClientId] = useState<number | null | 'all'>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [savingRequestId, setSavingRequestId] = useState<number | null>(null);
  const [editingFeeRequestId, setEditingFeeRequestId] = useState<number | null>(null);
  const [editingCommentRequestId, setEditingCommentRequestId] = useState<number | null>(null);
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
      setBillingOverview(null);
      setIsBillingLoading(false);
      return;
    }

    let cancelled = false;

    setBillingOverview(null);
    setIsBillingLoading(true);
    setBillingNotice('');

    void getBillingOverview(selectedClientId, dateFrom, dateTo)
      .then((data) => {
        if (!cancelled) setBillingOverview(data);
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

  /** Recalculate every eligible price of this client for the selected period. */
  async function recalcClientPeriod() {
    if (typeof selectedClientId !== 'number') return;

    setIsRecalculating(true);
    setError('');
    setBillingNotice('');

    try {
      const result = await recalcClientQuotes(selectedClientId, dateFrom, dateTo);
      setBillingNotice(
        `Расчёт обновлён: рассчитано ${result.calculated}, без тарифа ${result.unresolved}, пропущено ${result.skipped}`,
      );
      setBillingRefreshVersion((version) => version + 1);
      void loadData();
    } catch (recalcError) {
      setError(
        recalcError instanceof Error ? recalcError.message : 'Не удалось пересчитать стоимости',
      );
    } finally {
      setIsRecalculating(false);
    }
  }

  /** Recalculate one request with the current tariff (problem rows). */
  async function recalcSingleRequest(requestId: number) {
    setError('');
    setBillingNotice('');

    try {
      const outcome = await recalcRequestQuote(requestId);
      if (outcome.status === 'calculated') {
        setBillingNotice(`Заявка №${requestId}: стоимость рассчитана (${outcome.amount?.toFixed(2)} ₽)`);
      } else if (outcome.status === 'unresolved') {
        setBillingNotice(`Заявка №${requestId}: тариф не найден, укажите стоимость вручную`);
      } else {
        setBillingNotice(`Заявка №${requestId}: расчёт не требуется (${outcome.preserved ?? 'пропущено'})`);
      }
      setBillingRefreshVersion((version) => version + 1);
    } catch (recalcError) {
      setError(
        recalcError instanceof Error ? recalcError.message : 'Не удалось рассчитать заявку',
      );
    }
  }

  /** Create the client document for the selected period. */
  async function issueDocument() {
    if (typeof selectedClientId !== 'number') return;

    setIsIssuing(true);
    setError('');
    setBillingNotice('');

    try {
      const result = await issueBillingDocument(selectedClientId, dateFrom, dateTo);
      if (result.ok && result.document) {
        setBillingNotice(
          `Документ №${result.document.number} сформирован: ${result.requestCount} заявок на ${Number(result.totalAmount ?? 0).toFixed(2)} ₽`,
        );
      } else {
        setBillingNotice(result.reason ?? 'Счёт пока сформировать нельзя');
      }
      setBillingRefreshVersion((version) => version + 1);
    } catch (issueError) {
      setError(
        issueError instanceof Error ? issueError.message : 'Не удалось сформировать счёт',
      );
    } finally {
      setIsIssuing(false);
    }
  }

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
    const sourceRequests: BillingReviewRequest[] =
      typeof selectedClientId === 'number'
        ? billingOverview?.requests ?? []
        : (periodRequests as BillingReviewRequest[]);

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
  }, [periodRequests, billingOverview, search, selectedClientId]);

  /** Quote/verification state of one request, derived on the server. */
  function quoteStateOf(request: BillingReviewRequest): BillingQuoteState {
    if (request.quoteState) return request.quoteState;

    const hasAmount = request.deliveryFee !== null && request.deliveryFee !== undefined && request.deliveryFee !== '';
    if (!hasAmount) return 'unpriced';
    return request.billingCheckedAt ? 'checked' : 'ready';
  }

  const reviewSummary = useMemo(() => {
    let checked = 0;
    let ready = 0;
    let unpriced = 0;
    let billed = 0;
    let checkedAmount = 0;

    for (const request of visibleRequests) {
      const state = quoteStateOf(request);
      if (state === 'checked') {
        checked += 1;
        checkedAmount += Number(request.deliveryFee ?? 0);
      } else if (state === 'ready') {
        ready += 1;
      } else if (state === 'unpriced') {
        unpriced += 1;
      } else {
        billed += 1;
      }
    }

    return {
      checked,
      ready,
      unpriced,
      billed,
      unchecked: ready + unpriced,
      checkedAmount,
      totalAmount: checkedAmount,
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

      const updateRow = (row: BillingReviewRequest): BillingReviewRequest =>
        row.id === request.id
          ? {
              ...row,
              deliveryFee: nextValue,
              billingCheckedAt: null,
              billingCheckedByManagerId: null,
              ...(quoteStateOf(row) === 'billed' ? {} : { quoteState: 'ready' as BillingQuoteState }),
            }
          : row;

      setRequests((rows) => rows.map((row) => (row.id === request.id ? updateRow(row as BillingReviewRequest) : row)));
      setBillingOverview((overview) => overview
        ? { ...overview, requests: overview.requests.map(updateRow) }
        : overview);
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

      const updateRow = (row: BillingReviewRequest): BillingReviewRequest =>
        row.id === request.id
          ? {
              ...row,
              comments,
              billingCheckedAt: null,
              billingCheckedByManagerId: null,
              ...(quoteStateOf(row) === 'billed' ? {} : { quoteState: 'ready' as BillingQuoteState }),
            }
          : row;

      setRequests((rows) => rows.map((row) => (row.id === request.id ? updateRow(row as BillingReviewRequest) : row)));
      setBillingOverview((overview) => overview
        ? { ...overview, requests: overview.requests.map(updateRow) }
        : overview);
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

      const updateRow = (row: BillingReviewRequest): BillingReviewRequest =>
        row.id === request.id
          ? {
              ...row,
              billingCheckedAt: checkedAt,
              billingCheckedByManagerId: checked
                ? row.billingCheckedByManagerId
                : null,
              ...(
                // Keep the review state machine in step with the toggle, unless
                // the row is already part of a document.
                quoteStateOf(row) === 'billed'
                  ? {}
                  : { quoteState: (checked ? 'checked' : (row.deliveryFee != null ? 'ready' : 'unpriced')) as BillingQuoteState }
              ),
            }
          : row;

      setRequests((rows) => rows.map((row) => (row.id === request.id ? updateRow(row as BillingReviewRequest) : row)));
      setBillingOverview((overview) => overview
        ? { ...overview, requests: overview.requests.map(updateRow) }
        : overview);
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

  // Verified rows only: these are the ones a document may contain.
  const checkedBillingRequests = useMemo(
    () => (billingOverview?.requests ?? []).filter((request) => quoteStateOf(request) === 'checked'),
    [billingOverview],
  );

  const checkedBillingTotal = useMemo(
    () =>
      checkedBillingRequests.reduce(
        (sum, request) => sum + Number(request.deliveryFee ?? 0),
        0,
      ),
    [checkedBillingRequests],
  );

  /** Everything that prevents issuing a document right now. */
  const issueBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (reviewSummary.unpriced > 0) {
      blockers.push(`Заявок без рассчитанной стоимости: ${reviewSummary.unpriced}`);
    }
    if (reviewSummary.ready > 0) {
      blockers.push(`Заявок ожидает проверки: ${reviewSummary.ready}`);
    }
    if (reviewSummary.checked === 0) {
      blockers.push('Нет проверенных заявок за выбранный период');
    }
    return blockers;
  }, [reviewSummary]);

    return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Расчёты
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Сверка выполненных работ по клиентам и партнёрам.
        </p>
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'partners'
              ? 'bg-slate-950 text-white'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Сверка партнёров
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
          Сверка клиентов
        </button>
      </div>

      {activeTab === 'documents' && selectedClientId === 'all' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
            </div>
          </div>

          {!selectedClient ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="text-sm font-semibold text-slate-950">
                  Клиенты
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Выберите клиента для сверки
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {clientTabs.map((client) => (
                  <button
                    key={client.id ?? 'without-client'}
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className="flex min-h-[56px] w-full items-center justify-between bg-white px-5 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="truncate pr-4">
                      {client.name}
                    </span>

                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      {client.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedClientId('all')}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    title="Назад к клиентам"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500">
                      Сверка клиента
                    </div>
                    <div className="truncate text-lg font-semibold text-slate-950">
                      {selectedClient.name}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isRecalculating}
                    onClick={() => void recalcClientPeriod()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                    title="Пересчитать автоматические стоимости заявок за выбранный период"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
                    Пересчитать стоимости
                  </button>

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
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    Скачать Excel
                  </button>

                  <button
                    type="button"
                    disabled={isIssuing || issueBlockers.length > 0}
                    onClick={() => void issueDocument()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isIssuing ? 'Формирование…' : 'Выставить счёт'}
                  </button>
                </div>
              </div>

              {/* Why the document can or cannot be issued. */}
              {issueBlockers.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="font-semibold">Счёт пока сформировать нельзя:</div>
                  <ul className="mt-1 list-disc pl-5">
                    {issueBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-amber-700">
                    Проверьте заявки ниже: «Ожидает проверки» нужно подтвердить, «Без стоимости» — исправить тариф или указать цену вручную.
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Все заявки периода проверены — счёт можно выставить ({reviewSummary.checked} заявок на {checkedBillingTotal.toFixed(2)} ₽).
                </div>
              )}

              {billingNotice && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {billingNotice}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Заявок за период
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {billingOverview?.counts.total ?? reviewSummary.checked + reviewSummary.ready + reviewSummary.unpriced + reviewSummary.billed}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="text-xs font-medium text-emerald-700">
                    Проверено
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-800">
                    {reviewSummary.checked}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <div className="text-xs font-medium text-amber-700">
                    Ожидает проверки
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-amber-800">
                    {reviewSummary.ready}
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                  <div className="text-xs font-medium text-rose-700">
                    Без стоимости
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-rose-800">
                    {reviewSummary.unpriced}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Уже в счетах
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {reviewSummary.billed}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Сумма готовых к выставлению (проверенные)
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {checkedBillingTotal.toFixed(2)} ₽
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">
                    Сумма проверенных и ожидающих проверки
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {(billingOverview?.readyAmount ?? reviewSummary.checkedAmount).toFixed(2)} ₽
                  </div>
                </div>
              </div>

              {billingOverview && billingOverview.documents.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-950">
                    Счета этого клиента
                  </div>
                  <div className="divide-y divide-slate-100">
                    {billingOverview.documents.map((document) => (
                      <div key={document.id} className="flex items-center justify-between px-5 py-3 text-sm">
                        <span className="font-medium text-slate-800">
                          №{document.number} · {formatDate(String(document.periodFrom))} — {formatDate(String(document.periodTo))}
                        </span>
                        <span className="text-slate-600">
                          {document.requestsCount} заявок · {Number(document.totalAmount).toFixed(2)} ₽ · {document.status === 'paid' ? 'оплачен' : document.status === 'cancelled' ? 'отменён' : 'выставлен'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="font-semibold text-slate-950">
                  Сверка клиента
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Стоимость рассчитывается на сервере автоматически при завершении заявки. В Excel попадут заявки со статусом «Проверено» за выбранный период.
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'partners' ? (
        <PartnerReconciliation />
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

      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setSelectedClientId('all');
            setSearch('');
          }}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          title="Назад к клиентам"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">
            Сверка клиента
          </div>
          <div className="truncate text-lg font-semibold text-slate-950">
            {selectedClientId === null
              ? 'Без клиента'
              : selectedClient?.name ?? 'Клиент'}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] table-fixed text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="w-[105px] px-3 py-2.5 font-semibold">Дата</th>
                <th className="w-[65px] px-3 py-2.5 font-semibold">№</th>
                <th className="w-[180px] px-3 py-2.5 font-semibold">Клиент</th>
                <th className="w-[190px] px-3 py-2.5 font-semibold">Отправитель</th>
                <th className="w-[190px] px-3 py-2.5 font-semibold">Получатель</th>
                <th className="w-[60px] px-2 py-2.5 text-center font-semibold">Мест</th>
                <th className="w-[150px] px-3 py-2.5 font-semibold">Стоимость</th>
                <th className="w-[130px] px-3 py-2.5 font-semibold">Состояние</th>
                <th className="w-[330px] px-3 py-2.5 font-semibold">Комментарий</th>
                <th className="w-[135px] px-3 py-2.5 font-semibold">Проверено</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading || isBillingLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    Загрузка заявок…
                  </td>
                </tr>
              ) : visibleRequests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    За выбранный период заявок нет
                  </td>
                </tr>
              ) : (
                visibleRequests.map((request) => (
                  <tr
                    key={request.id}
                    className={`align-middle ${
                      quoteStateOf(request) === 'checked'
                        ? 'hover:bg-slate-50/70'
                        : quoteStateOf(request) === 'unpriced'
                          ? 'bg-rose-50/40 hover:bg-rose-50/70'
                          : quoteStateOf(request) === 'billed'
                            ? 'bg-slate-50/60 hover:bg-slate-50'
                            : 'bg-amber-50/40 hover:bg-amber-50/70'
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {formatDate(getRequestDate(request))}
                    </td>

                    <td className="px-3 py-2 font-semibold text-slate-950">
                      {request.id}
                    </td>

                    <td className="px-3 py-2">
                      <select
                        value={request.clientId ?? ''}
                        disabled={savingRequestId === request.id}
                        onChange={(event) => {
                          void changeRequestClient(
                            request.id,
                            event.target.value,
                          );
                        }}
                        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-wait disabled:opacity-60"
                      >
                        <option value="">Без клиента</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td
                      className="truncate px-3 py-2 text-slate-600"
                      title={requestFromAddress(request)}
                    >
                      {requestFromAddress(request)}
                    </td>

                    <td
                      className="truncate px-3 py-2 text-slate-600"
                      title={requestToAddress(request)}
                    >
                      {requestToAddress(request)}
                    </td>

                    <td className="px-2 py-2 text-center font-semibold text-slate-800">
                      {request.placesCount ?? '—'}
                    </td>

                    <td className="px-3 py-2">
                      {editingFeeRequestId === request.id ? (
                        <input
                          autoFocus
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
                            setEditingFeeRequestId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setEditingFeeRequestId(null);
                            }
                          }}
                          className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-right text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-wait disabled:opacity-60"
                        />
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-slate-800">
                            {request.deliveryFee != null
                              ? `${Number(request.deliveryFee).toLocaleString('ru-RU', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} ₽`
                              : '—'}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEditingFeeRequestId(request.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="Изменить стоимость"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {quoteStateOf(request) === 'billed' ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                          В счёте
                        </span>
                      ) : quoteStateOf(request) === 'checked' ? (
                        <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Проверено
                        </span>
                      ) : quoteStateOf(request) === 'ready' ? (
                        <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Ожидает проверки
                        </span>
                      ) : (
                        <div className="min-w-0">
                          <span className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                            Без стоимости
                          </span>
                          {request.quoteIssue && (
                            <div className="mt-1 text-[11px] leading-4 text-rose-700" title={request.quoteIssue}>
                              {request.quoteIssue}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => void recalcSingleRequest(request.id)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 underline decoration-dotted hover:text-slate-900"
                            title="Повторить автоматический расчёт по текущему тарифу"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Рассчитать
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {editingCommentRequestId === request.id ? (
                        <textarea
                          autoFocus
                          defaultValue={request.comments || ''}
                          disabled={savingRequestId === request.id}
                          onBlur={(event) => {
                            void saveReviewComments(
                              request,
                              event.currentTarget.value,
                            );
                            setEditingCommentRequestId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setEditingCommentRequestId(null);
                            }
                          }}
                          className="h-9 w-full resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm leading-5 text-slate-900 outline-none focus:border-slate-500 disabled:cursor-wait disabled:opacity-60"
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate text-slate-600"
                            title={request.comments || ''}
                          >
                            {request.comments?.trim() || '—'}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEditingCommentRequestId(request.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="Изменить комментарий"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        disabled={savingRequestId === request.id || quoteStateOf(request) === 'billed'}
                        title={
                          quoteStateOf(request) === 'billed'
                            ? 'Заявка уже включена в счёт'
                            : 'Отметить стоимость как проверенную'
                        }
                        onClick={() => {
                          void toggleBillingChecked(request);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          quoteStateOf(request) === 'billed'
                            ? 'border-slate-200 bg-slate-50 text-slate-500'
                            : request.billingCheckedAt
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {quoteStateOf(request) === 'billed'
                          ? 'В счёте'
                          : request.billingCheckedAt
                            ? 'Проверено'
                            : 'Не проверено'}
                      </button>
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
