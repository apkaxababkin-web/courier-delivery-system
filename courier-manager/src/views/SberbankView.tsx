import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, shortName: 'Пн', name: 'Понедельник' },
  { id: 2, shortName: 'Вт', name: 'Вторник' },
  { id: 3, shortName: 'Ср', name: 'Среда' },
  { id: 4, shortName: 'Чт', name: 'Четверг' },
  { id: 5, shortName: 'Пт', name: 'Пятница' },
];

const HIDDEN_SBERBANK_POINTS_STORAGE_KEY = 'courier-manager:hidden-sberbank-points';
const SBERBANK_POINT_ORDER_STORAGE_KEY = 'courier-manager:sberbank-point-order';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50';

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100';

const dangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950';

const readNumberArray = (key: string) => {
  if (typeof window === 'undefined') return [] as number[];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id) => Number.isFinite(Number(id))).map(Number)
      : [];
  } catch {
    return [];
  }
};

const saveNumberArray = (key: string, value: number[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

function getBusinessWeekdayFromDate(dateValue?: string) {
  if (!dateValue) return null;

  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;

  const jsDay = new Date(year, month - 1, day).getDay();

  if (jsDay === 0 || jsDay === 6) return 5;

  return jsDay;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;

  return new Date(year, month - 1, day).toLocaleDateString('ru-RU');
}

function sortPointsByOrder(points: api.SberbankPoint[], orderIds: number[]) {
  const order = new Map(orderIds.map((id, index) => [id, index]));

  return [...points].sort((a, b) => {
    const aIndex = order.has(a.id) ? order.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bIndex = order.has(b.id) ? order.get(b.id)! : Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) return aIndex - bIndex;

    return a.id - b.id;
  });
}

function moveId(order: number[], id: number, targetId: number) {
  const clean = order.filter((item) => item !== id);
  const targetIndex = clean.indexOf(targetId);

  if (targetIndex === -1) {
    clean.push(id);
    return clean;
  }

  clean.splice(targetIndex, 0, id);
  return clean;
}

export default function SberbankView({ archiveDate }: { archiveDate?: string }) {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [hiddenPointIds, setHiddenPointIds] = useState<number[]>(() => readNumberArray(HIDDEN_SBERBANK_POINTS_STORAGE_KEY));
  const [pointOrderIds, setPointOrderIds] = useState<number[]>(() => readNumberArray(SBERBANK_POINT_ORDER_STORAGE_KEY));
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState<api.SberbankPoint | null>(null);
  const [draggedPointId, setDraggedPointId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
  });

  const visiblePoints = sortPointsByOrder(
    points.filter((point) => !hiddenPointIds.includes(point.id)),
    pointOrderIds
  );

  useEffect(() => {
    loadPoints();
  }, []);

  useEffect(() => {
    const day = getBusinessWeekdayFromDate(archiveDate);
    if (day) {
      handleSelectTemplate(day);
    }
  }, [archiveDate]);

  useEffect(() => {
    if (points.length === 0) return;

    const existingIds = points.map((point) => point.id);
    const nextOrder = [
      ...pointOrderIds.filter((id) => existingIds.includes(id)),
      ...existingIds.filter((id) => !pointOrderIds.includes(id)),
    ];

    if (JSON.stringify(nextOrder) !== JSON.stringify(pointOrderIds)) {
      setPointOrderIds(nextOrder);
      saveNumberArray(SBERBANK_POINT_ORDER_STORAGE_KEY, nextOrder);
    }
  }, [points]);

  const loadPoints = async () => {
    try {
      setLoading(true);
      const data = await api.getAllSberbankPoints();
      setPoints(data);
    } catch (error) {
      console.error(error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePoint = (pointId: number) => {
    setSelectedPoints((prev) =>
      prev.includes(pointId)
        ? prev.filter((id) => id !== pointId)
        : [...prev, pointId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPoints.length === visiblePoints.length) {
      setSelectedPoints([]);
    } else {
      setSelectedPoints(visiblePoints.map((point) => point.id));
    }
  };

  const handleHidePoint = (point: api.SberbankPoint) => {
    if (!window.confirm(`Удалить точку «${point.name}» из рабочего списка?`)) return;

    const nextHiddenIds = Array.from(new Set([...hiddenPointIds, point.id]));
    setHiddenPointIds(nextHiddenIds);
    saveNumberArray(HIDDEN_SBERBANK_POINTS_STORAGE_KEY, nextHiddenIds);
    setSelectedPoints((prev) => prev.filter((id) => id !== point.id));
  };

  const handleSelectTemplate = async (dayId: number) => {
    try {
      const templatePoints = await api.getSberbankScheduleForDay(dayId);
      const templatePointIds = templatePoints.map((point) => point.id);

      setSelectedTemplateDay(dayId);
      setSelectedPoints(templatePointIds);

      if (templatePointIds.length > 0) {
        const allVisibleIds = visiblePoints.map((point) => point.id);
        const nextOrder = [
          ...templatePointIds,
          ...allVisibleIds.filter((id) => !templatePointIds.includes(id)),
        ];

        setPointOrderIds(nextOrder);
        saveNumberArray(SBERBANK_POINT_ORDER_STORAGE_KEY, nextOrder);
      }
    } catch (error) {
      console.error(error);
      alert('Ошибка загрузки шаблона');
    }
  };

  const handleCreateList = async () => {
    if (selectedPoints.length === 0) {
      alert('Выберите точки');
      return;
    }

    try {
      setLoading(true);

      const listDate = archiveDate || getTodayDateKey();
      const dayId = selectedTemplateDay || getBusinessWeekdayFromDate(listDate) || 1;
      const title = DAYS_OF_WEEK.find((day) => day.id === dayId)?.name || 'Список';

      const orderedSelectedPointIds = visiblePoints
        .filter((point) => selectedPoints.includes(point.id))
        .map((point) => point.id);

      await api.createSberbankPickupList(
        dayId,
        listDate,
        `${title} ${formatDateLabel(listDate)}`,
        orderedSelectedPointIds
      );

      alert(`Список создан (${orderedSelectedPointIds.length} точек)`);
    } catch (error) {
      console.error(error);
      alert('Ошибка создания списка');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (dayId: number) => {
    if (selectedPoints.length === 0) {
      alert('Выберите точки для шаблона');
      return;
    }

    try {
      setLoading(true);

      const orderedSelectedPointIds = visiblePoints
        .filter((point) => selectedPoints.includes(point.id))
        .map((point) => point.id);

      await api.setSberbankScheduleForDay(dayId, orderedSelectedPointIds);

      setSelectedTemplateDay(dayId);
      setShowSaveTemplateModal(false);

      alert('Шаблон сохранён');
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения шаблона');
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingPoint(null);
    setFormData({ name: '', address: '', phone: '', contactPerson: '' });
    setShowForm(true);
  };

  const openEditForm = (point: api.SberbankPoint) => {
    setEditingPoint(point);
    setFormData({
      name: point.name || '',
      address: point.address || '',
      phone: point.phone || '',
      contactPerson: point.contactPerson || '',
    });
    setShowForm(true);
  };

  const closePointForm = () => {
    setShowForm(false);
    setEditingPoint(null);
    setFormData({ name: '', address: '', phone: '', contactPerson: '' });
  };

  const handleSubmitPoint = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Заполните название и адрес');
      return;
    }

    try {
      setLoading(true);

      if (editingPoint) {
        await api.post('/api/trpc/sberbank.updatePoint', {
          id: editingPoint.id,
          ...formData,
        });
      } else {
        const created = await api.createSberbankPoint(formData);
        const nextOrder = [...pointOrderIds, created.id];
        setPointOrderIds(nextOrder);
        saveNumberArray(SBERBANK_POINT_ORDER_STORAGE_KEY, nextOrder);
      }

      closePointForm();
      await loadPoints();
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения точки');
    } finally {
      setLoading(false);
    }
  };

  const handleDropPoint = (targetPointId: number) => {
    if (!draggedPointId || draggedPointId === targetPointId) {
      setDraggedPointId(null);
      return;
    }

    const baseOrder = [
      ...pointOrderIds.filter((id) => visiblePoints.some((point) => point.id === id)),
      ...visiblePoints.map((point) => point.id).filter((id) => !pointOrderIds.includes(id)),
    ];

    const nextOrder = moveId(baseOrder, draggedPointId, targetPointId);

    setPointOrderIds(nextOrder);
    saveNumberArray(SBERBANK_POINT_ORDER_STORAGE_KEY, nextOrder);
    setDraggedPointId(null);
  };

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      {showSaveTemplateModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">Сохранить шаблон</h3>
              <p className="mt-1 text-sm text-slate-500">
                Выбранные точки сохранятся в выбранный день недели.
              </p>

              <div className="mt-4 space-y-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => handleSaveTemplate(day.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{day.name}</span>
                    <span className="text-xs text-slate-400">{selectedPoints.length} точек</span>
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(false)}
                  className={`w-full ${secondaryButtonClass}`}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showForm &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">
                {editingPoint ? 'Редактировать точку Сбербанка' : 'Добавить точку Сбербанка'}
              </h3>

              <form onSubmit={handleSubmitPoint} className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Название / номер отделения *"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  className={inputClass}
                  required
                />

                <input
                  type="text"
                  placeholder="Адрес *"
                  value={formData.address}
                  onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                  className={inputClass}
                  required
                />

                <input
                  type="text"
                  placeholder="Телефон"
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  className={inputClass}
                />

                <input
                  type="text"
                  placeholder="Контакт / примечание"
                  value={formData.contactPerson}
                  onChange={(event) => setFormData({ ...formData, contactPerson: event.target.value })}
                  className={inputClass}
                />

                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={loading} className={`flex-1 ${primaryButtonClass}`}>
                    {loading ? 'Сохраняем...' : editingPoint ? 'Сохранить' : 'Добавить'}
                  </button>

                  <button type="button" onClick={closePointForm} className={`flex-1 ${secondaryButtonClass}`}>
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="checkbox"
              checked={selectedPoints.length === visiblePoints.length && visiblePoints.length > 0}
              onChange={handleSelectAll}
              className="h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300"
            />

            <span className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Выбрано: {selectedPoints.length} из {visiblePoints.length}
            </span>

            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => handleSelectTemplate(day.id)}
                  className={`h-8 rounded-xl px-3 text-xs font-semibold transition ${
                    selectedTemplateDay === day.id
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                  title={day.name}
                >
                  {day.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSaveTemplateModal(true)}
              disabled={selectedPoints.length === 0}
              className={secondaryButtonClass}
            >
              <Save size={16} />
              Сохранить шаблон
            </button>

            {selectedPoints.length > 0 && (
              <button type="button" onClick={handleCreateList} disabled={loading} className={primaryButtonClass}>
                Создать список
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
        ) : visiblePoints.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Нет точек Сбербанка</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="w-full min-w-[1180px]">
              <div className="grid grid-cols-[44px_44px_minmax(220px,1.1fr)_minmax(420px,2.1fr)_minmax(220px,1fr)_240px] items-center border-b border-slate-200 bg-slate-50/95 px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <div />
                <div />
                <div>Точка</div>
                <div>Адрес</div>
                <div>Контакты</div>
                <div className="text-right">Действия</div>
              </div>

              <div className="divide-y divide-slate-100">
                {visiblePoints.map((point) => (
                  <div
                    key={point.id}
                    draggable
                    onDragStart={() => setDraggedPointId(point.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropPoint(point.id)}
                    onDragEnd={() => setDraggedPointId(null)}
                    className={`grid grid-cols-[44px_44px_minmax(220px,1.1fr)_minmax(420px,2.1fr)_minmax(220px,1fr)_240px] items-center gap-0 px-5 py-3 transition hover:bg-slate-50 ${
                      draggedPointId === point.id ? 'bg-slate-50 opacity-60' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-xl text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                      title="Перетащить точку"
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>

                    <input
                      type="checkbox"
                      checked={selectedPoints.includes(point.id)}
                      onChange={() => handleTogglePoint(point.id)}
                      className="h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300"
                    />

                    <div className="min-w-0 pr-4">
                      <p className="truncate text-sm font-semibold text-slate-950" title={point.name}>
                        {point.name}
                      </p>
                    </div>

                    <div className="min-w-0 pr-4">
                      <p className="truncate text-sm text-slate-700" title={point.address}>
                        {point.address}
                      </p>
                    </div>

                    <div className="min-w-0 pr-4">
                      <p className="truncate text-xs font-medium text-slate-600" title={point.phone || ''}>
                        {point.phone || '—'}
                      </p>
                      {point.contactPerson && (
                        <p className="mt-0.5 truncate text-xs text-slate-400" title={point.contactPerson}>
                          {point.contactPerson}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(point)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        title="Редактировать точку"
                      >
                        <Pencil size={14} />
                        Изменить
                      </button>

                      <button
                        type="button"
                        onClick={() => handleHidePoint(point)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                        title="Убрать точку из списка"
                      >
                        <Trash2 size={14} />
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openCreateForm}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
        title="Добавить точку"
        aria-label="Добавить точку"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
