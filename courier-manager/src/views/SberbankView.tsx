import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import * as api from '../lib/api';
import { formatLocalDate } from '../lib/local-time';

const POINT_ORDER_STORAGE_KEY = 'courier-manager:sberbank-point-order';

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50';
const secondaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50';
const dangerButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950';

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

type SberbankPointRow = api.SberbankPoint & { listId?: number };

function sortPointsByOrder<T extends api.SberbankPoint>(points: T[], orderIds: number[]) {
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
  const [points, setPoints] = useState<SberbankPointRow[]>([]);
  const [pointOrderIds, setPointOrderIds] = useState<number[]>(() => readNumberArray(POINT_ORDER_STORAGE_KEY));
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState(archiveDate || new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [editingPoint, setEditingPoint] = useState<api.SberbankPoint | null>(null);
  const [draggedPointId, setDraggedPointId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
  });
  const [loading, setLoading] = useState(false);

  const visiblePoints = sortPointsByOrder(points, pointOrderIds);

  useEffect(() => {
    if (archiveDate) setSelectedDate(archiveDate);
  }, [archiveDate]);

  useEffect(() => {
    loadPoints();
  }, [selectedDate]);

  useEffect(() => {
    if (points.length === 0) return;

    const existingIds = points.map((point) => point.id);
    const nextOrder = [
      ...pointOrderIds.filter((id) => existingIds.includes(id)),
      ...existingIds.filter((id) => !pointOrderIds.includes(id)),
    ];

    if (JSON.stringify(nextOrder) !== JSON.stringify(pointOrderIds)) {
      setPointOrderIds(nextOrder);
      saveNumberArray(POINT_ORDER_STORAGE_KEY, nextOrder);
    }
  }, [points]);

  const loadPoints = async () => {
    try {
      setLoading(true);
      const [data, lists] = await Promise.all([
        api.getAllSberbankPoints(),
        api.getSberbankListsForDate(selectedDate),
      ]);
      const pointListIds = new Map<number, number>();

      for (const list of lists) {
        const fullList = await api.getSberbankList(list.id);
        for (const point of fullList?.items ?? []) {
          if (!pointListIds.has(point.id)) pointListIds.set(point.id, list.id);
        }
      }

      setPoints(data.map((point) => ({ ...point, listId: pointListIds.get(point.id) })));
    } catch (error) {
      console.error('Error loading points:', error);
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

  const handleRemovePointFromList = async (point: SberbankPointRow) => {
    if (!point.listId) {
      alert('Эта точка не входит в рабочий список на выбранную дату');
      return;
    }

    if (!window.confirm(`Удалить точку «${point.name}» из рабочего списка?`)) return;

    try {
      setLoading(true);
      await api.removePointFromSberbankList(point.listId, point.id);
      setSelectedPoints((prev) => prev.filter((id) => id !== point.id));
      await loadPoints();
    } catch (error) {
      console.error('Error removing point from list:', error);
      alert('Ошибка при удалении точки из списка');
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

  const handleCreateList = async (event: React.FormEvent) => {
    event.preventDefault();

    if (selectedPoints.length === 0) {
      alert('Выберите хотя бы одну точку');
      return;
    }

    try {
      setLoading(true);

      const formattedDate = formatLocalDate(selectedDate);
      const orderedSelectedPointIds = visiblePoints
        .filter((point) => selectedPoints.includes(point.id))
        .map((point) => point.id);

      const dayOfWeek = (() => {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const jsDay = new Date(year, month - 1, day).getDay();
        if (jsDay === 0 || jsDay === 6) return 5;
        return jsDay;
      })();

      await api.createOrAppendSberbankPickupList(dayOfWeek, selectedDate, formattedDate, orderedSelectedPointIds);

      alert(`Точки сохранены (${orderedSelectedPointIds.length} точек)`);
      setSelectedPoints([]);
      setShowListForm(false);
    } catch (error) {
      console.error('Error creating list:', error);
      alert('Ошибка при создании списка');
    } finally {
      setLoading(false);
    }
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
        saveNumberArray(POINT_ORDER_STORAGE_KEY, nextOrder);
      }

      closePointForm();
      await loadPoints();
    } catch (error) {
      console.error('Error saving point:', error);
      alert('Ошибка при сохранении точки');
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
    saveNumberArray(POINT_ORDER_STORAGE_KEY, nextOrder);
    setDraggedPointId(null);
  };

  return (
    <div className="w-full space-y-5">
      {showForm &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">
                {editingPoint ? 'Редактировать точку Сбербанк' : 'Добавить точку Сбербанк'}
              </h3>

              <form onSubmit={handleSubmitPoint} className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Название точки *"
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
                  type="tel"
                  placeholder="Телефон"
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  className={inputClass}
                />

                <input
                  type="text"
                  placeholder="Контактное лицо"
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

      {showListForm &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">Создать список сбора</h3>

              <form onSubmit={handleCreateList} className="mt-4 space-y-4">
                <p className="text-sm text-slate-500">
                  Выбрано точек: <span className="font-semibold text-slate-950">{selectedPoints.length}</span>
                </p>

                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className={`flex-1 ${primaryButtonClass}`}>
                    {loading ? 'Создаём...' : 'Создать'}
                  </button>

                  <button type="button" onClick={() => setShowListForm(false)} className={`flex-1 ${secondaryButtonClass}`}>
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedPoints.length === visiblePoints.length && visiblePoints.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300"
            />

            <span className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Выбрано: {selectedPoints.length} из {visiblePoints.length}
            </span>
          </div>

          {selectedPoints.length > 0 && (
            <button type="button" onClick={() => setShowListForm(true)} className={primaryButtonClass}>
              Создать список
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
        ) : visiblePoints.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Нет сохранённых точек</div>
        ) : (
          <div className="overflow-hidden">
            <div className="w-full">
              <div className="grid grid-cols-[36px_36px_minmax(150px,1fr)_minmax(220px,1.6fr)_minmax(96px,0.7fr)_176px] items-center border-b border-slate-200 bg-slate-50/95 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
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
                    className={`grid grid-cols-[36px_36px_minmax(150px,1fr)_minmax(220px,1.6fr)_minmax(96px,0.7fr)_176px] items-center gap-0 px-4 py-3 transition hover:bg-slate-50 ${
                      draggedPointId === point.id ? 'bg-slate-50 opacity-60' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-xl text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                      title="Перетащить точку"
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>

                    <input
                      type="checkbox"
                      checked={selectedPoints.includes(point.id)}
                      onChange={() => handleTogglePoint(point.id)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300"
                    />

                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-semibold text-slate-950" title={point.name}>
                        {point.name}
                      </p>
                    </div>

                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm text-slate-700" title={point.address}>
                        {point.address}
                      </p>
                    </div>

                    <div className="min-w-0 pr-3">
                      <p className="truncate text-xs font-medium text-slate-600" title={point.phone || ''}>
                        {point.phone || '—'}
                      </p>
                      {point.contactPerson && (
                        <p className="mt-0.5 truncate text-xs text-slate-400" title={point.contactPerson}>
                          {point.contactPerson}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditForm(point)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        title="Редактировать точку"
                      >
                        <Pencil size={14} />
                        Изменить
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePointFromList(point)}
                        disabled={!point.listId || loading}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                        title={point.listId ? 'Убрать точку из рабочего списка' : 'Точки нет в рабочем списке на выбранную дату'}
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
        className="fixed bottom-6 right-6 z-40 xl:right-[400px] 2xl:right-[440px] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
        title="Добавить точку"
        aria-label="Добавить точку"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
