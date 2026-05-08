import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface Task {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  recipientAddress?: string | null;
  deliveryCity?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  courierName?: string | null;
  placesCount?: number | null;
  taskType?: 'regular' | 'warehouse_pickup' | 'courier_call';
  items?: string | null;
}

interface TaskListScreenProps {
  onTaskSelect: (taskId: number) => void;
}

const STATUS_LABELS: Record<Task['status'], string> = {
  assigned: 'Назначена',
  in_progress: 'В работе',
  completed: 'Выполнена',
  cancelled: 'Отменена',
};

const STATUS_CLASS: Record<Task['status'], string> = {
  assigned: 'status-assigned',
  in_progress: 'status-progress',
  completed: 'status-completed',
  cancelled: 'status-cancelled',
};

const STATUS_BORDER_COLORS: Record<Task['status'], string> = {
  assigned: '#3B82F6',
  in_progress: '#F97316',
  completed: '#22C55E',
  cancelled: '#EF4444',
};

const COURIER_COLORS = ['#007AFF', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

function getCourierColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COURIER_COLORS[Math.abs(hash) % COURIER_COLORS.length];
}

function shortName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function toTrpcDate(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function formatMobileDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function shiftDate(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getTaskTypeLabel(task: Task) {
  if (task.taskType === 'warehouse_pickup' && task.items) {
    try {
      const items = JSON.parse(task.items);
      const category = items[0]?.category || 'Товар';
      return `📦 ${category}`;
    } catch {
      return '📦 Товар';
    }
  }
  if (task.taskType === 'warehouse_pickup') return '📦 Товар';
  if (task.taskType === 'courier_call') return '📞 Вызов курьера';
  return null;
}

function renderWarehouseItems(items?: string | null) {
  if (!items) return null;
  try {
    const parsed = JSON.parse(items);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item: { name: string; quantity: number }, index: number) => (
      <div key={`${item.name}-${index}`} className="warehouse-item">• {item.name} — {item.quantity} шт</div>
    ));
  } catch {
    return null;
  }
}

export function TaskListScreen({ onTaskSelect }: TaskListScreenProps) {
  const { token, courier } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, [selectedDate, filterMode, token]);

  const loadTasks = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(
        `/api/trpc/tasks.all?input=${encodeURIComponent(JSON.stringify({ token, date: toTrpcDate(selectedDate) }))}`,
        { withCredentials: true }
      );
      let taskList = response.data?.result?.data?.json || response.data?.result?.data || response.data?.result || [];
      if (!Array.isArray(taskList)) taskList = [];
      if (filterMode === 'mine' && courier?.name) taskList = taskList.filter((task: Task) => task.courierName === courier.name);
      setTasks(taskList);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setTasks([]);
      setError('Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
  };

  const myTasksCount = useMemo(() => tasks.filter((task) => task.courierName === courier?.name).length, [tasks, courier?.name]);

  return (
    <section className="mobile-screen task-list-screen">
      <header className="mobile-header-exact">
        <button className="header-icon-button" onClick={loadTasks} aria-label="Профиль">👤</button>
        <button className="header-date-button" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>{formatMobileDate(selectedDate)}</button>
        <button className="header-icon-button filter-icon" onClick={() => setFilterMode(filterMode === 'all' ? 'mine' : 'all')} aria-label="Фильтр">
          {filterMode === 'mine' ? '⏷' : '≡'}
          {myTasksCount > 0 && <span>{myTasksCount > 99 ? '99+' : myTasksCount}</span>}
        </button>
      </header>

      {filterMode === 'mine' && <div className="mine-filter-label">Мои заявки</div>}

      <div className="mobile-date-strip">
        <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}>‹</button>
        <strong>{formatMobileDate(selectedDate)}</strong>
        <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}>›</button>
      </div>

      <main className="task-list-content exact-task-list">
        {error && <div className="inline-error">{error}</div>}

        {loading && tasks.length === 0 ? (
          <div className="empty-state"><div className="loader-dot" /><strong>Загрузка...</strong></div>
        ) : null}

        {!loading && tasks.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📋</div><strong>Нет заявок</strong><span>На выбранную дату заявок нет</span></div>
        ) : null}

        {tasks.map((task) => {
          const taskTypeLabel = getTaskTypeLabel(task);
          const isWarehousePickup = task.taskType === 'warehouse_pickup';
          const isCourierCall = task.taskType === 'courier_call';
          const borderColor = STATUS_BORDER_COLORS[task.status] || '#9CA3AF';
          const timeLabel = task.deliveryTimeFrom || task.deliveryTimeTo ? `${task.deliveryTimeFrom ?? '?'} – ${task.deliveryTimeTo ?? '?'}` : null;

          return (
            <button key={task.id} className="exact-task-card" style={{ borderLeftColor: borderColor }} onClick={() => onTaskSelect(task.id)}>
              {taskTypeLabel && <div className="task-type-label">{taskTypeLabel}</div>}
              <div className="exact-task-top-row">
                {!isWarehousePickup && <strong>{task.senderName || 'Отправитель'}</strong>}
                <span>ID: {task.id}</span>
              </div>

              {task.senderAddress && !isCourierCall && !isWarehousePickup && <div className="exact-address-row">📍 <span>{task.senderAddress}</span></div>}
              {isCourierCall && task.senderAddress && <div className="exact-address-row">🏢 <span>Адрес: {task.senderAddress}</span></div>}
              {!isCourierCall && !isWarehousePickup && <div className="exact-recipient-name">{task.recipientName}</div>}
              {isWarehousePickup && <div className="exact-recipient-name">{task.recipientName}</div>}
              {!isCourierCall && <div className="exact-address-row">📍 <span>{task.deliveryAddress}</span></div>}
              {isWarehousePickup && <div className="warehouse-items">{renderWarehouseItems(task.items)}</div>}
              {timeLabel && <div className="exact-time-text">{timeLabel}</div>}

              <div className="exact-bottom-row">
                <span className={`status-badge ${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                {task.courierName && <span className="courier-badge" style={{ backgroundColor: getCourierColor(task.courierName) }}>{shortName(task.courierName)}</span>}
                {task.placesCount != null && <span className="exact-places-text">Мест: {task.placesCount}</span>}
              </div>
            </button>
          );
        })}
      </main>
    </section>
  );
}
