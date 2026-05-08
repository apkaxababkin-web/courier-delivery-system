import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

interface HistoryTask {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  senderName?: string | null;
  senderAddress?: string | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  status: TaskStatus;
  courierName?: string | null;
  placesCount?: number | null;
  taskType?: 'regular' | 'warehouse_pickup' | 'courier_call';
}

interface HistoryScreenProps {
  onTaskSelect: (taskId: number) => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: 'Назначена',
  in_progress: 'В работе',
  completed: 'Выполнена',
  cancelled: 'Отменена',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  assigned: 'status-assigned',
  in_progress: 'status-progress',
  completed: 'status-completed',
  cancelled: 'status-cancelled',
};

const STATUS_BORDER_COLORS: Record<TaskStatus, string> = {
  assigned: '#3B82F6',
  in_progress: '#F97316',
  completed: '#22C55E',
  cancelled: '#EF4444',
};

function unwrapTrpc<T>(data: any): T {
  return data?.result?.data?.json || data?.result?.data || data?.result || data;
}

function getTaskTypeLabel(task: HistoryTask) {
  if (task.taskType === 'warehouse_pickup') return '📦 Товар';
  if (task.taskType === 'courier_call') return '📞 Вызов курьера';
  return null;
}

export function HistoryScreen({ onTaskSelect }: HistoryScreenProps) {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<HistoryTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [token]);

  const loadHistory = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const input = encodeURIComponent(JSON.stringify({ token, date: new Date().toISOString() }));
      const response = await axios.get(`/api/trpc/tasks.history?input=${input}`, { withCredentials: true });
      const list = unwrapTrpc<HistoryTask[]>(response.data);
      setTasks(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load history:', err);
      setTasks([]);
      setError('Не удалось загрузить историю');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mobile-screen task-list-screen">
      <header className="history-header">
        <div>
          <h1>История</h1>
          <p>Завершённые и отменённые заявки</p>
        </div>
        <button onClick={loadHistory} disabled={loading}>↻</button>
      </header>

      <main className="task-list-content exact-task-list">
        {error && <div className="inline-error">{error}</div>}
        {loading && tasks.length === 0 ? <div className="empty-state"><div className="loader-dot" /><strong>Загрузка...</strong></div> : null}
        {!loading && tasks.length === 0 ? <div className="empty-state"><div className="empty-icon">🕘</div><strong>История пуста</strong><span>Завершённые заявки появятся здесь</span></div> : null}

        {tasks.map((task) => {
          const taskTypeLabel = getTaskTypeLabel(task);
          const timeLabel = task.deliveryTimeFrom || task.deliveryTimeTo ? `${task.deliveryTimeFrom ?? '?'} – ${task.deliveryTimeTo ?? '?'}` : null;
          return (
            <button key={task.id} className="exact-task-card history-task-card" style={{ borderLeftColor: STATUS_BORDER_COLORS[task.status] }} onClick={() => onTaskSelect(task.id)}>
              {taskTypeLabel && <div className="task-type-label">{taskTypeLabel}</div>}
              <div className="exact-task-top-row">
                <strong>{task.senderName || 'Отправитель'}</strong>
                <span>ID: {task.id}</span>
              </div>
              {task.senderAddress && <div className="exact-address-row">📍 <span>{task.senderAddress}</span></div>}
              <div className="exact-recipient-name">{task.recipientName}</div>
              <div className="exact-address-row">📍 <span>{task.deliveryAddress}</span></div>
              {timeLabel && <div className="exact-time-text">{timeLabel}</div>}
              <div className="exact-bottom-row">
                <span className={`status-badge ${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                {task.courierName && <span className="history-courier-chip">{task.courierName}</span>}
                {task.placesCount != null && <span className="exact-places-text">Мест: {task.placesCount}</span>}
              </div>
            </button>
          );
        })}
      </main>
    </section>
  );
}
