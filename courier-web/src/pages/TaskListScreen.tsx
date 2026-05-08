import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface Task {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  recipientAddress?: string;
  deliveryCity?: string;
  senderName?: string;
  senderAddress?: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  courierName?: string;
  placesCount?: number;
  taskType?: 'regular' | 'warehouse_pickup' | 'courier_call';
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

function toTrpcDate(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function getDateLabel(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.toDateString() === today.toDateString()) return 'Сегодня';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'Завтра';

  return date.toLocaleDateString('ru-RU', { weekday: 'short' });
}

function shiftDate(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getTaskTypeIcon(task: Task) {
  if (task.taskType === 'warehouse_pickup') return '📦';
  if (task.taskType === 'courier_call') return '📞';
  return '📋';
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

      if (filterMode === 'mine' && courier?.name) {
        taskList = taskList.filter((task: Task) => task.courierName === courier.name);
      }

      setTasks(taskList);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setTasks([]);
      setError('Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      mine: tasks.filter((task) => task.courierName === courier?.name).length,
      active: tasks.filter((task) => task.status === 'assigned' || task.status === 'in_progress').length,
    };
  }, [tasks, courier?.name]);

  return (
    <section className="mobile-screen task-list-screen">
      <header className="mobile-header-v2">
        <div className="header-row">
          <button className="logo-button" onClick={loadTasks} aria-label="Обновить заявки">📦</button>
          <button className="date-pill" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
            <span>{getDateLabel(selectedDate)}</span>
            <strong>{formatDate(selectedDate)}</strong>
          </button>
          <button
            className={`filter-pill ${filterMode === 'mine' ? 'active' : ''}`}
            onClick={() => setFilterMode(filterMode === 'all' ? 'mine' : 'all')}
          >
            {filterMode === 'all' ? 'Все' : `Мои ${stats.mine}`}
          </button>
        </div>

        <div className="date-arrows">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}>‹</button>
          <div>
            <span>Заявки</span>
            <strong>{stats.total}</strong>
          </div>
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}>›</button>
        </div>
      </header>

      <main className="task-list-content">
        {error && <div className="inline-error">{error}</div>}

        {loading && tasks.length === 0 ? (
          <div className="empty-state">
            <div className="loader-dot" />
            <strong>Загрузка...</strong>
          </div>
        ) : null}

        {!loading && tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <strong>{getDateLabel(selectedDate) === 'Сегодня' ? 'Нет заявок' : 'Нет заявок на эту дату'}</strong>
            <span>{filterMode === 'mine' ? 'Для вас заявок пока нет' : 'Выберите другую дату или обновите список'}</span>
          </div>
        ) : null}

        <div className="task-cards">
          {tasks.map((task) => (
            <button key={task.id} className="mobile-task-card" onClick={() => onTaskSelect(task.id)}>
              <div className="task-card-top">
                <div className="task-title-group">
                  <span className="task-icon">{getTaskTypeIcon(task)}</span>
                  <div>
                    <strong>{task.senderName || 'Отправитель'}</strong>
                    <small>Заявка #{task.id}</small>
                  </div>
                </div>
                <span className={`status-badge ${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
              </div>

              <div className="task-person">{task.recipientName || 'Получатель не указан'}</div>
              <div className="task-address">📍 {task.deliveryAddress || task.recipientAddress || 'Адрес не указан'}</div>

              <div className="task-card-bottom">
                <span>🕒 {task.deliveryTimeFrom || '--:--'} - {task.deliveryTimeTo || '--:--'}</span>
                <span>{task.placesCount ? `${task.placesCount} мест` : ''}</span>
              </div>

              <div className="task-card-footer">
                <span className="courier-chip">{task.courierName || 'Не назначен'}</span>
                <span className="open-chip">Подробнее ›</span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </section>
  );
}
