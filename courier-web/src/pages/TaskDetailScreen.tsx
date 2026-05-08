import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

interface TaskDetail {
  id: number;
  recipientName: string;
  recipientPhone?: string | null;
  deliveryAddress: string;
  senderName?: string | null;
  senderAddress?: string | null;
  senderPhone?: string | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  status: TaskStatus;
  comments?: string | null;
  courierComments?: string | null;
  courierName?: string | null;
  placesCount?: number | null;
}

interface CourierOption {
  id: number;
  name: string;
}

interface TaskDetailScreenProps {
  taskId: number;
  onBack: () => void;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  assigned: '#3b82f6',
  in_progress: '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: 'Новая',
  in_progress: 'В работе',
  completed: 'Выполнено',
  cancelled: 'Отменено',
};

function unwrapTrpc<T>(data: any): T {
  return data?.result?.data?.json || data?.result?.data || data?.result || data;
}

function cleanPhone(phone: string) {
  return phone.replace(/[\s()-]/g, '');
}

function openMap(address?: string | null) {
  if (!address) return;
  navigator.clipboard?.writeText(address).catch(() => undefined);
  window.open(`https://2gis.ru/search?q=${encodeURIComponent(address)}`, '_blank', 'noopener,noreferrer');
}

export function TaskDetailScreen({ taskId, onBack }: TaskDetailScreenProps) {
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courierPickerVisible, setCourierPickerVisible] = useState(false);

  useEffect(() => {
    loadTask();
  }, [taskId, token]);

  const loadTask = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(
        `/api/trpc/tasks.byId?input=${encodeURIComponent(JSON.stringify({ id: taskId, token }))}`,
        { withCredentials: true }
      );
      setTask(unwrapTrpc<TaskDetail>(response.data));
    } catch (err) {
      console.error('Failed to load task:', err);
      setError('Не удалось загрузить заявку');
    } finally {
      setLoading(false);
    }
  };

  const mutate = async (path: string, json: Record<string, unknown>) => {
    if (!token) return;
    try {
      setUpdating(true);
      setError(null);
      await axios.post(`/api/trpc/${path}`, { json: { token, ...json } }, { withCredentials: true });
      await loadTask();
    } catch (err) {
      console.error(`Failed to mutate ${path}:`, err);
      setError('Не удалось сохранить изменения');
    } finally {
      setUpdating(false);
    }
  };

  const updateStatus = async (newStatus: TaskStatus) => {
    if (!task) return;
    const statusToSet = task.status === newStatus ? 'assigned' : newStatus;
    await mutate('tasks.setStatus', { taskId, status: statusToSet });
  };

  const updatePlaces = async () => {
    const value = window.prompt('Введите количество мест', String(task?.placesCount ?? ''));
    if (value === null) return;
    const placesCount = Number(value);
    if (!Number.isFinite(placesCount) || placesCount < 1) {
      setError('Введите корректное количество мест');
      return;
    }
    await mutate('tasks.updatePlaces', { taskId, placesCount });
  };

  const updateComments = async () => {
    const courierComments = window.prompt('Комментарий курьера', task?.courierComments || '');
    if (courierComments === null) return;
    if (!courierComments.trim()) {
      setError('Напишите комментарий');
      return;
    }
    await mutate('tasks.updateComments', { taskId, courierComments: courierComments.trim() });
  };

  const rescheduleTask = async () => {
    const newDate = window.prompt('Новая дата доставки в формате YYYY-MM-DD', new Date().toISOString().split('T')[0]);
    if (newDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setError('Введите дату в формате YYYY-MM-DD');
      return;
    }
    await mutate('tasks.rescheduleTask', { taskId, newDate: new Date(`${newDate}T00:00:00`).toISOString() });
    onBack();
  };

  const loadCouriers = async () => {
    if (!token) return;
    try {
      const response = await axios.get(
        `/api/trpc/couriers.list?input=${encodeURIComponent(JSON.stringify({ token }))}`,
        { withCredentials: true }
      );
      const list = unwrapTrpc<CourierOption[]>(response.data);
      setCouriers(Array.isArray(list) ? list : []);
      setCourierPickerVisible(true);
    } catch (err) {
      console.error('Failed to load couriers:', err);
      setError('Не удалось загрузить список курьеров');
    }
  };

  const assignCourier = async (courierId: number | null) => {
    setCourierPickerVisible(false);
    await mutate('tasks.assignCourier', { taskId, courierId });
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
        {error && <div className="inline-error">{error}</div>}

        <section className="detail-card">
          <span className="section-label">Отправитель</span>
          <strong>{task.senderName || 'Не указано'}</strong>
          {task.senderAddress && <button className="link-row" onClick={() => openMap(task.senderAddress)}>📍 {task.senderAddress}</button>}
          {task.senderPhone && <a className="link-row" href={`tel:${cleanPhone(task.senderPhone)}`}>📞 {task.senderPhone}</a>}
        </section>

        <section className="detail-card">
          <span className="section-label">Получатель</span>
          <strong>{task.recipientName || 'Не указано'}</strong>
          <button className="link-row" onClick={() => openMap(task.deliveryAddress)}>📍 {task.deliveryAddress || 'Адрес не указан'}</button>
          {task.recipientPhone && <a className="link-row" href={`tel:${cleanPhone(task.recipientPhone)}`}>📞 {task.recipientPhone}</a>}
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
            <button className="outlined-value" onClick={updatePlaces} disabled={updating}>{task.placesCount || 0}</button>
          </div>
          <div>
            <span className="section-label">💬 Комментарий курьера</span>
            <button className="outlined-comment" onClick={updateComments} disabled={updating}>
              {task.courierComments || 'Добавить комментарий...'}
            </button>
          </div>
        </section>

        <section className="detail-card">
          <div className="status-grid">
            <button className={`status-action orange ${isInProgress ? 'active' : ''}`} disabled={updating || isCompleted || isCancelled} onClick={() => updateStatus('in_progress')}>В работе</button>
            <button className={`status-action green ${isCompleted ? 'active' : ''}`} disabled={updating || isCancelled} onClick={() => updateStatus('completed')}>Выполнено</button>
            <button className={`status-action red ${isCancelled ? 'active' : ''}`} disabled={updating || isCompleted} onClick={() => updateStatus('cancelled')}>Отмена</button>
            <button className="status-action blue" disabled={updating} onClick={rescheduleTask}>Перенос заявки</button>
          </div>
        </section>

        <section className="detail-card courier-card">
          <button onClick={loadCouriers} disabled={updating}>
            <span className="green-dot" />
            <strong>{task.courierName || 'Не назначен'}</strong>
            <span>›</span>
          </button>
        </section>
      </main>

      {courierPickerVisible && (
        <div className="modal-backdrop" onClick={() => setCourierPickerVisible(false)}>
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <h2>Выбрать курьера</h2>
            <button className="sheet-row" onClick={() => assignCourier(null)}>Не назначен</button>
            {couriers.map((courier) => (
              <button key={courier.id} className="sheet-row" onClick={() => assignCourier(courier.id)}>{courier.name}</button>
            ))}
            <button className="primary-button" onClick={() => setCourierPickerVisible(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </section>
  );
}
