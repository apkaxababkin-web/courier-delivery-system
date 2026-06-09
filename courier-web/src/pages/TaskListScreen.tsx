/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface Task {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  courierName?: string;
  senderName?: string;
}

type Screen = 'tasks' | 'task-detail' | 'pickup-gemotest' | 'pickup-sberbank' | 'mails' | 'profile';

interface TaskListScreenProps {
  onTaskSelect: (taskId: number) => void;
  onNavigate: (screen: Screen) => void;
}

const STATUS_COLORS: Record<string, string> = {
  assigned: '#3b82f6',
  in_progress: '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Новая',
  in_progress: 'В работе',
  completed: 'Выполнено',
  cancelled: 'Отменено',
};

export function TaskListScreen({ onTaskSelect, onNavigate: _onNavigate }: TaskListScreenProps) {
  void _onNavigate;
  const { token, courier } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');

  const loadTasks = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/tasks.all?input=${encodeURIComponent(JSON.stringify({ token, date: selectedDate }))}`,
        { withCredentials: true }
      );
      
      let taskList = response.data?.result?.data?.json || response.data?.result || [];
      if (!Array.isArray(taskList)) taskList = [];

      if (filterMode === 'mine' && courier?.name) {
        taskList = taskList.filter((t: Task) => t.courierName === courier.name);
      }

      setTasks(taskList);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [courier, filterMode, selectedDate, token]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!token) return;

    const eventSource = new EventSource('/api/live');
    const refresh = () => {
      loadTasks();
    };

    eventSource.addEventListener('tasks_changed', refresh);
    eventSource.addEventListener('requests_changed', refresh);
    eventSource.addEventListener('data_changed', refresh);

    return () => eventSource.close();
  }, [loadTasks, token]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Завтра';
    }

    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return days[date.getDay()];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
            {getDateLabel(selectedDate)}
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--foreground)' }}>
            {formatDate(selectedDate)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilterMode(filterMode === 'all' ? 'mine' : 'all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: filterMode === 'mine' ? 'var(--primary)' : 'var(--border)',
              color: filterMode === 'mine' ? 'white' : 'var(--foreground)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {filterMode === 'all' ? 'Все' : 'Мои'}
          </button>
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() - 1);
              setSelectedDate(newDate.toISOString().split('T')[0]);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            ←
          </button>
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() + 1);
              setSelectedDate(newDate.toISOString().split('T')[0]);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            →
          </button>
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
            Загрузка...
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
            <div>Нет заявок на эту дату</div>
          </div>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onTaskSelect(task.id)}
            style={{
              marginBottom: '12px',
              padding: '12px',
              backgroundColor: 'var(--surface)',
              borderLeft: `4px solid ${STATUS_COLORS[task.status] || '#ccc'}`,
              borderRadius: '8px',
              border: `1px solid var(--border)`,
              borderLeftWidth: '4px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
            }}
          >
            {/* Sender name + Task ID */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)' }}>
                {task.senderName || 'Отправитель'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                #{task.id}
              </div>
            </div>

            {/* Recipient name */}
            <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--foreground)', marginBottom: '6px' }}>
              {task.recipientName}
            </div>

            {/* Delivery address */}
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
              {task.deliveryAddress}
            </div>

            {/* Time + Status + Courier */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
              <div style={{ color: 'var(--muted)' }}>
                {task.deliveryTimeFrom} – {task.deliveryTimeTo}
              </div>
              <div style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
              }}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: STATUS_COLORS[task.status] + '20',
                  color: STATUS_COLORS[task.status],
                  fontSize: '11px',
                  fontWeight: '600',
                }}>
                  {STATUS_LABELS[task.status]}
                </span>
                {task.courierName && (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--primary)' + '20',
                    color: 'var(--primary)',
                    fontSize: '11px',
                  }}>
                    {task.courierName}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
