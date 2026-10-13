import { useState, useEffect, useMemo } from 'react';
import { OrganizationLogo } from '../../components/OrganizationLogoField';
import { Activity, CheckCircle2, Landmark, Loader2, Mail, MapPin, RotateCcw, Trash2 } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  createRequest,
  uploadRequestAttachment,
  parseRequestWithAI,
  assignRequestCourier,
  updateRequestStatus,
  post,
  managerFetch,
} from '../../lib/api';
import { useManagerRealtime } from '../../lib/useManagerRealtime';
import { TasksToolbar } from './components/TasksToolbar';
import { TasksTable } from './components/TasksTable';
import { EmptyState } from './components/EmptyState';
import { CreateTaskModal } from './components/modals/CreateTaskModal';
import { TaskDetailsModal } from './components/modals/TaskDetailsModal';
import { AiTaskModal } from './components/modals/AiTaskModal';
import { Modal } from '../../components/Modal';
import MailsView from '../../views/MailsView';
import type { Request, Client, StatusFilter, TaskFormData } from './model/types';
import { getFilteredRequests } from './model/filters';
import { formatLocalDate, formatLocalDateWithOptions, formatLocalTime, getLocalDateKey, toLocalDateKey } from '../../lib/local-time';

type SavedRequestTemplate = { id: string; name: string; requestType: string; data: Partial<TaskFormData>; usageCount?: number; pinned?: boolean };
const TEMPLATE_TYPE_NAMES: Record<string, string> = {
  delivery: 'Доставка', movement: 'Перемещение', nuts: 'Орехи', courier_call: 'Вызов курьера',
  pickup_from_tc: 'Транспортная компания', simple: 'Заявка',
};

type OperationMode = 'requests' | 'mails' | 'hemotest' | 'sberbank';
const normalizePackageType = (value: unknown): TaskFormData['packageType'] => {
  if (value === 'document' || value === 'small' || value === 'medium' || value === 'large' || value === 'fragile') {
    return value;
  }
  return 'small';
};
const normalizePaymentMethod = (value: unknown): TaskFormData['paymentMethod'] => {
  if (value === 'paid' || value === 'transfer' || value === 'cash' || value === 'terminal' || value === 'qr') {
    return value;
  }
  return 'paid';
};

const cleanAiText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'не указано' || lowered === 'не найдено') return '';
  return text;
};

const parseAiPaymentAmount = (value: unknown): number => {
  const normalized = cleanAiText(value).replace(/[^0-9.,]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};


type CourierOption = { id: number; name: string; isActive?: boolean };
type OperationPoint = {
  id: number;
  pointId?: number;
  courierId?: number | null;
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
  isPicked?: boolean;
  pickedAt?: string;
  pickedBy?: string;
  courierName?: string;
  completedAt?: string;
};
type OperationList = { id: number; name: string; meta: string; status: string; items: OperationPoint[] };
type PickupList = { id: number; name: string; status: string; date?: string; dayOfWeek?: number; createdAt?: string; updatedAt?: string };
type PickupListWithItems = { list?: PickupList; items?: OperationPoint[] };

const API_BASE = '/api/trpc';
const API_URL = import.meta.env.VITE_API_URL || '';

const weekdayNames: Record<number, string> = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница' };



function OperationCompletionProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const size = 20;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - progress);
  const isDone = total > 0 && completed === total;

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 shadow-sm">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isDone ? 'rgb(16 185 129)' : 'rgb(100 116 139)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>

      <span className={isDone ? 'text-emerald-600' : 'text-slate-600'}>
        {completed}/{total} забрано
      </span>
    </div>
  );
}

function getBusinessWeekdayFromDate(dateValue: string) {
  if (!dateValue) return getTodayBusinessWeekday();

  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return getTodayBusinessWeekday();

  const jsDay = new Date(year, month - 1, day).getDay();

  // Для Сбербанка шаблоны 1–5. Выходные показываем как пятницу.
  if (jsDay === 0 || jsDay === 6) return 5;

  return jsDay;
}

function isSameDateKey(value: string | undefined, dateKey: string) {
  if (!value) return false;
  return toLocalDateKey(value) === dateKey;
}

function formatArchiveDateLabel(dateKey: string) {
  if (!dateKey) return '';
  return formatLocalDateWithOptions(dateKey, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }, dateKey);
}

function getTodayDate() { return getLocalDateKey(); }
function getTodayBusinessWeekday() { const day = new Date().getDay(); return day === 0 || day > 5 ? 5 : day; }

