import { useState, useEffect } from 'react';
import { Activity, CalendarDays, CheckCircle2, Landmark, MapPin } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  createRequest,
  parseRequestWithAI,
} from '../../lib/api';
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

export default function TasksPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [operationMode, setOperationMode] = useState<OperationMode>('requests');
  const [operationLists, setOperationLists] = useState<OperationList[]>([]);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [hemotestDate, setHemotestDate] = useState(getTodayDate());
  const [sberbankDay, setSberbankDay] = useState(getTodayBusinessWeekday());
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (operationMode === 'hemotest') loadHemotestLists();
    if (operationMode === 'sberbank') loadSberbankLists();
  }, [operationMode, hemotestDate, sberbankDay]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [requestsData, clientsData] = await Promise.all([getAllRequests(), getAllClients()]);
      setRequests(requestsData);
      setClients(clientsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Ошибка при загрузке заявок');
    } finally {
      setIsLoading(false);
    }
  };

  const loadHemotestLists = async () => {
    try {
      setIsOperationLoading(true);
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
      setIsOperationLoading(false);
    }
  };

  const loadSberbankLists = async () => {
    try {
      setIsOperationLoading(true);
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
      setIsOperationLoading(false);
    }
  };

  const filteredRequests = getFilteredRequests(requests, selectedStatus, dateFrom, dateTo, searchQuery);
  const stats = getStatistics(requests);
  const flattenedPoints = operationLists.flatMap((list) => list.items.map((point) => ({ ...point, listName: list.name })));

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
      setDateFrom('');
      setDateTo('');
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
      <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
        {renderModeButton('requests', 'Созданные заявки', <Activity className="h-4 w-4" />)}
        {renderModeButton('hemotest', 'Гемотест', <MapPin className="h-4 w-4" />)}
        {renderModeButton('sberbank', 'Сбербанк', <Landmark className="h-4 w-4" />)}
      </div>

      {operationMode === 'requests' ? (
        <>
          <TasksStats stats={stats} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} />
          <TasksToolbar selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo} searchQuery={searchQuery} onSearchChange={setSearchQuery} onCreateClick={() => setShowCreateModal(true)} onAiCreateClick={() => setShowAiModal(true)} />
          {filteredRequests.length === 0 && !isLoading ? <EmptyState onCreateClick={() => setShowCreateModal(true)} onAiCreateClick={() => setShowAiModal(true)} /> : <TasksTable requests={filteredRequests} isLoading={isLoading} />}
        </>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}</h2>
              <p className="mt-1 text-sm text-slate-500">Список сборов</p>
            </div>
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

          {isOperationLoading ? (
            <div className="flex min-h-40 items-center justify-center p-8 text-sm text-slate-500">Загрузка...</div>
          ) : flattenedPoints.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center p-8 text-center text-sm text-slate-500">На выбранную дату список пуст.</div>
          ) : (
            <div className="space-y-2 bg-slate-50/70 p-3">
              {flattenedPoints.map((point) => {
                const pickup = getPickupMeta(point);
                return (
                  <div key={`${point.listName}-${point.id}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 md:grid-cols-[1.2fr_minmax(0,2fr)_170px] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-950">{point.name}</p>
                      {point.contactPerson && <p className="mt-0.5 truncate text-xs text-slate-400">{point.contactPerson}</p>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{point.address}</p>
                      {point.phone && <p className="mt-0.5 text-xs text-slate-400">{point.phone}</p>}
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {pickup.isPicked && <CheckCircle2 className="h-4 w-4 text-slate-500" />}
                      <div className="text-left md:text-right">
                        <p className={`text-sm font-semibold ${pickup.isPicked ? 'text-slate-800' : 'text-slate-500'}`}>{pickup.label}</p>
                        {pickup.detail && <p className="mt-0.5 text-xs text-slate-400">{pickup.detail}</p>}
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
