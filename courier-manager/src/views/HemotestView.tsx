import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, GripVertical, ListMinus, Pencil, Plus, Trash2 } from 'lucide-react';
import * as api from '../lib/api';
import { formatLocalDate } from '../lib/local-time';

const POINT_ORDER_STORAGE_KEY = 'courier-manager:hemotest-point-order';

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

type HemotestPointRow = api.HemotestPoint & { listId?: number; isArchived?: boolean };

function sortPointsByOrder<T extends api.HemotestPoint>(points: T[], orderIds: number[]) {
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

export default function HemotestView({ archiveDate }: { archiveDate?: string }) {
  const [points, setPoints] = useState<HemotestPointRow[]>([]);
  const [pointOrderIds, setPointOrderIds] = useState<number[]>(() => readNumberArray(POINT_ORDER_STORAGE_KEY));
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState(archiveDate || new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [editingPoint, setEditingPoint] = useState<api.HemotestPoint | null>(null);
  const [draggedPointId, setDraggedPointId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
  });
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<{ kind: 'removeFromList' | 'archive'; point: HemotestPointRow } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const visiblePoints = sortPointsByOrder(points, pointOrderIds);
  const selectablePoints = visiblePoints.filter((point) => !point.isArchived);

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
        api.getAllHemotestPoints(),
        api.getHemotestListsForDate(selectedDate),
      ]);
      const pointListIds = new Map<number, number>();
      const listedPoints = new Map<number, api.HemotestPoint>();

      for (const list of lists) {
        const fullList = await api.getHemotestList(list.id);
        for (const point of fullList?.items ?? []) {
          if (!pointListIds.has(point.id)) pointListIds.set(point.id, list.id);
          if (!listedPoints.has(point.id)) listedPoints.set(point.id, point);
        }
      }

      const rows: HemotestPointRow[] = data.map((point) => ({
        ...point,
        listId: pointListIds.get(point.id),
        isArchived: point.isActive === false,
      }));

      // Directory hides archived points, but a point already present in the
      // selected date's list must remain visible (and removable from that list).
      for (const [id, point] of listedPoints) {
        if (!data.some((item) => item.id === id)) {
          rows.push({ ...point, listId: pointListIds.get(id), isArchived: true });
        }
      }

      setPoints(rows);
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
    const allSelected = selectablePoints.length > 0
      && selectablePoints.every((point) => selectedPoints.includes(point.id));

    if (allSelected) {
      setSelectedPoints((prev) => prev.filter((id) => !selectablePoints.some((point) => point.id === id)));
      return;
    }

    setSelectedPoints((prev) => [...new Set([...prev, ...selectablePoints.map((point) => point.id)])]);
  };

  const openRemoveFromList = (point: HemotestPointRow) => {
    setFeedback(null);
    setConfirmError(null);
    setConfirmState({ kind: 'removeFromList', point });
  };

  const openArchivePoint = (point: HemotestPointRow) => {
    setFeedback(null);
    setConfirmError(null);
    setConfirmState({ kind: 'archive', point });
  };

  const closeConfirm = () => {
    setConfirmError(null);
    if (!actionBusy) setConfirmState(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmState || actionBusy) return;

    const { kind, point } = confirmState;
    setActionBusy(true);
    setFeedback(null);
    setConfirmError(null);

    try {
      if (kind === 'removeFromList') {
        if (!point.listId) {
          throw new Error('Эта точка не входит в рабочий список на выбранную дату');
        }

        await api.removePointFromHemotestList(point.listId, point.id);
        setSelectedPoints((prev) => prev.filter((id) => id !== point.id));
        setFeedback({ type: 'success', text: `Точку «${point.name}» убрали из рабочего списка на выбранную дату.` });
      } else {
        await api.deleteHemotestPoint(point.id);
        setSelectedPoints((prev) => prev.filter((id) => id !== point.id));
        setPointOrderIds((prev) => {
          const next = prev.filter((id) => id !== point.id);
          saveNumberArray(POINT_ORDER_STORAGE_KEY, next);
          return next;
        });
        setFeedback({
          type: 'success',
          text: `Точка «${point.name}» удалена из справочника и больше не предлагается для новых списков. История сборов сохранена.`,
        });
      }

      setConfirmError(null);
      setConfirmState(null);
      await loadPoints();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Неизвестная ошибка';
      setConfirmError(
        kind === 'removeFromList'
          ? `Не удалось убрать точку из списка: ${message}`
          : `Не удалось удалить точку из справочника: ${message}`,
      );
    } finally {
      setActionBusy(false);
    }
  };

  const openCreateForm = () => {
    setEditingPoint(null);
    setFormData({ name: '', address: '', phone: '', contactPerson: '' });
    setShowForm(true);
  };

  const openEditForm = (point: api.HemotestPoint) => {
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
      setFeedback({ type: 'error', text: 'Выберите хотя бы одну точку для списка.' });
      return;
    }

    try {
      setLoading(true);

      const formattedDate = formatLocalDate(selectedDate);
      const orderedSelectedPointIds = visiblePoints
        .filter((point) => selectedPoints.includes(point.id))
        .map((point) => point.id);

      await api.createOrAppendHemotestPickupList(selectedDate, formattedDate, orderedSelectedPointIds);

      setFeedback({ type: 'success', text: `Точки сохранены (${orderedSelectedPointIds.length}).` });
      setSelectedPoints([]);
      setShowListForm(false);
    } catch (error) {
      console.error('Error creating list:', error);
      const message = error instanceof Error && error.message ? error.message : 'Неизвестная ошибка';
      setFeedback({ type: 'error', text: `Не удалось создать список: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPoint = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.address.trim()) {
      setFeedback({ type: 'error', text: 'Заполните название и адрес точки.' });
      return;
    }

    try {
      setLoading(true);

      if (editingPoint) {
        await api.post('/api/trpc/hemotest.updatePoint', {
          id: editingPoint.id,
          ...formData,
        });
      } else {
        const created = await api.createHemotestPoint(formData);
        const nextOrder = [...pointOrderIds, created.id];
        setPointOrderIds(nextOrder);
        saveNumberArray(POINT_ORDER_STORAGE_KEY, nextOrder);
      }

      closePointForm();
      await loadPoints();
    } catch (error) {
      console.error('Error saving point:', error);
      const message = error instanceof Error && error.message ? error.message : 'Неизвестная ошибка';
      setFeedback({ type: 'error', text: `Не удалось сохранить точку: ${message}` });
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
      {feedback && !confirmState && !showForm && !showListForm && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          role="status"
        >
          {feedback.text}
        </div>
      )}

      {showForm &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">
                {editingPoint ? 'Редактировать точку Гемотест' : 'Добавить точку Гемотест'}
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

                {feedback?.type === 'error' && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                    {feedback.text}
                  </div>
                )}

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

                {feedback?.type === 'error' && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                    {feedback.text}
                  </div>
                )}

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

      {confirmState &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {confirmState.kind === 'archive' ? 'Удалить точку из справочника?' : 'Убрать точку из списка?'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {confirmState.kind === 'archive'
                      ? <>Точка <span className="font-semibold text-slate-950">«{confirmState.point.name}»</span> перестанет предлагаться для новых списков и сборов. История выполненных сборов, старые списки, сверка и биллинг сохранятся.</>
                      : <>Точка <span className="font-semibold text-slate-950">«{confirmState.point.name}»</span> будет убрана только из рабочего списка на выбранную дату. Справочник точек не изменится.</>}
                  </p>
                </div>
              </div>

              {confirmError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                  {confirmError}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={actionBusy}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionBusy ? 'Выполняем...' : confirmState.kind === 'archive' ? 'Удалить' : 'Убрать из списка'}
                </button>

                <button type="button" onClick={closeConfirm} disabled={actionBusy} className={`flex-1 ${secondaryButtonClass}`}>
                  Отмена
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectablePoints.length > 0 && selectablePoints.every((point) => selectedPoints.includes(point.id))}
              onChange={handleSelectAll}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300"
            />

            <span className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Выбрано: {selectedPoints.length} из {selectablePoints.length}
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
              <div className="grid grid-cols-[36px_36px_minmax(150px,1fr)_minmax(220px,1.6fr)_minmax(96px,0.7fr)_280px] items-center border-b border-slate-200 bg-slate-50/95 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
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
                    className={`grid grid-cols-[36px_36px_minmax(150px,1fr)_minmax(220px,1.6fr)_minmax(96px,0.7fr)_280px] items-center gap-0 px-4 py-3 transition hover:bg-slate-50 ${
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
                      checked={!point.isArchived && selectedPoints.includes(point.id)}
                      onChange={() => handleTogglePoint(point.id)}
                      disabled={point.isArchived}
                      title={point.isArchived ? 'Точка в архиве — недоступна для новых списков' : undefined}
                      className="h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    />

                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-slate-950" title={point.name}>
                          {point.name}
                        </p>
                        {point.isArchived && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Архив
                          </span>
                        )}
                      </div>
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
                        onClick={() => openRemoveFromList(point)}
                        disabled={!point.listId || loading || actionBusy}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                        title={point.listId ? 'Убрать точку из рабочего списка на выбранную дату' : 'Точки нет в рабочем списке на выбранную дату'}
                      >
                        <ListMinus size={14} />
                        Из списка
                      </button>

                      <button
                        type="button"
                        onClick={() => openArchivePoint(point)}
                        disabled={loading || actionBusy || point.isArchived}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title={point.isArchived ? 'Точка уже удалена из справочника' : 'Удалить точку из справочника (история сборов сохранится)'}
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
