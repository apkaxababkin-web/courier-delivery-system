import { useState, useEffect } from 'react';
import { Activity, CalendarDays, CheckCircle2, Landmark, MapPin, PackageCheck } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  createRequest,
  parseRequestWithAI,
  assignRequestCourier,
} from '../../lib/api';
import { useManagerRealtime } from '../../lib/useManagerRealtime';
import { TasksStats } from './components/TasksStats';
import { TasksToolbar } from './components/TasksToolbar';
import { TasksTable } from './components/TasksTable';
import { EmptyState } from './components/EmptyState';
import { CreateTaskModal } from './components/modals/CreateTaskModal';
import { AiTaskModal } from './components/modals/AiTaskModal';
import type { Request, Client, StatusFilter, TaskFormData } from './model/types';
import { getStatistics } from './model/stats';
import { getFilteredRequests } from './model/filters';

type OperationMode = 'requests' | 'hemotest' | 'sberbank';
type CourierOption = { id: number; name: string; isActive?: boolean };
type OperationPoint = {
  id: number;
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
  pickedAt?: string;
  pickedBy?: string;
  courierName?: string;
  completedAt?: string;
};
type OperationList = { id: number; name: string; meta: string; status: string; items: OperationPoint[] };
type PickupList = { id: number; name: string; status: string; date?: string; dayOfWeek?: number };
type PickupListWithItems = { list?: PickupList; items?: OperationPoint[] };

const API_BASE = '/api/trpc';
const API_URL = import.meta.env.VITE_API_URL || '';
const weekdayNames: Record<number, string> = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница' };

function getTodayDate() { return new Date().toISOString().slice(0, 10); }
function getTodayBusinessWeekday() { const day = new Date().getDay(); return day === 0 || day > 5 ? 5 : day; }

function getPickupMeta(point: OperationPoint) {
  const pickedAt = point.pickedAt || point.completedAt;
  const pickedBy = point.pickedBy || point.courierName;
  const isPicked = Boolean(pickedAt || pickedBy);
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

export default function TasksPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [operationMode, setOperationMode] = useState<OperationMode>('requests');
  const [operationLists, setOperationLists] = useState<OperationList[]>([]);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [hemotestDate, setHemotestDate] = useState(getTodayDate());
  const [sberbankDay, setSberbankDay] = useState(getTodayBusinessWeekday());
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [assigningRequestId, setAssigningRequestId] = useState<number | null>(null);
  const { snapshot: realtimeSnapshot } = useManagerRealtime();

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!realtimeSnapshot) return;
    console.log('[TasksPage] realtime requests sync', realtimeSnapshot.requests.length, realtimeSnapshot.updatedAt);
    setRequests(realtimeSnapshot.requests);
  }, [realtimeSnapshot]);
  useEffect(() => {
    if (operationMode === 'hemotest') loadHemotestLists();
    if (operationMode === 'sberbank') loadSberbankLists();
  }, [operationMode, hemotestDate, sberbankDay]);

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
      const lists = await trpcQuery<PickupList[]>('hemotest.listsForDate', { date: hemotestDate });
      const detailed = await Promise.all(lists.map(async (list) => {
        const full = await trpcQuery<PickupListWithItems>('hemotest.getList', { listId: list.id });
        return { id: list.id, name: list.name, meta: list.date ? new Date(list.date).toLocaleDateString('ru-RU') : hemotestDate, status: list.status, items: full.items || [] };
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
      const detailed = await Promise.all(lists.map(async (list) => {
        const full = await trpcQuery<PickupListWithItems>('sberbank.getList', { listId: list.id });
        return { id: list.id, name: list.name, meta: weekdayNames[list.dayOfWeek || sberbankDay] || `День ${list.dayOfWeek || sberbankDay}`, status: list.status, items: full.items || [] };
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
  const stats = getStatistics(requests);
  const flattenedPoints = operationLists.flatMap((list) => list.items.map((point) => ({ ...point, listName: list.name, listMeta: list.meta })));
  const pickedCount = flattenedPoints.filter((point) => getPickupMeta(point).isPicked).length;

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
      setShowCreateModal(false);
      setOperationMode('requests');
      setSelectedStatus('all');
      setSelectedDate(getTodayDate());
      await loadData();
    } catch (error) {
      console.error('Failed to create task:', error);
      alert(`Ошибка при создании заявки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      setIsCreating(false);
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
          <TasksStats stats={stats} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} />
          <TasksToolbar selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} selectedDate={selectedDate} onDateChange={setSelectedDate} searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateClick={() => setShowCreateModal(true)} onAiCreateClick={() => setShowAiModal(true)} />
          {filteredRequests.length === 0 && !isLoading ? <EmptyState onCreateClick={() => setShowCreateModal(true)} onAiCreateClick={() => setShowAiModal(true)} /> : <TasksTable requests={filteredRequests} couriers={couriers} isLoading={isLoading} assigningRequestId={assigningRequestId} onAssignCourier={handleAssignCourier} />}
        </>
      ) : (
        <div className="max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}</h2>
              <p className="mt-1 text-sm text-slate-500">Операционный список сборов: точка, адрес, курьер и факт забора.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                <PackageCheck className="h-4 w-4 text-slate-400" />
                {pickedCount}/{flattenedPoints.length} забрано
              </span>
              {operationMode === 'hemotest' ? (
                <label className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input type="date" value={hemotestDate} onChange={(e) => setHemotestDate(e.target.value)} className="bg-transparent outline-none" />
                </label>
              ) : (
                <select value={sberbankDay} onChange={(e) => setSberbankDay(Number(e.target.value))} className="h-10 w-fit rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none">
                  {Object.entries(weekdayNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              )}
            </div>
          </div>

          {isOperationLoading ? (
            <OperationSkeleton />
          ) : flattenedPoints.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
              <MapPin className="mb-3 h-8 w-8 text-slate-300" />
              <p className="font-medium text-slate-950">На выбранный период точек нет</p>
              <p className="mt-1 max-w-sm">Измените дату/день недели или проверьте, что список сборов создан в разделе направления.</p>
            </div>
          ) : (
            <div className="space-y-2 bg-slate-50/70 p-3">
              {flattenedPoints.map((point) => {
                const pickup = getPickupMeta(point);
                return (
                  <div key={`${point.listName}-${point.id}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md md:grid-cols-[1.1fr_minmax(0,1.7fr)_170px] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-950">{point.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{point.listName} · {point.listMeta}</p>
                      {point.contactPerson && <p className="mt-0.5 truncate text-xs text-slate-500">{point.contactPerson}</p>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{point.address}</p>
                      {point.phone && <p className="mt-0.5 text-xs text-slate-400">{point.phone}</p>}
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {pickup.isPicked && <CheckCircle2 className="h-4 w-4 text-slate-500" />}
                      <div className="text-left md:text-right">
                        <p className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${pickup.isPicked ? 'border-slate-300 bg-white text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{pickup.label}</p>
                        {pickup.detail && <p className="mt-1 text-xs text-slate-400">{pickup.detail}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CreateTaskModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateTask} clients={clients} isLoading={isCreating} />
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
