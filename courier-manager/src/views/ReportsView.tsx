import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Search, Download, FileSpreadsheet, ArrowLeft, Pencil, RefreshCw,
  FileText, ScrollText, Table2, Wallet, Ban, Paperclip, CheckCircle2, AlertTriangle, Settings2,
} from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  getAllMails,
  getPartners,
  getBillingOverview,
  recalcClientQuotes,
  recalcRequestQuote,
  setBillingReviewDecision,
  getDocumentPreview,
  issueDocumentSet,
  getBillingDocuments,
  setBillingDocumentPaid,
  voidBillingDocument,
  releaseBillingDocument,
  getBillingDocumentHistory,
  uploadPaymentProof,
  removeBillingDocumentFile,
  getDocumentSettings,
  saveDocumentSettings,
  uploadDocumentSettingsImage,
  billingDocumentFileUrl,
  billingPreviewUrl,
  billingDocumentProofUrl,
  setBillingChecked,
  setMailBillingChecked,
  updateBillingReviewFields,
  updateRequestClient,
  getClientTariffs,
  updateClientTariffs,
  type BillingDocumentRow,
  type BillingDocumentHistoryEntry,
  type BillingPaymentProof,
  type BillingRequestState,
  type BillingReviewAction,
  type BillingReviewRequest,
  type DocumentPreview,
  type DocumentSettingsDto,
  type ClientTariffsDto,
  type Client,
  type Request,
  type Mail,
  type Partner,
} from '../lib/api';
import * as XLSX from 'xlsx';
import { Modal } from '../components/Modal';

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

