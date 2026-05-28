import { useState, useEffect } from 'react';
import { Activity, CheckCircle2, Landmark, MapPin, Plus, Sparkles } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  createRequest,
  parseRequestWithAI,
  assignRequestCourier,
  post,
} from '../../lib/api';
import { useManagerRealtime } from '../../lib/useManagerRealtime';
import { TasksToolbar } from './components/TasksToolbar';
import { TasksTable } from './components/TasksTable';
import { EmptyState } from './components/EmptyState';
import { CreateTaskModal } from './components/modals/CreateTaskModal';
import { AiTaskModal } from './components/modals/AiTaskModal';
import type { Request, Client, StatusFilter, TaskFormData } from './model/types';
import { getFilteredRequests } from './model/filters';

type OperationMode = 'requests' | 'hemotest' | 'sberbank';
const normalizePackageType = (value: unknown): TaskFormData['packageType'] => {
  if (value === 'document' || value === 'small' || value === 'medium' || value === 'large' || value === 'fragile') {
    return value;
  }
  return 'small';
};

type CourierOption = { id: number; name: string; isActive?: boolean };
type OperationPoint = {
  id: number;
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

const REQUEST_CREATE_OPTIONS: Array<{
  type: NonNullable<TaskFormData['requestType']>;
  title: string;
  description: string;
  icon: string;
}> = [
  { type: 'delivery', title: 'Доставка', description: 'Обычная доставка от отправителя к получателю', icon: '↗' },
  { type: 'movement', title: 'Перемещение', description: 'Перевезти между двумя точками или клиентами', icon: '⇄' },
  { type: 'nuts', title: 'Орехи', description: 'Заявка по коробкам, весу и тарифам', icon: '◈' },
  { type: 'courier_call', title: 'Вызов курьера', description: 'Курьер нужен по адресу клиента', icon: '⌁' },
  { type: 'pickup_from_tc', title: 'Транспортная компания', description: 'Получение или отправка груза через ТК', icon: '▣' },
  { type: 'simple', title: 'Простая заявка', description: 'Минимальная форма без лишних полей', icon: '+' },
];

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
  return new Date(value).toISOString().slice(0, 10) === dateKey;
}

