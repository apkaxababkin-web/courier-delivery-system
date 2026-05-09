import { useState, useEffect } from 'react';
import { getAllClients, createRequest, parseRequestWithAI } from '../../lib/api';
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

export default function TasksPage() {
  const realtime = useManagerRealtime(5000);
  const requests = (realtime.snapshot?.requests ?? []) as unknown as Request[];
  const [clients, setClients] = useState<Client[]>([]);

  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllClients()
      .then((clientsData) => {
        if (!cancelled) setClients(clientsData);
      })
      .catch((error) => {
        console.error('Failed to load clients:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      await realtime.refresh(false);
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
          Realtime: {realtime.error ? 'ошибка синхронизации' : 'активен'}
          {realtime.lastSyncAt ? ` · обновлено ${new Date(realtime.lastSyncAt).toLocaleTimeString('ru-RU')}` : ''}
          {realtime.isRefreshing && !realtime.isLoading ? ' · обновление...' : ''}
        </span>
        <button
          type="button"
          onClick={() => realtime.refresh(true)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Обновить
        </button>
      </div>

      {realtime.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {realtime.error}
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

      {filteredRequests.length === 0 && !realtime.isLoading ? (
        <EmptyState
          onCreateClick={() => setShowCreateModal(true)}
          onAiCreateClick={() => setShowAiModal(true)}
        />
      ) : (
        <TasksTable
          requests={filteredRequests}
          isLoading={realtime.isLoading}
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
