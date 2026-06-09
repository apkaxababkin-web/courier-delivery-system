/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface TaskDetail {
  id: number;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  comments?: string;
  courierName?: string;
  placesCount?: number;
}

interface TaskDetailScreenProps {
  taskId: number;
  onBack: () => void;
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

export function TaskDetailScreen({ taskId, onBack }: TaskDetailScreenProps) {
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadTask = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/tasks.byId?input=${encodeURIComponent(JSON.stringify({ id: taskId, token }))}`,
        { withCredentials: true }
      );
      
      const taskData = response.data?.result?.data?.json || response.data?.result;
      setTask(taskData);
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  useEffect(() => {
    const eventSource = new EventSource('/api/live');
    const refresh = () => {
      loadTask();
    };

    eventSource.addEventListener('tasks_changed', refresh);
    eventSource.addEventListener('requests_changed', refresh);
    eventSource.addEventListener('data_changed', refresh);

    return () => eventSource.close();
  }, [loadTask]);

  const updateStatus = async (newStatus: string) => {
    if (!token) return;
    try {
      setUpdating(true);
      await axios.post(
        '/api/trpc/tasks.setStatus',
        { json: { taskId, status: newStatus, token } },
        { withCredentials: true }
      );
      await loadTask();
    } catch (error) {
      console.error('Failed to update task:', error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
        Загрузка...
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--error)' }}>
        Заявка не найдена
      </div>
    );
  }

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
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: 'var(--foreground)',
          }}
        >
          ←
        </button>
        <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
          Заявка #{task.id}
        </div>
        <div style={{
          padding: '4px 12px',
          borderRadius: '12px',
          backgroundColor: STATUS_COLORS[task.status] + '20',
          color: STATUS_COLORS[task.status],
          fontSize: '12px',
          fontWeight: '600',
        }}>
          {STATUS_LABELS[task.status]}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* Sender */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ОТПРАВИТЕЛЬ
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)', marginBottom: '4px' }}>
            {task.senderName || 'Не указано'}
          </div>
          {task.senderAddress && (
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
              {task.senderAddress}
            </div>
          )}
          {task.senderPhone && (
            <a
              href={`tel:${task.senderPhone}`}
              style={{
                fontSize: '13px',
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              {task.senderPhone}
            </a>
          )}
        </div>

        {/* Recipient */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ПОЛУЧАТЕЛЬ
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)', marginBottom: '4px' }}>
            {task.recipientName}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
            {task.deliveryAddress}
          </div>
          {task.recipientPhone && (
            <a
              href={`tel:${task.recipientPhone}`}
              style={{
                fontSize: '13px',
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              {task.recipientPhone}
            </a>
          )}
        </div>

        {/* Delivery time */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ВРЕМЯ ДОСТАВКИ
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)' }}>
            {task.deliveryTimeFrom} – {task.deliveryTimeTo}
          </div>
        </div>

        {/* Courier */}
        {task.courierName && (
          <div style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: 'var(--surface)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
              КУРЬЕР
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)' }}>
              {task.courierName}
            </div>
          </div>
        )}

        {/* Comments */}
        {task.comments && (
          <div style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: 'var(--surface)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
              КОММЕНТАРИИ
            </div>
            <div style={{ fontSize: '13px', color: 'var(--foreground)' }}>
              {task.comments}
            </div>
          </div>
        )}

        {/* Places count */}
        {task.placesCount && (
          <div style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: 'var(--surface)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
              МЕСТ
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)' }}>
              {task.placesCount}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '12px',
        backgroundColor: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
      }}>
        {task.status === 'assigned' && (
          <>
            <button
              onClick={() => updateStatus('in_progress')}
              disabled={updating}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: 'white',
                fontWeight: '600',
                fontSize: '14px',
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
              }}
            >
              В работе
            </button>
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={updating}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--error)',
                backgroundColor: 'transparent',
                color: 'var(--error)',
                fontWeight: '600',
                fontSize: '14px',
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
              }}
            >
              Отмена
            </button>
          </>
        )}
        {task.status === 'in_progress' && (
          <>
            <button
              onClick={() => updateStatus('completed')}
              disabled={updating}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--success)',
                color: 'white',
                fontWeight: '600',
                fontSize: '14px',
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
              }}
            >
              Выполнено
            </button>
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={updating}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--error)',
                backgroundColor: 'transparent',
                color: 'var(--error)',
                fontWeight: '600',
                fontSize: '14px',
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
              }}
            >
              Отмена
            </button>
          </>
        )}
      </div>
    </div>
  );
}