function formatArchiveDateLabel(dateKey: string) {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;

  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getTodayDate() { return new Date().toISOString().slice(0, 10); }
function getTodayBusinessWeekday() { const day = new Date().getDay(); return day === 0 || day > 5 ? 5 : day; }

function getPickupMeta(point: OperationPoint) {
  const pickedAt = point.pickedAt || point.completedAt;
  const pickedBy = point.pickedBy || point.courierName;
  const isPicked = Boolean(point.isPicked || pickedAt || pickedBy);
  if (!isPicked) return { isPicked, label: 'Не забран', detail: '' };
  const time = pickedAt ? new Date(pickedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'время не указано';
  return { isPicked, label: 'Забран', detail: `${pickedBy || 'Курьер'} • ${time}` };
}

async function trpcQuery<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const wrappedInput = encodeURIComponent(JSON.stringify({ json: input }));
  const response = await fetch(`${API_BASE}/${path}?input=${wrappedInput}`);
  if (!response.ok) throw new Error(await response.text() || `Failed to fetch ${path}`);
  const data = await response.json();
  return data.result?.data?.json || data.result?.data || [];
}

async function fetchCouriers(): Promise<CourierOption[]> {
  const response = await fetch(`${API_URL}/api/manager/couriers`, {
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
  const [hemotestDate, setHemotestDate] = useState(getTodayDate());
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const selectedDate = archiveDate || getTodayDate();
  const sberbankDay = getBusinessWeekdayFromDate(selectedDate);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showCreateActionMenu, setShowCreateActionMenu] = useState(false);
  const [createInitialData, setCreateInitialData] = useState<Partial<TaskFormData> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [isUpdatingRequest, setIsUpdatingRequest] = useState(false);
  const [assigningRequestId, setAssigningRequestId] = useState<number | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedRequestNumber, setSelectedRequestNumber] = useState<number | null>(null);
  const { snapshot: realtimeSnapshot } = useManagerRealtime();

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!realtimeSnapshot) return;

    console.log('[TasksPage] realtime sync', realtimeSnapshot.updatedAt);
    setRequests(realtimeSnapshot.requests);

    if (operationMode === 'hemotest') {
      loadHemotestLists(true);
    }

    if (operationMode === 'sberbank') {
      loadSberbankLists(true);
    }
  }, [realtimeSnapshot, operationMode, hemotestDate, sberbankDay]);
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
        return { id: list.id, name: list.name, meta: list.date ? new Date(list.date).toLocaleDateString('ru-RU') : formatArchiveDateLabel(selectedDate), status: list.status, items: full.items || [] };
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
      const lists = await trpcQuery<PickupList[]>('sberbank.listsForDay', { dayOfWeek: sberbankDay });
      const listsForSelectedDate = lists.filter((list) => {
        // Сбербанк-шаблон выбирается по дню недели, а архив показывает только списки,
        // которые были созданы в выбранную дату верхнего календаря.
        if (isSameDateKey(list.createdAt, selectedDate)) return true;

        // Запасной вариант для старых записей: если дата хранится в поле date.
        if (isSameDateKey(list.date, selectedDate)) return true;

        return false;
      });

      const detailed = await Promise.all(listsForSelectedDate.map(async (list) => {
        const full = await trpcQuery<PickupListWithItems>('sberbank.getList', { listId: list.id });
        return { id: list.id, name: list.name, meta: formatArchiveDateLabel(selectedDate), status: list.status, items: full.items || [] };
      }));
      setOperationLists(detailed);
    } catch (error) {
      console.error('Failed to load sberbank lists:', error);
      setOperationLists([]);
    } finally {
      if (showLoader) setIsOperationLoading(false);
    }
  };

  const filteredRequests = getFilteredRequests(requests, selectedStatus, selectedDate, searchQuery);
  const flattenedPoints = operationLists.flatMap((list) => list.items.map((point) => ({ ...point, listName: list.name, listMeta: list.meta })));
  const pickedCount = flattenedPoints.filter((point) => getPickupMeta(point).isPicked).length;


  const openCreateRequest = (requestType: NonNullable<TaskFormData['requestType']>) => {
    setCreateInitialData({ requestType });
    setShowCreateActionMenu(false);
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

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      setIsCreating(true);
      const requestData = {
        requestType: data.requestType || 'delivery',
        recipientName: data.recipientName || data.senderName || 'Без получателя',
        recipientPhone: data.recipientPhone || data.senderPhone || '',
        deliveryAddress: data.deliveryAddress || data.recipientAddress || data.senderAddress || '',
        ...data,
      };
      await createRequest(requestData as any);
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
    tcName: request.tcName || '',
    tcAddress: request.tcAddress || '',
    trackingNumber: request.trackingNumber || '',
    description: request.description || '',
    estimatedMinutes: request.estimatedMinutes,
  });

  const handleOpenRequest = (request: Request, displayNumber: number) => {
    setSelectedRequest(request);
    setSelectedRequestNumber(displayNumber);
  };

  const handleUpdateRequest = async (requestId: number, data: Partial<Request>) => {
    try {
      setIsUpdatingRequest(true);
      await post('/api/trpc/requests.update', { id: requestId, ...data });
      setSelectedRequest(null);
      setSelectedRequestNumber(null);
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
      }
      await loadData(false);
    } catch (error) {
      console.error('Failed to delete request:', error);
      alert(`Ошибка при удалении заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handleAiParse = async (text: string) => {
    try {
      setIsParsingAi(true);
      const result = await parseRequestWithAI(text);
      console.log('Parsed:', result);
      setShowAiModal(false);
    } catch (error) {
      console.error('Failed to parse with AI:', error);
      alert('Ошибка при разборе заявки по тексту');
    } finally {
      setIsParsingAi(false);
    }
  };

  const renderModeButton = (mode: OperationMode, label: string, icon: React.ReactNode) => {
    const isActive = operationMode === mode;
    return (
      <button type="button" onClick={() => setOperationMode(mode)} className={`inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-medium shadow-sm transition ${isActive ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
        {icon}{label}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {renderModeButton('requests', 'Созданные заявки', <Activity className="h-4 w-4" />)}
          {renderModeButton('hemotest', 'Гемотест', <MapPin className="h-4 w-4" />)}
          {renderModeButton('sberbank', 'Сбербанк', <Landmark className="h-4 w-4" />)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">Режим: {operationMode === 'requests' ? 'Заявки' : operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}</span>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">Видимость назначений</span>
        </div>
      </div>

      {operationMode === 'requests' ? (
        <>
          <TasksToolbar selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} selectedDate={selectedDate} onDateChange={() => {}} searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateClick={() => setShowCreateActionMenu(true)} onAiCreateClick={() => setShowAiModal(true)} hideDatePicker />
          {filteredRequests.length === 0 && !isLoading ? <EmptyState onCreateClick={() => setShowCreateActionMenu(true)} onAiCreateClick={() => setShowAiModal(true)} /> : <TasksTable requests={filteredRequests} couriers={couriers} isLoading={isLoading} assigningRequestId={assigningRequestId} deletingRequestId={deletingRequestId} onAssignCourier={handleAssignCourier} onOpenRequest={handleOpenRequest} onDeleteRequest={handleDeleteRequest} />}
        </>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}</h2>
              <p className="mt-1 text-sm text-slate-500">Операционный список сборов: точка, адрес, курьер и факт забора.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {flattenedPoints.map((point) => {
                    const pickup = getPickupMeta(point);
                    const pickedAt = point.pickedAt || point.completedAt;
                    const pickedBy = point.pickedBy || point.courierName;
                    const pickupTime = pickedAt
                      ? new Date(pickedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      : '—';

                    return (
                      <tr key={`${point.listName}-${point.id}`} className="transition-colors hover:bg-slate-50/80">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}


      {operationMode === 'requests' && (
        <>
          {showCreateActionMenu && (
            <button
              type="button"
              aria-label="Закрыть меню создания"
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setShowCreateActionMenu(false)}
            />
          )}

          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
            {showCreateActionMenu && (
              <div className="w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-[28px] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/20">
                <div className="px-3 pb-2 pt-2">
                  <p className="text-sm font-semibold text-slate-950">Создать заявку</p>
                  <p className="mt-0.5 text-xs text-slate-500">Выбери тип — форма откроется сразу нужная.</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {REQUEST_CREATE_OPTIONS.map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => openCreateRequest(option.type)}
                      className="group flex min-h-[92px] items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-sm">
                        {option.icon}
                      </span>

                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">{option.title}</span>
                        <span className="mt-1 block text-xs leading-4 text-slate-500">{option.description}</span>
                      </span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateActionMenu(false);
                      setShowAiModal(true);
                    }}
                    className="group flex min-h-[92px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm sm:col-span-2"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                      <Sparkles className="h-4 w-4" />
                    </span>

                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-950">Создать по тексту</span>
                      <span className="mt-1 block text-xs leading-4 text-slate-500">Вставить текст заявки и разобрать автоматически.</span>
                    </span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCreateActionMenu((value) => !value)}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
              title="Создать заявку"
              aria-label="Создать заявку"
            >
              <Plus className={`h-6 w-6 transition ${showCreateActionMenu ? 'rotate-45' : ''}`} />
            </button>
          </div>
        </>
      )}


      <CreateTaskModal isOpen={showCreateModal} onClose={closeCreateRequest} onSubmit={handleCreateTask} clients={clients} isLoading={isCreating} initialData={createInitialData} />
      <CreateTaskModal
        isOpen={Boolean(selectedRequest)}
        onClose={() => { setSelectedRequest(null); setSelectedRequestNumber(null); }}
        onSubmit={(data) => selectedRequest && handleUpdateRequest(selectedRequest.id, data as Partial<Request>)}
        clients={clients}
        isLoading={isUpdatingRequest}
        mode="edit"
        initialData={selectedRequest ? requestToFormData(selectedRequest) : null}
        title={selectedRequestNumber ? `Редактировать заявку #${selectedRequestNumber}` : 'Редактировать заявку'}
        submitLabel="Сохранить изменения"
      />
      <AiTaskModal isOpen={showAiModal} onClose={() => setShowAiModal(false)} onSubmit={handleAiParse} isLoading={isParsingAi} />
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
