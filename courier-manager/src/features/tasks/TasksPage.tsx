import { useState, useEffect, useRef } from 'react';
import { getAllClients, getRealtimeSnapshot, createRequest, parseRequestWithAI } from '../../lib/api';
import { TasksStats } from './components/TasksStats';
import { TasksToolbar } from './components/TasksToolbar';
import { TasksTable } from './components/TasksTable';
import { EmptyState } from './components/EmptyState';
import { CreateTaskModal } from './components/modals/CreateTaskModal';
import { AiTaskModal } from './components/modals/AiTaskModal';
import type { Request, Client, StatusFilter, TaskFormData } from './model/types';
import { getStatistics } from './model/stats';
import { getFilteredRequests } from './model/filters';

const REALTIME_INTERVAL_MS = 5000;

export default function TasksPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    const timer = window.setInterval(() => {
      loadRealtime(false);
    }, REALTIME_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, []);

  const loadRealtime = async (showSpinner = true) => {
    try {
      if (showSpinner) setIsLoading(true);
      const snapshot = await getRealtimeSnapshot();
      if (!mountedRef.current) return;
      setRequests(snapshot.requests as unknown as Request[]);
      setLastSyncAt(snapshot.updatedAt);
      setSyncError(null);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : 'Ошибка realtime sync';
      console.error('Failed to load realtime snapshot:', error);
      setSyncError(message);
    } finally {
      if (mountedRef.current && showSpinner) setIsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [snapshot, clientsData] = await Promise.all([
        getRealtimeSnapshot(),
        getAllClients(),
      ]);
      if (!mountedRef.current) return;
      setRequests(snapshot.requests as unknown as Request[]);
      setClients(clientsData);
      setLastSyncAt(snapshot.updatedAt);
      setSyncError(null);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : 'Ошибка загрузки данных';
      console.error('Failed to load data:', error);
      setSyncError(message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const filteredRequests = getFilteredRequests(
    requests,
    selectedStatus,
    dateFrom,
    dateTo,
    searchQuery
  );

  const stats = getStatistics(requests);

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      setIsCreating(true);
      const requestData = {
        requestType: data.requestType || 'delivery',
        recipientName: data.recipientName || '',
        recipientPhone: data.recipientPhone || '',
        ...data,
      };
      await createRequest(requestData as any);
      setShowCreateModal(false);
      await loadRealtime(false);
    } catch (error) {
      console.error('Failed to create task:', error);
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
    } finally {
      setIsParsingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span>
          Realtime: {syncError ? 'ошибка синхронизации' : 'активен'}
          {lastSyncAt ? ` · обновлено ${new Date(lastSyncAt).toLocaleTimeString('ru-RU')}` : ''}
        </span>
        <button
          type="button"
          onClick={() => loadRealtime(true)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Обновить
        </button>
      </div>

      {syncError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {syncError}
        </div>
      ) : null}

      <TasksStats stats={stats} />

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
        <EmptyState
          onCreateClick={() => setShowCreateModal(true)}
          onAiCreateClick={() => setShowAiModal(true)}
        />
      ) : (
        <TasksTable
          requests={filteredRequests}
          isLoading={isLoading}
        />
      )}

      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTask}
        clients={clients}
        isLoading={isCreating}
      />

      <AiTaskModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        onSubmit={handleAiParse}
        isLoading={isParsingAi}
      />
    </div>
  );
}