function getPickupMeta(point: OperationPoint) {
  const pickedAt = point.pickedAt || point.completedAt;
  const pickedBy = point.pickedBy || point.courierName;
  const isPicked = point.isPicked === true;
  if (!isPicked) return { isPicked, label: 'Не забран', detail: '' };
  const time = pickedAt ? formatLocalTime(pickedAt) : 'время не указано';
  return { isPicked, label: 'Забран', detail: `${pickedBy || 'Курьер'} • ${time}` };
}

async function trpcQuery<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const wrappedInput = encodeURIComponent(JSON.stringify({ json: input }));
  const response = await managerFetch(`${API_BASE}/${path}?input=${wrappedInput}`);
  if (!response.ok) throw new Error(await response.text() || `Failed to fetch ${path}`);
  const data = await response.json();
  return data.result?.data?.json || data.result?.data || [];
}

async function trpcMutation<T = unknown>(path: string, input: Record<string, unknown>): Promise<T> {
  const response = await managerFetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ json: input }),
  });

  if (!response.ok) throw new Error(await response.text() || `Failed to mutate ${path}`);

  const data = await response.json();
  return data.result?.data?.json || data.result?.data || data;
}

async function fetchCouriers(): Promise<CourierOption[]> {
  const response = await managerFetch(`${API_URL}/api/manager/couriers`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Failed to load couriers');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export default function TasksPage({ archiveDate }: { archiveDate?: string }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [operationMode, setOperationMode] = useState<OperationMode>('requests');
  const [operationLists, setOperationLists] = useState<OperationList[]>([]);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [updatingPickupKey, setUpdatingPickupKey] = useState<string | null>(null);
  const [pickupToRemove, setPickupToRemove] = useState<(OperationPoint & { listId: number }) | null>(null);
  const [removingPickupKey, setRemovingPickupKey] = useState<string | null>(null);
  const [removePickupError, setRemovePickupError] = useState<string | null>(null);
  const [hemotestDate, setHemotestDate] = useState(getTodayDate());
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const selectedDate = archiveDate || getTodayDate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedRequestTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateSort, setTemplateSort] = useState<'popular' | 'company' | 'recent' | 'alphabet'>('popular');
  const [templateCompany, setTemplateCompany] = useState('all');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesCreating, setTemplatesCreating] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [templateDeleteConfirm, setTemplateDeleteConfirm] = useState<string | null>(null);

  const [showAiModal, setShowAiModal] = useState(false);

  const [createInitialData, setCreateInitialData] = useState<Partial<TaskFormData> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [isUpdatingRequest, setIsUpdatingRequest] = useState(false);
  const [assigningRequestId, setAssigningRequestId] = useState<number | null>(null);
  const [updatingRequestStatusId, setUpdatingRequestStatusId] = useState<number | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedRequestNumber, setSelectedRequestNumber] = useState<number | null>(null);
  const [isEditingSelectedRequest, setIsEditingSelectedRequest] = useState(false);
  const { snapshot: realtimeSnapshot } = useManagerRealtime();

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!realtimeSnapshot) return;

    if (!Array.isArray(realtimeSnapshot.requests)) {
      console.warn('[TasksPage] ignore invalid realtime snapshot', realtimeSnapshot);
      return;
    }

    console.log('[TasksPage] realtime sync', realtimeSnapshot.updatedAt);
    setRequests(realtimeSnapshot.requests);

    if (operationMode === 'hemotest') {
      loadHemotestLists(true);
    }

    if (operationMode === 'sberbank') {
      loadSberbankLists(true);
    }
  }, [realtimeSnapshot, operationMode, hemotestDate, selectedDate]);
  useEffect(() => {
    if (operationMode === 'hemotest') loadHemotestLists();
    if (operationMode === 'sberbank') loadSberbankLists();
  }, [operationMode, selectedDate]);

  const loadData = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      const [requestsData, clientsData, couriersData] = await Promise.all([
        getAllRequests(),
        getAllClients(),
        fetchCouriers(),
      ]);
      setRequests(requestsData);
      setClients(clientsData);
      setCouriers(couriersData.filter((courier) => courier.isActive !== false));
    } catch (error) {
      console.error('Failed to load data:', error);
      if (showLoader) alert('Ошибка при загрузке заявок');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  const loadHemotestLists = async (showLoader = true) => {
    try {
      if (showLoader) setIsOperationLoading(true);
      const lists = await trpcQuery<PickupList[]>('hemotest.listsForDate', { date: selectedDate });
      const detailed = await Promise.all(lists.map(async (list) => {
        const full = await trpcQuery<PickupListWithItems>('hemotest.getList', { listId: list.id });
        return { id: list.id, name: list.name, meta: list.date ? formatLocalDate(list.date) : formatArchiveDateLabel(selectedDate), status: list.status, items: full.items || [] };
      }));
      setOperationLists(detailed);
    } catch (error) {
      console.error('Failed to load hemotest lists:', error);
      setOperationLists([]);
    } finally {
      if (showLoader) setIsOperationLoading(false);
    }
  };

  const loadSberbankLists = async (showLoader = true) => {
    try {
      if (showLoader) setIsOperationLoading(true);

      const lists = await trpcQuery<PickupList[]>('sberbank.listsForDate', { date: selectedDate });

      const detailed = await Promise.all(lists.map(async (list) => {
        const full = await trpcQuery<PickupListWithItems>('sberbank.getList', { listId: list.id });
        return {
          id: list.id,
          name: list.name,
          meta: list.date ? formatArchiveDateLabel(list.date) : formatArchiveDateLabel(selectedDate),
          status: list.status,
          items: full.items || [],
        };
      }));

      setOperationLists(detailed);
    } catch (error) {
      console.error('Failed to load sberbank lists:', error);
      setOperationLists([]);
    } finally {
      if (showLoader) setIsOperationLoading(false);
    }
  };

  const handleTogglePickupCompletion = async (point: OperationPoint) => {
    if (operationMode !== 'hemotest' && operationMode !== 'sberbank') return;

    const pointId = point.pointId || point.id;
    const courierId = point.courierId;

    if (!courierId) {
      alert('Сначала назначьте точке курьера');
      return;
    }

    const pickup = getPickupMeta(point);
    const procedure = operationMode === 'hemotest'
      ? 'managerHemotest.setPickupStatus'
      : 'managerSberbank.setPickupStatus';
    const updateKey = `${operationMode}-${pointId}`;

    try {
      setUpdatingPickupKey(updateKey);

      await trpcMutation(procedure, {
        pointId,
        courierId,
        date: selectedDate,
        isPicked: !pickup.isPicked,
      });

      if (operationMode === 'hemotest') {
        await loadHemotestLists(false);
      } else {
        await loadSberbankLists(false);
      }
    } catch (error) {
      console.error('Failed to update pickup completion:', error);
      alert(`Ошибка при изменении отметки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setUpdatingPickupKey(null);
    }
  };

  const openRemovePickupPoint = (point: OperationPoint & { listId: number }) => {
    setRemovePickupError(null);
    setPickupToRemove(point);
  };

  const closeRemovePickupPoint = () => {
    if (removingPickupKey) return;
    setPickupToRemove(null);
    setRemovePickupError(null);
  };

  const handleRemovePickupPoint = async () => {
    const point = pickupToRemove;
    if (!point) return;
    if (operationMode !== 'hemotest' && operationMode !== 'sberbank') return;

    const pointId = point.pointId || point.id;
    setRemovingPickupKey(`${operationMode}-${pointId}`);
    setRemovePickupError(null);

    try {
      await trpcMutation(
        operationMode === 'hemotest' ? 'hemotest.removePointFromList' : 'sberbank.removePointFromList',
        { listId: point.listId, pointId },
      );
      setPickupToRemove(null);

      if (operationMode === 'hemotest') {
        await loadHemotestLists(false);
      } else {
        await loadSberbankLists(false);
      }
    } catch (error) {
      console.error('Failed to remove point from list:', error);
      setRemovePickupError(
        error instanceof Error && error.message ? error.message : 'Не удалось удалить точку из списка',
      );
    } finally {
      setRemovingPickupKey(null);
    }
  };

  const filteredRequests = getFilteredRequests(requests, selectedStatus, selectedDate, searchQuery);
  const flattenedPoints = operationLists.flatMap((list) => list.items.map((point) => ({ ...point, listId: list.id, listName: list.name, listMeta: list.meta })));
  const pickedCount = flattenedPoints.filter((point) => getPickupMeta(point).isPicked).length;


  const loadSavedTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const response = await managerFetch('/api/manager/request-templates', { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить шаблоны');
      const data: unknown = await response.json();
      setSavedTemplates(Array.isArray(data) ? data as SavedRequestTemplate[] : []);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : 'Ошибка загрузки шаблонов');
    } finally { setTemplatesLoading(false); }
  };
  const openSavedTemplates = () => {
    setSelectedTemplateIds([]);
    setTemplateSearch('');
    setTemplateCompany('all');
    setTemplateDeleteConfirm(null);
    setShowTemplatesModal(true);
    void loadSavedTemplates();
  };
  const deleteSavedTemplate = async (id: string) => {
    setTemplatesError('');
    try {
      const response = await managerFetch(`/api/manager/request-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Не удалось удалить шаблон');
      setSelectedTemplateIds(previous => previous.filter(value => value !== id));
      setTemplateDeleteConfirm(null);
      await loadSavedTemplates();
    } catch (error) { setTemplatesError(error instanceof Error ? error.message : 'Ошибка удаления'); }
  };
  const toggleTemplatePin = async (item: SavedRequestTemplate) => {
    setTemplatesError('');
    try {
      const response = await managerFetch(`/api/manager/request-templates/${encodeURIComponent(item.id)}/pin`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !item.pinned }),
      });
      if (!response.ok) throw new Error('Не удалось закрепить шаблон');
      const updated = await response.json() as SavedRequestTemplate;
      setSavedTemplates(previous => previous.map(value => value.id === item.id ? updated : value));
    } catch (error) { setTemplatesError(error instanceof Error ? error.message : 'Ошибка сохранения'); }
  };
  const visibleTemplates = useMemo(() => {
    const search = templateSearch.toLocaleLowerCase('ru').trim();
    const companyName = (item: SavedRequestTemplate) => clients.find(client => String(client.id) === String(item.data.clientId))?.name || item.name;
    return savedTemplates.filter(item => {
      const matchesCompany = templateCompany === 'all' || String(item.data.clientId) === templateCompany;
      const text = `${companyName(item)} ${item.name} ${item.requestType} ${item.data.senderAddress || ''} ${item.data.deliveryAddress || ''} ${item.data.recipientAddress || ''}`.toLocaleLowerCase('ru');
      return matchesCompany && text.includes(search);
    }).sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (templateSort === 'popular') return (b.usageCount || 0) - (a.usageCount || 0);
      if (templateSort === 'company') return companyName(a).localeCompare(companyName(b), 'ru');
      if (templateSort === 'alphabet') return a.name.localeCompare(b.name, 'ru');
      return savedTemplates.indexOf(b) - savedTemplates.indexOf(a);
    });
  }, [savedTemplates, clients, templateSearch, templateCompany, templateSort]);
  const createFromSavedTemplates = async () => {
    const chosen = savedTemplates.filter(item => selectedTemplateIds.includes(item.id));
    if (!chosen.length) return;
    setTemplatesCreating(true);
    setTemplatesError('');
    let created = 0;
    try {
      for (const item of chosen) {
        const data = item.data;
        const payload = {
          ...data,
          requestType: item.requestType,
          requestDate: getLocalDateKey(),
          isHistoricalCompleted: false,
          courierId: undefined,
          requestFiles: undefined,
          recipientName: data.recipientName || data.senderName || 'Без получателя',
          recipientPhone: data.recipientPhone || data.senderPhone || '',
          deliveryAddress: data.deliveryAddress || data.recipientAddress || data.senderAddress || '',
        };
        await createRequest(payload as any);
        created++;
        // A successfully created request must not be retried just because usage accounting fails.
        try {
          const tracked = await managerFetch(`/api/manager/request-templates/${encodeURIComponent(item.id)}/used`, { method: 'POST' });
          if (tracked.ok) {
            const updated = await tracked.json() as SavedRequestTemplate;
            setSavedTemplates(previous => previous.map(value => value.id === item.id ? updated : value));
          }
        } catch { /* Statistics are best-effort, request is already created. */ }
      }
      setShowTemplatesModal(false);
      setOperationMode('requests');
      setSelectedStatus('all');
      await loadData();
    } catch (error) {
      setTemplatesError(`Создано ${created} из ${chosen.length}. ${error instanceof Error ? error.message : 'Ошибка создания'}. Не повторяйте всю операцию без проверки списка заявок.`);
      await loadData();
    } finally { setTemplatesCreating(false); }
  };

  const openCreateRequest = (requestType: NonNullable<TaskFormData['requestType']>) => {
    setCreateInitialData({ requestType });
    setShowCreateModal(true);
  };

  const closeCreateRequest = () => {
    setShowCreateModal(false);
    setCreateInitialData(null);
  };

  const handleAssignCourier = async (requestId: number, courierId: number | null) => {
    try {
      setAssigningRequestId(requestId);
      await assignRequestCourier(requestId, courierId);
      await loadData();
    } catch (error) {
      console.error('Failed to assign courier:', error);
      alert(`Ошибка при назначении курьера: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setAssigningRequestId(null);
    }
  };

  const handleToggleRequestCompletion = async (request: Request) => {
    const nextStatus: Request['status'] = request.status === 'completed'
      ? (request.courierId ? 'assigned' : 'pending')
      : 'completed';

    try {
      setUpdatingRequestStatusId(request.id);
      await updateRequestStatus(request.id, nextStatus);
      await loadData(false);
    } catch (error) {
      console.error('Failed to update request completion:', error);
      alert(`Ошибка при изменении статуса заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setUpdatingRequestStatusId(null);
    }
  };

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      setIsCreating(true);
      const { requestFiles, ...requestPayload } = data;
      const requestData = {
        requestType: requestPayload.requestType || 'delivery',
        recipientName: requestPayload.recipientName || requestPayload.senderName || 'Без получателя',
        recipientPhone: requestPayload.recipientPhone || requestPayload.senderPhone || '',
        deliveryAddress: requestPayload.deliveryAddress || requestPayload.recipientAddress || requestPayload.senderAddress || '',
        ...requestPayload,
      };
      const createdRequest = await createRequest(requestData as any);

      if (createdRequest.id && requestFiles?.length) {
        await Promise.all(requestFiles.map((file) => uploadRequestAttachment(createdRequest.id, file)));
      }
      closeCreateRequest();
      setOperationMode('requests');
      setSelectedStatus('all');
      await loadData();
    } catch (error) {
      console.error('Failed to create task:', error);
      alert(`Ошибка при создании заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setIsCreating(false);
    }
  };


  const requestToFormData = (request: Request): TaskFormData => ({
    requestType: request.requestType,
    clientId: request.clientId,
    courierId: request.courierId ?? undefined,
    senderName: request.senderName || '',
    senderCompany: request.senderCompany || '',
    senderCity: request.senderCity || '',
    senderAddress: request.senderAddress || '',
    senderPhone: request.senderPhone || '',
    recipientName: request.recipientName || '',
    recipientCompany: request.recipientCompany || '',
    recipientCity: request.recipientCity || '',
    recipientPhone: request.recipientPhone || '',
    recipientAddress: request.recipientAddress || '',
    deliveryAddress: request.deliveryAddress || '',
    deliveryCity: request.deliveryCity || '',
    packageDescription: request.packageDescription || '',
    packageType: normalizePackageType(request.packageType),
    specialInstructions: request.specialInstructions || '',
    deliveryTimeFrom: request.deliveryTimeFrom || '',
    deliveryTimeTo: request.deliveryTimeTo || '',
    placesCount: request.placesCount,
    comments: request.comments || '',
    paymentMethod: request.paymentMethod || 'paid',
    paymentAmount: Number(request.paymentAmount || 0),
    items: request.items || '',
    callReason: request.callReason || '',
    requesterType: request.requesterType ?? null,
    requesterId: request.requesterId ?? null,
    requesterNameSnapshot: request.requesterNameSnapshot ?? null,
    tcName: request.tcName || '',
    tcAddress: request.tcAddress || '',
    trackingNumber: request.trackingNumber || '',
    description: request.description || '',
    estimatedMinutes: request.estimatedMinutes,
  });

  const editInitialData = useMemo(
    () => selectedRequest ? requestToFormData(selectedRequest) : null,
    [selectedRequest],
  );

  const handleOpenRequest = (request: Request, displayNumber: number) => {
    setSelectedRequest(request);
    setSelectedRequestNumber(displayNumber);
    setIsEditingSelectedRequest(false);
  };

  const handleUpdateRequest = async (requestId: number, data: Partial<Request>) => {
    try {
      setIsUpdatingRequest(true);
      await post('/api/trpc/requests.update', { id: requestId, ...data });
      setSelectedRequest(null);
      setSelectedRequestNumber(null);
      setIsEditingSelectedRequest(false);
      await loadData(false);
    } catch (error) {
      console.error('Failed to update request:', error);
      alert(`Ошибка при сохранении заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setIsUpdatingRequest(false);
    }
  };

  const handleDeleteRequest = async (request: Request, displayNumber: number) => {
    const label = `#${displayNumber}${request.senderName ? ` от ${request.senderName}` : ''}`;
    if (!window.confirm(`Удалить заявку ${label}? Она исчезнет и у назначенного курьера.`)) return;

    try {
      setDeletingRequestId(request.id);
      await post('/api/trpc/requests.delete', { id: request.id });
      if (selectedRequest?.id === request.id) {
        setSelectedRequest(null);
        setSelectedRequestNumber(null);
        setIsEditingSelectedRequest(false);
      }
      await loadData(false);
    } catch (error) {
      console.error('Failed to delete request:', error);
      alert(`Ошибка при удалении заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handleAiParse = async (text: string, selectedRequestType: NonNullable<TaskFormData['requestType']> = 'delivery') => {
    try {
      setIsParsingAi(true);
      const result = await parseRequestWithAI(text);
      const data = result.data;

      if (!data) {
        throw new Error('AI returned empty data');
      }

      const commentParts = [
        cleanAiText(data.comment),
        cleanAiText(data.packageDescription) ? `Что везём: ${cleanAiText(data.packageDescription)}` : '',
        cleanAiText(data.specialInstructions) ? `Инструкции: ${cleanAiText(data.specialInstructions)}` : '',
        text ? `Исходный текст: ${text}` : '',
      ].filter(Boolean);

      setCreateInitialData({
        requestType: selectedRequestType,
        senderName: cleanAiText(data.senderName || data.clientName),
        senderPhone: cleanAiText(data.senderPhone),
        senderAddress: cleanAiText(data.senderAddress || data.pickupAddress),
        recipientName: cleanAiText(data.recipientName),
        recipientPhone: cleanAiText(data.recipientPhone),
        deliveryAddress: cleanAiText(data.deliveryAddress),
        recipientAddress: cleanAiText(data.recipientAddress),
        paymentMethod: normalizePaymentMethod(data.paymentMethod),
        paymentAmount: parseAiPaymentAmount(data.paymentAmount),
        deliveryTimeFrom: cleanAiText(data.deliveryTimeFrom),
        deliveryTimeTo: cleanAiText(data.deliveryTimeTo),
        comments: commentParts.join('\n'),
      });

      setShowAiModal(false);
      setShowCreateModal(true);
    } catch (error) {
      console.error('Failed to parse with AI:', error);
      alert(`Ошибка при разборе заявки по тексту: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setIsParsingAi(false);
    }
  };

  const renderModeButton = (mode: OperationMode, label: string, icon: React.ReactNode) => {
    const isActive = operationMode === mode;

    return (
      <button
        type="button"
        onClick={() => setOperationMode(mode)}
        className={`relative -mb-px inline-flex h-12 items-center gap-2 text-sm font-semibold transition ${
          isActive ? 'text-slate-950' : 'text-slate-500 hover:text-slate-950'
        }`}
      >
        {icon}
        {label}
        {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-slate-950" />}
      </button>
    );
  };

  return (
    <div className="w-full space-y-5">
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-7">
          {renderModeButton('requests', 'Заявки', <Activity className="h-4 w-4" />)}
          {renderModeButton('mails', 'Письма', <Mail className="h-4 w-4" />)}
          {renderModeButton('hemotest', 'Гемотест', <MapPin className="h-4 w-4" />)}
          {renderModeButton('sberbank', 'Сбербанк', <Landmark className="h-4 w-4" />)}
        </div>
      </div>

      {operationMode === 'requests' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
          <TasksToolbar selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} selectedDate={selectedDate} onDateChange={() => {}} searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateClick={() => {
            window.dispatchEvent(new Event('mig-close-floating-ui'));
            window.dispatchEvent(new Event('mig-close-archive-calendar'));
            openCreateRequest('simple');
          }} onAiCreateClick={() => {
            window.dispatchEvent(new Event('mig-close-floating-ui'));
            window.dispatchEvent(new Event('mig-close-archive-calendar'));
            setShowAiModal(true);
          }} hideDatePicker />
            </div>
            <button type="button" onClick={openSavedTemplates} className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">Шаблоны заявок</button>
          </div>
          {filteredRequests.length === 0 && !isLoading ? <EmptyState onCreateClick={() => {
            window.dispatchEvent(new Event('mig-close-floating-ui'));
            window.dispatchEvent(new Event('mig-close-archive-calendar'));
            openCreateRequest('simple');
          }} onAiCreateClick={() => {
            window.dispatchEvent(new Event('mig-close-floating-ui'));
            window.dispatchEvent(new Event('mig-close-archive-calendar'));
            setShowAiModal(true);
          }} /> : <TasksTable requests={filteredRequests} couriers={couriers} isLoading={isLoading} assigningRequestId={assigningRequestId} updatingRequestStatusId={updatingRequestStatusId} deletingRequestId={deletingRequestId} onAssignCourier={handleAssignCourier} onToggleComplete={handleToggleRequestCompletion} onOpenRequest={handleOpenRequest} onDeleteRequest={handleDeleteRequest} />}
        </>
      ) : operationMode === 'mails' ? (
        <MailsView archiveDate={archiveDate} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}</h2>
              <p className="mt-1 text-sm text-slate-500">Операционный список сборов: точка, адрес, курьер и факт забора.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('mig-open-pickup-list-manager', {
                  detail: { view: operationMode },
                }))}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800"
              >
                Создать список
              </button>
              <OperationCompletionProgress completed={pickedCount} total={flattenedPoints.length} />
            </div>
          </div>

          {isOperationLoading ? (
            <OperationSkeleton />
          ) : flattenedPoints.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
              <MapPin className="mb-3 h-8 w-8 text-slate-300" />
              <p className="font-medium text-slate-950">На выбранный период точек нет</p>
              <p className="mt-1 max-w-sm">На выбранную дату список сборов не создан или точки ещё не добавлены.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Точка сбора</th>
                    <th className="px-5 py-3 font-semibold">Адрес</th>
                    <th className="px-5 py-3 font-semibold">Статус</th>
                    <th className="px-5 py-3 font-semibold">Курьер</th>
                    <th className="px-5 py-3 font-semibold">Время</th>
                    <th className="px-5 py-3 text-right font-semibold">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {flattenedPoints.map((point) => {
                    const pickup = getPickupMeta(point);
                    const pickedAt = point.pickedAt || point.completedAt;
                    const pickedBy = point.pickedBy || point.courierName;
                    const pickupTime = pickedAt
                      ? formatLocalTime(pickedAt)
                      : '—';

                    return (
                      <tr
                        key={`${point.listName}-${point.id}`}
                        className={
                          pickup.isPicked
                            ? 'bg-emerald-100/80 transition-colors [&:hover_td]:bg-transparent'
                            : 'transition-colors hover:bg-slate-50/80'
                        }
                      >
                        <td className="px-5 py-4 align-middle">
                          <div className="font-semibold text-slate-950">{point.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{point.listName}</div>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          <div className="max-w-xl truncate text-slate-700" title={point.address}>
                            {point.address}
                          </div>
                          {point.phone && <div className="mt-1 text-xs text-slate-400">Тел: {point.phone}</div>}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 align-middle">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${pickup.isPicked ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'border-slate-200 bg-white text-slate-600'}`}>
                            {pickup.isPicked && <CheckCircle2 className="h-3.5 w-3.5" />}
                            {pickup.label}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 align-middle text-slate-600">
                          {pickedBy || '—'}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 align-middle text-slate-500">
                          {pickupTime}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right align-middle">
                          <button
                            type="button"
                            disabled={updatingPickupKey === `${operationMode}-${point.pointId || point.id}`}
                            onClick={() => handleTogglePickupCompletion(point)}
                            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${
                              pickup.isPicked
                                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                            title={!point.courierId ? 'Сначала назначьте курьера' : undefined}
                          >
                            {updatingPickupKey === `${operationMode}-${point.pointId || point.id}`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : pickup.isPicked
                                ? <RotateCcw className="h-3.5 w-3.5" />
                                : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {pickup.isPicked ? 'Отменить забрано' : 'Забрано'}
                          </button>

                          <button
                            type="button"
                            disabled={removingPickupKey === `${operationMode}-${point.pointId || point.id}`}
                            onClick={() => openRemovePickupPoint(point)}
                            className="ml-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
                            title="Удалить точку из текущего списка сбора"
                          >
                            {removingPickupKey === `${operationMode}-${point.pointId || point.id}`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                            Удалить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Modal isOpen={showTemplatesModal} onClose={() => { if (!templatesCreating) setShowTemplatesModal(false); }} className="max-h-[90vh] w-[min(1100px,calc(100vw-32px))] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="text-xl font-bold text-slate-900">Шаблоны заявок</h2><p className="mt-1 text-sm text-slate-500">Выберите один или несколько шаблонов для создания новых заявок.</p></div>
          <button type="button" disabled={templatesCreating} onClick={() => setShowTemplatesModal(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Закрыть</button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input aria-label="Поиск шаблонов" value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} placeholder="Поиск по компании, маршруту, шаблону" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <select aria-label="Сортировка шаблонов" value={templateSort} onChange={event => setTemplateSort(event.target.value as typeof templateSort)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
            <option value="popular">Часто используемые</option><option value="company">По компаниям</option><option value="recent">Недавно созданные</option><option value="alphabet">По алфавиту</option>
          </select>
          <select aria-label="Фильтр компании" value={templateCompany} onChange={event => setTemplateCompany(event.target.value)} className="max-w-[230px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
            <option value="all">Все компании</option>
            {clients.filter(client => savedTemplates.some(item => String(item.data.clientId) === String(client.id))).sort((a,b) => a.name.localeCompare(b.name,'ru')).map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
          </select>
        </div>
        {templatesError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{templatesError}</p>}
        {templatesLoading ? <p className="mt-6 text-sm text-slate-500">Загрузка...</p> : (
          <div className="mt-5 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {visibleTemplates.map(item => {
              const selected = selectedTemplateIds.includes(item.id);
              const client = clients.find(value => String(value.id) === String(item.data.clientId));
              return <div key={item.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
                <input type="checkbox" aria-label={`Выбрать шаблон ${item.name}`} checked={selected} disabled={templatesCreating} onChange={() => setSelectedTemplateIds(previous => selected ? previous.filter(id => id !== item.id) : [...previous, item.id])} className="h-4 w-4 shrink-0" />
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                  {client ? <OrganizationLogo kind="client" id={client.id} name={client.name} /> : <span className="text-xs text-slate-400">Без лого</span>}
                </div>
                <label className="min-w-0 flex-1 cursor-pointer" onClick={() => { if (!templatesCreating) setSelectedTemplateIds(previous => selected ? previous.filter(id => id !== item.id) : [...previous, item.id]); }}>
                  <span className="block truncate text-sm font-semibold text-slate-900">{client?.name || item.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{TEMPLATE_TYPE_NAMES[item.requestType] || item.requestType} · Использован {item.usageCount || 0} раз</span>
                  <span className="mt-1 block break-words text-xs text-slate-600">{[item.data.senderAddress, item.data.deliveryAddress || item.data.recipientAddress].filter(Boolean).join(' → ') || 'Маршрут не указан'}</span>
                </label>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <button type="button" disabled={templatesCreating} aria-label={item.pinned ? 'Открепить шаблон' : 'Закрепить шаблон'} title={item.pinned ? 'Открепить' : 'В избранное'} onClick={() => void toggleTemplatePin(item)} className={`rounded-lg px-2 py-1 text-lg ${item.pinned ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`}>{item.pinned ? '★' : '☆'}</button>
                  {templateDeleteConfirm === item.id ? <><button type="button" onClick={() => setTemplateDeleteConfirm(null)} className="text-xs text-slate-500">Отмена</button><button type="button" disabled={templatesCreating} onClick={() => void deleteSavedTemplate(item.id)} className="text-xs font-semibold text-red-700">Удалить?</button></> : <button type="button" disabled={templatesCreating} onClick={() => setTemplateDeleteConfirm(item.id)} className="text-xs text-red-700">Удалить</button>}
                </div>
              </div>;
            })}
            {!savedTemplates.length && <p className="p-5 text-sm text-slate-500">Шаблонов пока нет. Сохраните шаблон в форме создания заявки.</p>}
            {!!savedTemplates.length && !visibleTemplates.length && <p className="p-5 text-sm text-slate-500">По выбранным условиям шаблоны не найдены.</p>}
          </div>
        )}
        <div className="mt-5 flex justify-end border-t border-slate-200 pt-4"><button type="button" disabled={!selectedTemplateIds.length || templatesCreating || templatesLoading} onClick={() => void createFromSavedTemplates()} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{templatesCreating ? 'Создание...' : `Создать выбранные (${selectedTemplateIds.length})`}</button></div>
      </Modal>
      <CreateTaskModal isOpen={showCreateModal} onClose={closeCreateRequest} onSubmit={handleCreateTask} clients={clients} isLoading={isCreating} initialData={createInitialData} />
      <TaskDetailsModal
        isOpen={Boolean(selectedRequest) && !isEditingSelectedRequest}
        request={selectedRequest}
        displayNumber={selectedRequestNumber}
        onClose={() => {
          setSelectedRequest(null);
          setSelectedRequestNumber(null);
          setIsEditingSelectedRequest(false);
        }}
        onEdit={() => setIsEditingSelectedRequest(true)}
      />

      <CreateTaskModal
        isOpen={Boolean(selectedRequest) && isEditingSelectedRequest}
        onClose={() => setIsEditingSelectedRequest(false)}
        onSubmit={(data) => selectedRequest && handleUpdateRequest(selectedRequest.id, data as Partial<Request>)}
        clients={clients}
        isLoading={isUpdatingRequest}
        mode="edit"
        initialData={editInitialData}
        title={selectedRequestNumber ? `Редактировать заявку #${selectedRequestNumber}` : 'Редактировать заявку'}
        submitLabel="Сохранить изменения"
      />
      <AiTaskModal isOpen={showAiModal} onClose={() => setShowAiModal(false)} onSubmit={handleAiParse} isLoading={isParsingAi} />

      <Modal
        isOpen={Boolean(pickupToRemove)}
        onClose={closeRemovePickupPoint}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-slate-950">Удалить точку из текущего списка?</h3>
        <p className="mt-2 text-sm text-slate-600">
          Точка «{pickupToRemove?.name}» будет убрана только из списка сбора на выбранную дату. Справочник точек, архивирование и история сборов не изменятся.
        </p>

        {removePickupError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {removePickupError}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleRemovePickupPoint}
            disabled={Boolean(removingPickupKey)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-rose-600 px-5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {removingPickupKey ? 'Удаляем...' : 'Удалить'}
          </button>

          <button
            type="button"
            onClick={closeRemovePickupPoint}
            disabled={Boolean(removingPickupKey)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </Modal>
    </div>
  );
}

function OperationSkeleton() {
  return (
    <div className="space-y-2 bg-slate-50/70 p-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:grid-cols-[1.1fr_minmax(0,1.7fr)_170px] md:items-center">
          <div className="space-y-2">
            <div className="skeleton-line h-4 w-40" />
            <div className="skeleton-line h-3 w-28" />
          </div>
          <div className="space-y-2">
            <div className="skeleton-line h-4 w-full max-w-md" />
            <div className="skeleton-line h-3 w-32" />
          </div>
          <div className="flex md:justify-end">
            <div className="skeleton-line h-7 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
