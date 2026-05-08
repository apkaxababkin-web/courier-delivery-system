import { useState, useEffect } from 'react';
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

function unwrapTrpc<T>(data: any): T {
  return data?.result?.data?.json || data?.result?.data || data?.result || data;
}

export function TaskDetailScreen({ taskId, onBack }: TaskDetailScreenProps) {
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadTask();
  }, [taskId, token]);

  const loadTask = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/tasks.byId?input=${encodeURIComponent(JSON.stringify({ id: taskId, token }))}`,
        { withCredentials: true }
      );
      setTask(unwrapTrpc<TaskDetail>(response.data));
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: 'assigned' | 'in_progress' | 'completed' | 'cancelled') => {
    if (!token || !task) return;
    const statusToSet = task.status === newStatus ? 'assigned' : newStatus;
    try {
      setUpdating(true);
      await axios.post(
        '/api/trpc/tasks.setStatus',
        { json: { taskId, status: statusToSet, token } },
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
      <div className="mobile-screen center-screen">
        <div className="loader-dot" />
        <strong>Загрузка...</strong>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mobile-screen center-screen">
        <div className="empty-icon">📋</div>
        <strong>Заявка не найдена</strong>
        <button className="primary-button" onClick={onBack}>Назад</button>
      </div>
    );
  }

  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';
  const isInProgress = task.status === 'in_progress';

  return (
    <section className="mobile-screen task-detail-screen">
      <header className="detail-header">
        <button onClick={onBack} className="back-button">←</button>
        <strong>Заявка #{task.id}</strong>
        <span className="status-badge" style={{ backgroundColor: `${STATUS_COLORS[task.status]}20`, color: STATUS_COLORS[task.status] }}>
          {STATUS_LABELS[task.status]}
        </span>
      </header>

      <main className="detail-content">
        <section className="detail-card">
          <span className="section-label">Отправитель</span>
          <strong>{task.senderName || 'Не указано'}</strong>
          {task.senderAddress && <p>📍 {task.senderAddress}</p>}
          {task.senderPhone && <a href={`tel:${task.senderPhone}`}>📞 {task.senderPhone}</a>}
        </section>

        <section className="detail-card">
          <span className="section-label">Получатель</span>
          <strong>{task.recipientName}</strong>
          <p>📍 {task.deliveryAddress}</p>
          {task.recipientPhone && <a href={`tel:${task.recipientPhone}`}>📞 {task.recipientPhone}</a>}
        </section>

        <section className="detail-card">
          <span className="section-label">Время доставки</span>
          <strong>{task.deliveryTimeFrom || '--:--'} - {task.deliveryTimeTo || '--:--'}</strong>
        </section>

        {task.comments && (
          <section className="detail-card">
            <span className="section-label">Комментарии</span>
            <p>{task.comments}</p>
          </section>
        )}

        <section className="detail-card action-card">
          <div>
            <span className="section-label">Введите количество мест</span>
            <div className="outlined-value">{task.placesCount || 0}</div>
          </div>
        </section>

        <section className="detail-card">
          <div className="status-grid">
            <button className={`status-action orange ${isInProgress ? 'active' : ''}`} disabled={updating || isCompleted || isCancelled} onClick={() => updateStatus('in_progress')}>В работе</button>
            <button className={`status-action green ${isCompleted ? 'active' : ''}`} disabled={updating || isCancelled} onClick={() => updateStatus('completed')}>Выполнено</button>
            <button className={`status-action red ${isCancelled ? 'active' : ''}`} disabled={updating || isCompleted} onClick={() => updateStatus('cancelled')}>Отмена</button>
            <button className="status-action blue" disabled={updating}>Перенос заявки</button>
          </div>
        </section>

        <section className="detail-card courier-card">
          <div>
            <span className="green-dot" />
            <strong>{task.courierName || 'Не назначен'}</strong>
            <span>›</span>
          </div>
        </section>
      </main>
    </section>
  );
}