/** DD.MM.YYYY HH:MM for audit-trail timestamps. */
function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  const [billingOverview, setBillingOverview] = useState<Awaited<ReturnType<typeof getBillingOverview>> | null>(null);
  /** Client section: reconciliation, tariffs or issued documents. */
  const [clientSection, setClientSection] = useState<'review' | 'tariffs' | 'documents'>('review');
  /** Anchor of the client section tabs, kept in view when switching sections. */
  const clientSectionsRef = useRef<HTMLDivElement | null>(null);
  /** Preview of the set about to be issued: number, date and totals are confirmed here. */
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [previewDate, setPreviewDate] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [tariffs, setTariffs] = useState<ClientTariffsDto | null>(null);
  const [tariffsSaving, setTariffsSaving] = useState(false);
  const [documents, setDocuments] = useState<BillingDocumentRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentSettings, setDocumentSettings] = useState<DocumentSettingsDto | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState<{ id: number; paid: boolean; comment: string } | null>(null);
  /** Manager decision dialog for a cancelled/unfinished request. */
  const [decisionDraft, setDecisionDraft] = useState<{
    requestId: number;
    status: string;
    statusLabel: string;
    reviewNote: string;
  } | null>(null);
  const [voidDraft, setVoidDraft] = useState<{ id: number; number: string; reason: string } | null>(null);
  /** Annulled document whose requests are about to be released for re-issuing. */
  const [releaseDraft, setReleaseDraft] = useState<{ id: number; number: string; note: string } | null>(null);
  /** Annulled document the next document set will replace. */
  const [replacesDocumentId, setReplacesDocumentId] = useState<number | null>(null);
  /** Audit trail of the selected document. */
  const [historyDraft, setHistoryDraft] = useState<{ number: string; entries: BillingDocumentHistoryEntry[] } | null>(null);
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

    if (clientSection === 'tariffs') void loadTariffs(selectedClientId);
    if (clientSection === 'documents') void loadDocuments();

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
  }, [selectedClientId, dateFrom, dateTo, billingRefreshVersion, clientSection]);


  /** Switch the client section and keep the tab strip in view. */
  function openClientSection(section: 'review' | 'tariffs' | 'documents') {
    setClientSection(section);
    clientSectionsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /**
   * Switching between «Сверка», «Тарифы» and «Счета и акты» must not require
   * scrolling back up through the reconciliation table: bring the tabs and the
   * section header back into view. Client and period are component state, so they
   * are preserved by definition.
   */
  useEffect(() => {
    clientSectionsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [clientSection]);

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

  /** Manager decision about a cancelled or unfinished request. */
  async function submitReviewDecision(requestId: number, action: BillingReviewAction, note: string) {
    setError('');
    setBillingNotice('');
    try {
      await setBillingReviewDecision(requestId, action, note || undefined);
      setBillingNotice(`Заявка №${requestId}: решение сохранено`);
      setBillingRefreshVersion((version) => version + 1);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Не удалось сохранить решение');
    }
  }

  /** Build the preview: number, date, client, period, count, total and blockers. */
  async function loadPreview() {
    if (typeof selectedClientId !== 'number') return;
    setIsPreviewing(true);
    setError('');
    setBillingNotice('');
    try {
      const data = await getDocumentPreview(selectedClientId, dateFrom, dateTo, previewDate || undefined);
      setPreview(data);
      if (data?.documentDateIso && !previewDate) setPreviewDate(data.documentDateIso);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Не удалось построить предпросмотр');
    } finally {
      setIsPreviewing(false);
    }
  }

  /**
   * Issue the set after the manager confirmed the preview. The date shown in the
   * preview is the one used for both the invoice and the act.
   */
  async function confirmIssue() {
    if (typeof selectedClientId !== 'number') return;
    setIsIssuing(true);
    setError('');
    setBillingNotice('');
    try {
      const result = await issueDocumentSet(
        selectedClientId,
        dateFrom,
        dateTo,
        preview?.documentDateIso,
        replacesDocumentId ?? undefined,
      );
      if (result.ok && result.document) {
        setBillingNotice(
          replacesDocumentId
            ? `Комплект №${result.document.number} от ${result.document.documentDateText} сформирован взамен аннулированного: `
              + `${result.document.requestsCount} заявок на ${Number(result.document.totalAmount).toFixed(2)} ₽`
            : `Комплект №${result.document.number} от ${result.document.documentDateText} сформирован: `
              + `${result.document.requestsCount} заявок на ${Number(result.document.totalAmount).toFixed(2)} ₽`,
        );
        setPreview(null);
        setReplacesDocumentId(null);
        setClientSection('documents');
      } else {
        setBillingNotice(result.reason ?? 'Комплект пока сформировать нельзя');
      }
      setBillingRefreshVersion((version) => version + 1);
      void loadDocuments();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Не удалось сформировать комплект');
    } finally {
      setIsIssuing(false);
    }
  }

  async function loadDocuments() {
    setDocumentsLoading(true);
    try {
      setDocuments(await getBillingDocuments(typeof selectedClientId === 'number' ? selectedClientId : undefined));
    } catch (documentsError) {
      setError(documentsError instanceof Error ? documentsError.message : 'Не удалось загрузить документы');
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function loadTariffs(clientId: number) {
    try {
      setTariffs(await getClientTariffs(clientId));
    } catch (tariffsError) {
      setError(tariffsError instanceof Error ? tariffsError.message : 'Не удалось загрузить тарифы');
    }
  }

  async function saveTariffs() {
    if (!tariffs || typeof selectedClientId !== 'number') return;
    setTariffsSaving(true);
    setError('');
    try {
      const saved = await updateClientTariffs(selectedClientId, tariffs);
      setTariffs(saved);
      setBillingNotice('Тарифы сохранены');
      setBillingRefreshVersion((version) => version + 1);
    } catch (tariffsError) {
      setError(tariffsError instanceof Error ? tariffsError.message : 'Не удалось сохранить тарифы');
    } finally {
      setTariffsSaving(false);
    }
  }

  async function markPayment(document: BillingDocumentRow, paid: boolean, comment: string) {
    setError('');
    try {
      await setBillingDocumentPaid(document.id, paid, comment || undefined);
      setPaymentDraft(null);
      setBillingNotice(paid ? `Документ №${document.number} отмечен как оплаченный` : `Оплата по №${document.number} снята`);
      void loadDocuments();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Не удалось изменить статус оплаты');
    }
  }

  /** Release the requests of an annulled document so the period can be re-issued. */
  async function releaseRequests(document: BillingDocumentRow, note: string) {
    setError('');
    try {
      const result = await releaseBillingDocument(document.id, note || undefined);
      if (result.ok) {
        const count = result.releasedRequestIds?.length ?? 0;
        setBillingNotice(
          count > 0
            ? `Заявки документа №${document.number} освобождены (${count}). Их можно выставить заново.`
            : `У документа №${document.number} нет удержанных заявок`,
        );
        // The next issued set will replace this annulled document.
        setReplacesDocumentId(document.id);
        setClientSection('review');
        setPreview(null);
        void loadPreview();
      } else {
        setBillingNotice(result.reason ?? 'Не удалось освободить заявки');
      }
      void loadDocuments();
      setBillingRefreshVersion((version) => version + 1);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'Не удалось освободить заявки');
    }
  }

  async function openHistory(document: BillingDocumentRow) {
    setError('');
    try {
      setHistoryDraft({ number: document.number, entries: await getBillingDocumentHistory(document.id) });
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Не удалось загрузить историю документа');
    }
  }

  async function annulDocument(document: BillingDocumentRow, reason: string) {
    setError('');
    try {
      await voidBillingDocument(document.id, reason);
      setBillingNotice(`Документ №${document.number} аннулирован`);
      void loadDocuments();
      setBillingRefreshVersion((version) => version + 1);
    } catch (voidError) {
      setError(voidError instanceof Error ? voidError.message : 'Не удалось аннулировать документ');
    }
  }

  async function attachPaymentProof(document: BillingDocumentRow, file: File) {
    setError('');
    try {
      await uploadPaymentProof(document.id, file);
      setBillingNotice(`Подтверждение оплаты прикреплено к №${document.number}`);
      void loadDocuments();
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : 'Не удалось прикрепить подтверждение оплаты');
    }
  }

  async function removePaymentProof(fileId: number) {
    setError('');
    try {
      await removeBillingDocumentFile(fileId);
      void loadDocuments();
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : 'Не удалось удалить файл');
    }
  }

  async function openSettings() {
    setSettingsOpen(true);
    setError('');
    try {
      setDocumentSettings(await getDocumentSettings());
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Не удалось загрузить настройки');
    }
  }

  async function persistSettings(patch: Partial<DocumentSettingsDto>) {
    setSettingsSaving(true);
    setError('');
    try {
      setDocumentSettings(await saveDocumentSettings(patch));
      setBillingNotice('Реквизиты сохранены');
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Не удалось сохранить реквизиты');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function uploadSettingsImage(kind: 'signature' | 'stamp', file: File) {
    setSettingsSaving(true);
    setError('');
    try {
      setDocumentSettings(await uploadDocumentSettingsImage(kind, file));
      setBillingNotice(kind === 'signature' ? 'Подпись загружена' : 'Печать загружена');
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Не удалось загрузить изображение');
    } finally {
      setSettingsSaving(false);
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

  /**
   * Review state of one request. The server is the source of truth; older payloads
   * without it fall back to a local derivation.
   */
  function billingStateOf(request: BillingReviewRequest): BillingRequestState {
    if (request.billingState) return request.billingState;

    const hasAmount = request.deliveryFee !== null && request.deliveryFee !== undefined && request.deliveryFee !== '';
    if (request.status !== 'completed') return 'decision_needed';
    if (!hasAmount) return 'unpriced';
    return request.billingCheckedAt ? 'checked' : 'ready';
  }

  const reviewSummary = useMemo(() => {
    let checked = 0;
    let ready = 0;
    let unpriced = 0;
    let billed = 0;
    let decisionNeeded = 0;
    let clarification = 0;
    let notBillable = 0;
    let unfinished = 0;
    let cancelled = 0;
    let checkedAmount = 0;

    for (const request of visibleRequests) {
      const state = billingStateOf(request);
      if (request.status === 'cancelled') cancelled += 1;
      else if (request.status !== 'completed') unfinished += 1;

      if (state === 'checked') {
        checked += 1;
        checkedAmount += Number(request.deliveryFee ?? 0);
      } else if (state === 'ready') ready += 1;
      else if (state === 'unpriced') unpriced += 1;
      else if (state === 'billed') billed += 1;
      else if (state === 'decision_needed') decisionNeeded += 1;
      else if (state === 'clarification') clarification += 1;
      else if (state === 'decided_not_billable') notBillable += 1;
    }

    return {
      checked,
      ready,
      unpriced,
      billed,
      decisionNeeded,
      clarification,
      notBillable,
      unfinished,
      cancelled,
      unchecked: ready + unpriced + decisionNeeded + clarification,
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
              ...(billingStateOf(row) === 'billed' ? {} : { quoteState: 'ready' as BillingRequestState }),
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
              ...(billingStateOf(row) === 'billed' ? {} : { quoteState: 'ready' as BillingRequestState }),
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
                billingStateOf(row) === 'billed'
                  ? {}
                  : { quoteState: (checked ? 'checked' : (row.deliveryFee != null ? 'ready' : 'unpriced')) as BillingRequestState }
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
    () => (billingOverview?.requests ?? []).filter((request) => billingStateOf(request) === 'checked'),
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

  /**
   * Everything that prevents issuing the set right now. The server owns the final
   * decision; the preview carries the authoritative reason list.
   */
  const issueBlockers = useMemo(() => {
    const serverBlockers = billingOverview?.readiness.blockers ?? [];
    const blockers = [...serverBlockers];
    if (reviewSummary.checked === 0 && blockers.length === 0) {
      blockers.push('Нет проверенных заявок за выбранный период');
    }
    return [...new Set(blockers)];
  }, [billingOverview, reviewSummary.checked]);

  const activePeriod = useMemo(
    () => ({ clientId: selectedClientId, from: dateFrom, to: dateTo }),
    [selectedClientId, dateFrom, dateTo],
  );

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
        // The ref lives on the whole section so switching tabs always brings the
        // (always visible) tab strip and the section header back into view.
        <div ref={clientSectionsRef} className="space-y-4">
          {/* Client calculations are split into three sections. They are part of
              the section itself, so they stay visible before a client is chosen:
              a manager must not have to guess that «Тарифы» or «Счета и акты»
              exist at all. The two client-specific sections open once a client
              is selected. */}
          <div
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <button
              type="button"
              onClick={() => openClientSection('review')}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                clientSection === 'review'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Сверка
            </button>

            {([
              ['tariffs', 'Тарифы'],
              ['documents', 'Счета и акты'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={!selectedClient}
                title={selectedClient ? undefined : 'Сначала выберите клиента'}
                onClick={() => openClientSection(id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  clientSection === id && selectedClient
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-50`}
              >
                {label}
              </button>
            ))}

            {!selectedClient && (
              <span className="pl-1 text-xs text-slate-400">
                Выберите клиента ниже, чтобы открыть тарифы и документы
              </span>
            )}
          </div>

          {/* Client list, shown while no client is chosen. */}
          {!selectedClient && (
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
                    onClick={() => { setSelectedClientId(client.id); setReplacesDocumentId(null); setPreview(null); }}
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
          )}

          {selectedClient && (
            <>
              {(clientSection === 'review' || clientSection === 'documents') && (
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
                          onChange={(event) => { setDateFrom(event.target.value); setReplacesDocumentId(null); setPreview(null); }}
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
                          onChange={(event) => { setDateTo(event.target.value); setReplacesDocumentId(null); setPreview(null); }}
                          className="h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setSelectedClientId('all'); setReplacesDocumentId(null); setPreview(null); }}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    title="Назад к клиентам"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500">
                      {clientSection === 'review' ? 'Сверка клиента'
                        : clientSection === 'tariffs' ? 'Тарифы клиента'
                          : 'Счета и акты клиента'}
                    </div>
                    <div className="truncate text-lg font-semibold text-slate-950">
                      {selectedClient.name}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openSettings()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    title="Реквизиты организации для счетов и актов"
                  >
                    <Settings2 className="h-4 w-4" />
                    Реквизиты
                  </button>

                  {clientSection === 'review' && (
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
                  )}

                  {clientSection === 'review' && (
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
                  )}

                  {clientSection === 'review' && (
                  <button
                    type="button"
                    disabled={isIssuing || isPreviewing || issueBlockers.length > 0}
                    onClick={() => void (preview ? confirmIssue() : loadPreview())}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FileText className="h-4 w-4" />
                    {isIssuing ? 'Формирование…' : preview ? 'Выставить' : 'Предпросмотр и выставление'}
                  </button>
                  )}

                  {clientSection === 'tariffs' && (
                  <button
                    type="button"
                    disabled={tariffsSaving || !tariffs}
                    onClick={() => void saveTariffs()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tariffsSaving ? 'Сохранение…' : 'Сохранить тарифы'}
                  </button>
                  )}

                  {clientSection === 'documents' && (
                  <button
                    type="button"
                    onClick={() => void loadDocuments()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${documentsLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </button>
                  )}
                </div>
              </div>


              {/* Preview of the set: number, date, client, period, count, total. */}
              {clientSection === 'review' && preview && (
                <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-950">
                      Предпросмотр комплекта
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-slate-500">
                        Дата документов
                        <input
                          type="date"
                          value={preview.documentDateIso}
                          onChange={(event) => setPreviewDate(event.target.value)}
                          className="ml-2 h-9 rounded-lg border border-slate-200 px-2 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void loadPreview()}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Обновить
                      </button>
                    </div>
                  </div>

                  {/* Re-issue context: which annulled document this set replaces. */}
                  {replacesDocumentId && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span>
                        Комплект выставляется взамен аннулированного документа №
                        {documents.find((item) => item.id === replacesDocumentId)?.number ?? replacesDocumentId}.
                        Освобождённые заявки можно включить снова.
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplacesDocumentId(null)}
                        className="font-semibold underline decoration-dotted hover:text-amber-950"
                      >
                        Не связывать с аннулированным
                      </button>
                    </div>
                  )}

                  {(preview.blockedRequestIds?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                      <div className="font-semibold">
                        Удерживается другими документами: {preview.blockedRequestIds!.length}
                      </div>
                      <div className="mt-1">
                        {(preview.blockingDocuments ?? []).map((item) => (
                          <span key={item.documentId} className="mr-3 inline-block">
                            №{item.number}
                            {item.status === 'cancelled' ? ' (аннулирован)' : item.status === 'paid' ? ' (оплачен)' : ' (действует)'}
                            {item.documentDate ? ` от ${formatDate(item.documentDate)}` : ''}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1">
                        Чтобы выставить эти заявки заново, освободите их на вкладке «Счета и акты»
                        у аннулированного документа.
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div><div className="text-xs text-slate-500">Счёт №</div><div className="text-lg font-semibold text-slate-950">{preview.number}</div></div>
                    <div><div className="text-xs text-slate-500">Дата</div><div className="text-lg font-semibold text-slate-950">{preview.documentDateText}</div></div>
                    <div><div className="text-xs text-slate-500">Клиент</div><div className="truncate text-sm font-medium text-slate-900">{preview.clientName}</div></div>
                    <div><div className="text-xs text-slate-500">Период</div><div className="text-sm font-medium text-slate-900">{preview.periodText}</div></div>
                    <div><div className="text-xs text-slate-500">Заявок</div><div className="text-lg font-semibold text-slate-950">{preview.requestsCount}</div></div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <div className="text-xs text-slate-500">Сумма к оплате</div>
                      <div className="text-xl font-semibold text-slate-950">{preview.totalAmountText} ₽</div>
                      <div className="text-xs text-slate-500">{preview.amountInWords}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['invoice', 'Счёт', FileText],
                        ['act', 'Акт', ScrollText],
                        ['registry', 'Реестр', Table2],
                      ] as const).map(([kind, label, Icon]) => (
                        <a
                          key={kind}
                          href={billingPreviewUrl(Number(selectedClientId), dateFrom, dateTo, kind, preview.documentDateIso)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </a>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPreview(null)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Отменить
                      </button>
                    </div>
                  </div>

                  {preview.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-700">{preview.warnings.join('; ')}</div>
                  )}
                  <div className="mt-2 text-xs text-slate-500">
                    Проверьте номер, дату и сумму. Нажмите «Выставить» — номер и дата будут зафиксированы за комплектом.
                  </div>
                </div>
              )}

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
                onChange={(event) => { setDateFrom(event.target.value); setReplacesDocumentId(null); setPreview(null); }}
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

      {clientSection === 'review' && (
      <>
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
                      billingStateOf(request) === 'checked'
                        ? 'hover:bg-slate-50/70'
                        : billingStateOf(request) === 'unpriced'
                          ? 'bg-rose-50/40 hover:bg-rose-50/70'
                          : billingStateOf(request) === 'billed'
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
                      {billingStateOf(request) === 'billed' ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                          В счёте
                        </span>
                      ) : billingStateOf(request) === 'checked' ? (
                        <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Проверено
                        </span>
                      ) : billingStateOf(request) === 'ready' ? (
                        <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Ожидает проверки
                        </span>
                      ) : billingStateOf(request) === 'decided_not_billable' ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                          {request.reviewStateLabel ?? 'Разобрана'}
                        </span>
                      ) : billingStateOf(request) === 'decided_completed' || billingStateOf(request) === 'decision_needed' || billingStateOf(request) === 'clarification' ? (
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${
                            billingStateOf(request) === 'clarification'
                              ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                              : 'border-sky-200 bg-sky-50 text-sky-700'
                          }`}>
                            {billingStateOf(request) === 'clarification'
                              ? 'Требует уточнения'
                              : billingStateOf(request) === 'decided_completed'
                                ? 'Отмечена выполненной'
                                : request.status === 'cancelled' ? 'Отменена — нет решения' : 'Не завершена — нет решения'}
                          </span>
                          {request.billingIssue && (
                            <div className="mt-1 text-[11px] leading-4 text-slate-600">{request.billingIssue}</div>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setDecisionDraft({
                                requestId: request.id,
                                status: request.status ?? '',
                                statusLabel: request.statusLabel ?? '',
                                reviewNote: request.reviewNote ?? '',
                              })}
                              className="rounded border border-sky-200 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
                              title="Разобрать заявку: подтвердить отмену, отметить выполненной, запросить уточнение"
                            >
                              Разобрать
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <span className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                            Без стоимости
                          </span>
                          {request.billingIssue && (
                            <div className="mt-1 text-[11px] leading-4 text-rose-700" title={request.billingIssue}>
                              {request.billingIssue}
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
                        disabled={savingRequestId === request.id || billingStateOf(request) === 'billed'}
                        title={
                          billingStateOf(request) === 'billed'
                            ? 'Заявка уже включена в счёт'
                            : 'Отметить стоимость как проверенную'
                        }
                        onClick={() => {
                          void toggleBillingChecked(request);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          billingStateOf(request) === 'billed'
                            ? 'border-slate-200 bg-slate-50 text-slate-500'
                            : request.billingCheckedAt
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {billingStateOf(request) === 'billed'
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

              {clientSection === 'tariffs' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-950">Тарифы клиента</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Первое место + каждое следующее место × количество дополнительных мест.
                    Пустая ставка означает «цена не настроена»: такие заявки попадут в «Без стоимости».
                  </div>

                  {!tariffs ? (
                    <div className="mt-4 text-sm text-slate-500">Загрузка тарифов…</div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Категория</th>
                            <th className="px-3 py-2 font-semibold">Первое место, ₽</th>
                            <th className="px-3 py-2 font-semibold">Следующее место, ₽</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {([
                            ['deliveryFirstPlace', 'deliveryNextPlace', 'Доставка'],
                            ['transportCompanyFirstPlace', 'transportCompanyNextPlace', 'Транспортная компания'],
                            ['movementFirstPlace', 'movementNextPlace', 'Перемещение'],
                            ['otherFirstPlace', 'otherNextPlace', 'Прочее (вызов курьера, орехи, простая)'],
                          ] as const).map(([firstKey, nextKey, label]) => (
                            <tr key={firstKey}>
                              <td className="px-3 py-2 font-medium text-slate-800">{label}</td>
                              {[firstKey, nextKey].map((key) => (
                                <td key={key} className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={String(tariffs[key] ?? 0)}
                                    onChange={(event) => setTariffs({
                                      ...tariffs,
                                      [key]: Number(event.target.value || 0),
                                    })}
                                    className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-right text-sm"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-800">Гемотест: точка / воскресенье</td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min="0" step="1"
                                value={String(tariffs.hemotestPointPrice ?? 0)}
                                onChange={(event) => setTariffs({ ...tariffs, hemotestPointPrice: Number(event.target.value || 0) })}
                                className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-right text-sm"
                              />
                            </td>
                            <td className="px-3 py-2 flex gap-2">
                              <input
                                type="number" min="0" step="1"
                                value={String(tariffs.hemotestSundayFirstPointPrice ?? 0)}
                                onChange={(event) => setTariffs({ ...tariffs, hemotestSundayFirstPointPrice: Number(event.target.value || 0) })}
                                className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-right text-sm"
                              />
                              <input
                                type="number" min="0" step="1"
                                value={String(tariffs.hemotestSundayNextPointPrice ?? 0)}
                                onChange={(event) => setTariffs({ ...tariffs, hemotestSundayNextPointPrice: Number(event.target.value || 0) })}
                                className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-right text-sm"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="mt-3 text-xs text-slate-500">
                        После сохранения тарифов вернитесь во вкладку «Сверка» и нажмите «Пересчитать стоимости»,
                        чтобы применить новые ставки к заявкам периода.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {clientSection === 'documents' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <div className="text-sm font-semibold text-slate-950">Счета и акты</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Выставленные комплекты: счёт, акт и реестр. Статус оплаты и подтверждающие документы.
                    </div>
                  </div>

                  {documentsLoading ? (
                    <div className="px-5 py-6 text-sm text-slate-500">Загрузка…</div>
                  ) : documents.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-slate-500">Комплектов пока нет.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1180px] text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">№</th>
                            <th className="px-3 py-2 font-semibold">Дата</th>
                            <th className="px-3 py-2 font-semibold">Клиент</th>
                            <th className="px-3 py-2 font-semibold">Период</th>
                            <th className="px-3 py-2 font-semibold">Заявок</th>
                            <th className="px-3 py-2 font-semibold">Сумма</th>
                            <th className="px-3 py-2 font-semibold">Статус</th>
                            <th className="px-3 py-2 font-semibold">Документы</th>
                            <th className="px-3 py-2 font-semibold">Оплата</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {documents.map((document) => (
                            <tr key={document.id} className="align-top">
                              <td className="px-3 py-2 font-semibold text-slate-950">{document.number}</td>
                              <td className="px-3 py-2 text-slate-600">{document.documentDateText || formatDate(document.documentDate)}</td>
                              <td className="px-3 py-2 text-slate-700">{document.clientName}</td>
                              <td className="px-3 py-2 text-slate-600">{formatDate(document.periodFrom)} — {formatDate(document.periodTo)}</td>
                              <td className="px-3 py-2 text-slate-700">{document.requestsCount}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-900">{Number(document.totalAmount).toFixed(2)} ₽</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${
                                  document.status === 'paid'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : document.status === 'cancelled'
                                      ? 'border-slate-200 bg-slate-50 text-slate-500'
                                      : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}>
                                  {document.status === 'paid' ? 'Оплачено' : document.status === 'cancelled' ? 'Аннулирован' : 'Ожидает оплаты'}
                                </span>
                                {document.voidReason && (
                                  <div className="mt-1 text-[11px] text-slate-500">{document.voidReason}</div>
                                )}
                                {document.status === 'cancelled' && (
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {document.requestsReleased
                                      ? 'Заявки освобождены для перевыставления'
                                      : `Заявки удерживаются: ${document.activeRequestsCount ?? 0}`}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void openHistory(document)}
                                  className="mt-1 text-[11px] font-semibold text-slate-600 underline decoration-dotted hover:text-slate-900"
                                >
                                  История
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  {([['invoice', 'Счёт', FileText], ['act', 'Акт', ScrollText], ['registry', 'Реестр', Table2]] as const).map(([kind, label, Icon]) => (
                                    <a
                                      key={kind}
                                      href={billingDocumentFileUrl(document.id, kind)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      <Icon className="h-3.5 w-3.5" />
                                      {label}
                                    </a>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1">
                                  {paymentDraft?.id === document.id ? (
                                    <div className="flex flex-col gap-1">
                                      <input
                                        value={paymentDraft.comment}
                                        onChange={(event) => setPaymentDraft({ ...paymentDraft, comment: event.target.value })}
                                        placeholder="Комментарий к оплате"
                                        className="h-8 w-48 rounded-lg border border-slate-200 px-2 text-xs"
                                      />
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => void markPayment(document, true, paymentDraft.comment)}
                                          className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                        >
                                          Отметить оплату
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setPaymentDraft(null)}
                                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                        >
                                          Отмена
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setPaymentDraft({ id: document.id, paid: document.status !== 'paid', comment: document.paymentComment ?? '' })}
                                        disabled={document.status === 'cancelled'}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        {document.status === 'paid' ? 'Снять оплату' : 'Оплачено'}
                                      </button>
                                      <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                        <Paperclip className="h-3.5 w-3.5" />
                                        Подтверждение
                                        <input
                                          type="file"
                                          accept="application/pdf,image/jpeg,image/png"
                                          className="hidden"
                                          onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) void attachPaymentProof(document, file);
                                            event.target.value = '';
                                          }}
                                        />
                                      </label>
                                      {document.status !== 'cancelled' && document.status !== 'paid' && (
                                        <button
                                          type="button"
                                          onClick={() => setVoidDraft({ id: document.id, number: document.number, reason: '' })}
                                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                        >
                                          <Ban className="h-3.5 w-3.5" />
                                          Аннулировать
                                        </button>
                                      )}

                                      {/* Annulled document: free its requests, then re-issue the period. */}
                                      {document.status === 'cancelled' && (document.activeRequestsCount ?? 0) > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setReleaseDraft({ id: document.id, number: document.number, note: '' })}
                                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                        >
                                          <RefreshCw className="h-3.5 w-3.5" />
                                          Освободить заявки ({document.activeRequestsCount})
                                        </button>
                                      )}
                                      {document.status === 'cancelled' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReplacesDocumentId(document.id);
                                            setClientSection('review');
                                            setPreview(null);
                                            setBillingNotice(
                                              `Документ №${document.number} будет указан как заменённый. `
                                              + 'Проверьте период и выставите комплект заново.',
                                            );
                                          }}
                                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                                        >
                                          <FileSpreadsheet className="h-3.5 w-3.5" />
                                          Перевыставить
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {document.paidAt && (
                                    <div className="text-[11px] text-slate-500">Оплачено {formatDate(document.paidAt)}</div>
                                  )}
                                  {(document.paymentProofs ?? []).length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {(document.paymentProofs ?? []).map((proof) => (
                                        <div key={proof.id} className="flex items-center gap-1 text-[11px] text-slate-600">
                                          <a
                                            href={billingDocumentProofUrl(proof)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline decoration-dotted hover:text-slate-900"
                                          >
                                            {proof.originalName}
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => void removePaymentProof(proof.id)}
                                            className="text-slate-400 hover:text-rose-600"
                                            title="Удалить файл"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
        </>
      )}

      {/* Manager decision about a cancelled / unfinished request. */}
      <Modal isOpen={Boolean(decisionDraft)} onClose={() => setDecisionDraft(null)}>
        <div className="w-[min(560px,calc(100vw-32px))] rounded-2xl bg-white p-5 shadow-2xl">
          <div className="text-base font-semibold text-slate-950">
            Разбор заявки №{decisionDraft?.requestId}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Статус заявки: {decisionDraft?.statusLabel || decisionDraft?.status}
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-600">
            Причина / комментарий решения
            <textarea
              value={decisionDraft?.reviewNote ?? ''}
              onChange={(event) => setDecisionDraft((current) => current ? { ...current, reviewNote: event.target.value } : current)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Например: заказ отменён клиентом по телефону"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void submitReviewDecision(decisionDraft!.requestId, 'confirm_cancelled', decisionDraft!.reviewNote); setDecisionDraft(null); }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Подтвердить отмену
            </button>
            <button
              type="button"
              onClick={() => { void submitReviewDecision(decisionDraft!.requestId, 'mark_completed', decisionDraft!.reviewNote); setDecisionDraft(null); }}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              title="Заявка уйдёт в обычный процесс выполнения: проставится дата, рассчитается стоимость и появится проверка"
            >
              Фактически выполнена
            </button>
            <button
              type="button"
              onClick={() => { void submitReviewDecision(decisionDraft!.requestId, 'requires_clarification', decisionDraft!.reviewNote); setDecisionDraft(null); }}
              className="rounded-xl border border-fuchsia-200 px-3 py-2 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-50"
            >
              Требует уточнения
            </button>
            <button
              type="button"
              onClick={() => { void submitReviewDecision(decisionDraft!.requestId, 'not_billable', decisionDraft!.reviewNote); setDecisionDraft(null); }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Не оплачивать
            </button>
            <button
              type="button"
              onClick={() => { void submitReviewDecision(decisionDraft!.requestId, 'reset', ''); setDecisionDraft(null); }}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Снять решение
            </button>
          </div>
        </div>
      </Modal>

      {/* Annul a document: the record stays, nothing is deleted. */}
      <Modal isOpen={Boolean(voidDraft)} onClose={() => setVoidDraft(null)}>
        <div className="w-[min(520px,calc(100vw-32px))] rounded-2xl bg-white p-5 shadow-2xl">
          <div className="text-base font-semibold text-slate-950">
            Аннулировать документ №{voidDraft?.number}?
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Документ останется в истории со статусом «Аннулирован». Заявки не будут удалены.
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-600">
            Причина аннулирования
            <textarea
              value={voidDraft?.reason ?? ''}
              onChange={(event) => setVoidDraft((current) => current ? { ...current, reason: event.target.value } : current)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setVoidDraft(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Отмена
            </button>
            <button
              type="button"
              disabled={!voidDraft?.reason.trim()}
              onClick={() => { const draft = voidDraft!; setVoidDraft(null); const document = documents.find((d) => d.id === draft.id); if (document) void annulDocument(document, draft.reason); }}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
            >
              Аннулировать
            </button>
          </div>
        </div>
      </Modal>

      {/* Release the requests of an annulled document so the period can be re-issued. */}
      <Modal isOpen={Boolean(releaseDraft)} onClose={() => setReleaseDraft(null)}>
        <div className="w-[min(560px,calc(100vw-32px))] rounded-2xl bg-white p-5 shadow-2xl">
          <div className="text-base font-semibold text-slate-950">
            Освободить заявки документа №{releaseDraft?.number}?
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Аннулированный документ и его состав останутся в истории навсегда: номер, сумма, файлы и
            состав заявок сохраняются. Освобождённые заявки станут доступны для нового комплекта.
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-600">
            Комментарий к освобождению
            <textarea
              value={releaseDraft?.note ?? ''}
              onChange={(event) => setReleaseDraft((current) => current ? { ...current, note: event.target.value } : current)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Например: перевыставляем с исправленной суммой"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setReleaseDraft(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Отмена
            </button>
            <button
              type="button"
              onClick={() => { const draft = releaseDraft!; setReleaseDraft(null); const document = documents.find((d) => d.id === draft.id); if (document) void releaseRequests(document, draft.note); }}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Освободить заявки
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit trail of one document: issued, annulled, released, replaced. */}
      <Modal isOpen={Boolean(historyDraft)} onClose={() => setHistoryDraft(null)}>
        <div className="max-h-[80vh] w-[min(680px,calc(100vw-32px))] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="text-base font-semibold text-slate-950">
            История документа №{historyDraft?.number}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Записи не удаляются: видно, кто и когда выставил, аннулировал, освободил заявки и какой
            документ заменил этот.
          </div>
          <div className="mt-4 space-y-2">
            {(historyDraft?.entries ?? []).length === 0 && (
              <div className="text-sm text-slate-500">Записей пока нет.</div>
            )}
            {(historyDraft?.entries ?? []).map((entry) => {
              const labels: Record<BillingDocumentHistoryEntry['kind'], string> = {
                issued: 'Комплект выставлен',
                reissued: 'Выставлен взамен аннулированного',
                voided: 'Документ аннулирован',
                requests_released: 'Заявки освобождены',
                replaced_by: 'Заменён другим документом',
                payment_set: 'Отмечена оплата',
                payment_cleared: 'Оплата снята',
              };
              const details = entry.details ?? {};
              const replacedBy = typeof details.replacedByNumber === 'string' ? details.replacedByNumber : null;
              const replaces = typeof details.replacesDocumentId === 'number' ? details.replacesDocumentId : null;
              const releasedCount = typeof details.releasedCount === 'number' ? details.releasedCount : null;
              return (
                <div key={entry.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{labels[entry.kind]}</span>
                    <span className="text-[11px] text-slate-500">
                      {formatDateTime(entry.createdAt)}{entry.managerName ? ` · ${entry.managerName}` : ''}
                    </span>
                  </div>
                  {entry.note && <div className="mt-1 text-xs text-slate-600">{entry.note}</div>}
                  {replacedBy && (
                    <div className="mt-1 text-xs text-slate-600">Заменён документом №{replacedBy}</div>
                  )}
                  {replaces !== null && (
                    <div className="mt-1 text-xs text-slate-600">Взамен аннулированного документа №{replaces}</div>
                  )}
                  {releasedCount !== null && (
                    <div className="mt-1 text-xs text-slate-600">Освобождено заявок: {releasedCount}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setHistoryDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Закрыть
            </button>
          </div>
        </div>
      </Modal>

      {/* Our own requisites used by the printed documents. */}
      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div className="max-h-[86vh] w-[min(900px,calc(100vw-32px))] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-slate-950">Реквизиты организации</div>
              <div className="mt-1 text-xs text-slate-500">Печатаются на счетах и актах. Не подставляются автоматически.</div>
            </div>
            <span className="text-xs text-slate-400">{settingsSaving ? 'Сохранение…' : ''}</span>
          </div>

          {!documentSettings ? (
            <div className="mt-4 text-sm text-slate-500">Загрузка…</div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {([
                  ['executorName', 'Полное наименование *'],
                  ['executorShortName', 'Сокращённое наименование'],
                  ['executorInn', 'ИНН *'],
                  ['executorKpp', 'КПП'],
                  ['executorOgrn', 'ОГРН'],
                  ['executorOgrnip', 'ОГРНИП'],
                  ['executorAddress', 'Юридический адрес *'],
                  ['executorPostalAddress', 'Почтовый адрес'],
                  ['executorPhone', 'Телефон'],
                  ['executorEmail', 'E-mail'],
                  ['bankName', 'Банк *'],
                  ['bankBik', 'БИК *'],
                  ['bankAccount', 'Расчётный счёт *'],
                  ['bankCorrespondentAccount', 'Корреспондентский счёт *'],
                  ['directorName', 'ФИО руководителя *'],
                  ['directorPosition', 'Должность руководителя'],
                  ['accountantName', 'ФИО бухгалтера'],
                  ['vatText', 'Текст НДС на документах'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block text-xs font-medium text-slate-600">
                    {label}
                    <input
                      value={String(documentSettings[key] ?? '')}
                      onChange={(event) => setDocumentSettings({ ...documentSettings, [key]: event.target.value } as DocumentSettingsDto)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </label>
                ))}
                <label className="block text-xs font-medium text-slate-600">
                  Режим НДС
                  <select
                    value={documentSettings.vatMode}
                    onChange={(event) => setDocumentSettings({ ...documentSettings, vatMode: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                  >
                    <option value="without_vat">Без НДС</option>
                    <option value="vat">НДС</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Ставка НДС, %
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={String(documentSettings.vatRate ?? 0)}
                    onChange={(event) => setDocumentSettings({ ...documentSettings, vatRate: Number(event.target.value || 0) })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Следующий номер документа
                  <input
                    type="number" min="1" step="1"
                    value={String(documentSettings.nextDocumentNumber)}
                    onChange={(event) => setDocumentSettings({ ...documentSettings, nextDocumentNumber: Number(event.target.value || 1) })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 md:col-span-3">
                  Основание работы без НДС (необязательно)
                  <input
                    value={String(documentSettings.vatExemptionBasis ?? '')}
                    onChange={(event) => setDocumentSettings({ ...documentSettings, vatExemptionBasis: event.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {([['signature', 'Подпись', documentSettings.signatureFile], ['stamp', 'Печать', documentSettings.stampFile]] as const).map(([kind, label, file]) => (
                  <div key={kind} className="flex items-center gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Paperclip className="h-3.5 w-3.5" />
                      {file ? `Заменить: ${label}` : `Загрузить: ${label}`}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          if (selected) void uploadSettingsImage(kind, selected);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {file && <span className="text-[11px] text-slate-500">{file}</span>}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Закрыть
                </button>
                <button
                  type="button"
                  disabled={settingsSaving}
                  onClick={() => void persistSettings(documentSettings)}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Сохранить реквизиты
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

    </div>
  );
}
