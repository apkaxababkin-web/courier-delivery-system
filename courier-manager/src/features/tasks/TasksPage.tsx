import { useState, useEffect } from 'react';
import { Activity, CalendarDays, Landmark, MapPin } from 'lucide-react';
import {
  getAllClients,
  getAllRequests,
  createRequest,
  parseRequestWithAI,
  getHemotestListsForDate,
  getHemotestList,
  getSberbankListsForDay,
  getSberbankList,
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
type OperationList = {
  id: number;
  name: string;
  meta: string;
  status: string;
  items: Array<{ id: number; name: string; address: string; phone?: string; contactPerson?: string }>;
};

const weekdayNames: Record<number, string> = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getTodayBusinessWeekday() {
  const day = new Date().getDay();
  if (day === 0) return 5;
  if (day > 5) return 5;
  return day;
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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (operationMode === 'hemotest') loadHemotestLists();
    if (operationMode === 'sberbank') loadSberbankLists();
  }, [operationMode, hemotestDate, sberbankDay]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [requestsData, clientsData] = await Promise.all([
        getAllRequests(),
        getAllClients(),
      ]);
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
      const lists = await getHemotestListsForDate(hemotestDate);
      const detailed = await Promise.all(
        lists.map(async (list) => {
          const full = await getHemotestList(list.id);
          return {
            id: list.id,
            name: list.name,
            meta: new Date(list.date).toLocaleDateString('ru-RU'),
            status: list.status,
            items: full?.items || [],
          };
        })
      );
      setOperationLists(detailed);
    } catch (error) {
      console.error('Failed to load hemotest lists:', error);
      alert('Ошибка при загрузке списков Гемотест');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const loadSberbankLists = async () => {
    try {
      setIsOperationLoading(true);
      const lists = await getSberbankListsForDay(sberbankDay);
      const detailed = await Promise.all(
        lists.map(async (list) => {
          const full = await getSberbankList(list.id);
          return {
            id: list.id,
            name: list.name,
            meta: weekdayNames[list.dayOfWeek] || `День ${list.dayOfWeek}`,
            status: list.status,
            items: full?.items || [],
          };
        })
      );
      setOperationLists(detailed);
    } catch (error) {
      console.error('Failed to load sberbank lists:', error);
      alert('Ошибка при загрузке списков Сбербанк');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredRequests = getFilteredRequests(requests, selectedStatus, dateFrom, dateTo, searchQuery);
  const stats = getStatistics(requests);

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
      <button
        type="button"
        onClick={() => setOperationMode(mode)}
        className={`inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-medium shadow-sm transition ${
          isActive
            ? 'bg-slate-950 text-white'
            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
        }`}
      >
        {icon}
        {label}
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

          <TasksToolbar
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCreateClick={() => setShowCreateModal(true)}
            onAiCreateClick={() => setShowAiModal(true)}
          />

          {filteredRequests.length === 0 && !isLoading ? (
            <EmptyState onCreateClick={() => setShowCreateModal(true)} onAiCreateClick={() => setShowAiModal(true)} />
          ) : (
            <TasksTable requests={filteredRequests} isLoading={isLoading} />
          )}
        </>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                {operationMode === 'hemotest' ? 'Списки Гемотест' : 'Списки Сбербанк'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Здесь отображаются списки, созданные во вкладках {operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}.
              </p>
            </div>

            {operationMode === 'hemotest' ? (
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input type="date" value={hemotestDate} onChange={(e) => setHemotestDate(e.target.value)} className="bg-transparent outline-none" />
              </label>
            ) : (
              <select
                value={sberbankDay}
                onChange={(e) => setSberbankDay(Number(e.target.value))}
                className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
              >
                {Object.entries(weekdayNames).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            )}
          </div>

          {isOperationLoading ? (
            <div className="flex min-h-56 items-center justify-center p-8 text-sm text-slate-500">Загрузка списков...</div>
          ) : operationLists.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
              <MapPin className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-950">Списков пока нет</p>
              <p className="mt-1 text-sm text-slate-500">Создайте список во вкладке {operationMode === 'hemotest' ? 'Гемотест' : 'Сбербанк'}, и он появится здесь.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {operationLists.map((list) => (
                <div key={list.id} className="p-5">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{list.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{list.meta} • {list.items.length} точек • {list.status}</p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Активный список
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.items.map((point) => (
                      <div key={point.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-950">{point.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{point.address}</p>
                        {(point.contactPerson || point.phone) && (
                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            {point.contactPerson && <p>Контакт: {point.contactPerson}</p>}
                            {point.phone && <p>Телефон: {point.phone}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateTaskModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreateTask} clients={clients} isLoading={isCreating} />
      <AiTaskModal isOpen={showAiModal} onClose={() => setShowAiModal(false)} onSubmit={handleAiParse} isLoading={isParsingAi} />
    </div>
  );
}
