import { useState, useEffect } from 'react';
import { getAllClients, getAllRequests, createRequest, parseRequestWithAI } from '../../lib/api';
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
  const [requests, setRequests] = useState<Request[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

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
    } finally {
      setIsLoading(false);
    }
  };

  // Get filtered requests
  const filteredRequests = getFilteredRequests(
    requests,
    selectedStatus,
    dateFrom,
    dateTo,
    searchQuery
  );

  // Get statistics
  const stats = getStatistics(requests);

  // Handle create task
  const handleCreateTask = async (data: TaskFormData) => {
    try {
      setIsCreating(true);
      // Cast TaskFormData to Request, filling in required fields with defaults
      const requestData = {
        requestType: data.requestType || 'delivery',
        recipientName: data.recipientName || '',
        recipientPhone: data.recipientPhone || '',
        ...data,
      };
      await createRequest(requestData as any);
      setShowCreateModal(false);
      await loadData();
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle AI parse
  const handleAiParse = async (text: string) => {
    try {
      setIsParsingAi(true);
      const result = await parseRequestWithAI(text);
      // Fill form with parsed data
      console.log('Parsed:', result);
      setShowAiModal(false);
      // TODO: Open create modal with pre-filled data
    } catch (error) {
      console.error('Failed to parse with AI:', error);
    } finally {
      setIsParsingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <TasksStats stats={stats} />

      {/* Toolbar with Filters */}
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

      {/* Tasks Table or Empty State */}
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

      {/* Modals */}
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
