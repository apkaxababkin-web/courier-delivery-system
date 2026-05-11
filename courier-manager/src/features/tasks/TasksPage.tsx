import { useState, useEffect } from 'react';
import { getAllClients, createRequest, parseRequestWithAI } from '../../lib/api';
import { useManagerRealtime } from '../../lib/useManagerRealtime';
import { RealtimeStatusCard } from '../../components/RealtimeStatusCard';
import { TasksStats } from './components/TasksStats';
import { TasksToolbar } from './components/TasksToolbar';
import { TasksTable } from './components/TasksTable';
import { EmptyState } from './components/EmptyState';
import { CreateTaskModal } from './components/modals/CreateTaskModal';
import { AiTaskModal } from './components/modals/AiTaskModal';
import type { Request, Client, StatusFilter, TaskFormData } from './model/types';
import { getStatistics } from './model/stats';
import { getFilteredRequests } from './model/filters';

const today = new Date().toISOString().split('T')[0];

export default function TasksPage() {
  const realtime = useManagerRealtime(5000);
  const requests = (realtime.snapshot?.requests ?? []) as unknown as Request[];

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [selectedDate, setSelectedDate] = useState(today);
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
      .catch((error) => console.error('Failed to load clients:', error));

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRequests = getFilteredRequests(requests, selectedStatus, selectedDate, searchQuery);
  const stats = getStatistics(filteredRequests);

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      setIsCreating(true);

      await createRequest({
        requestType: data.requestType || 'delivery',
        recipientName: data.recipientName || '',
        recipientPhone: data.recipientPhone || '',
        ...data,
      } as never);

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
      <RealtimeStatusCard
        isRefreshing={realtime.isRefreshing}
        error={realtime.error}
        lastSyncAt={realtime.lastSyncAt}
        onRefresh={() => realtime.refresh(true)}
      />

      <TasksStats stats={stats} />

      <TasksToolbar
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
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
        <TasksTable requests={filteredRequests} isLoading={realtime.isLoading} />
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
