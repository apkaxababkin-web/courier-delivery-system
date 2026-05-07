import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Download, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Понедельник' },
  { id: 2, name: 'Вторник' },
  { id: 3, name: 'Среда' },
  { id: 4, name: 'Четверг' },
  { id: 5, name: 'Пятница' },
];

const HIDDEN_POINTS_STORAGE_KEY = 'courier-manager:hidden-sberbank-points';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
const dangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950';

const readHiddenPointIds = () => {
  if (typeof window === 'undefined') return [] as number[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_POINTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(Number(id))).map(Number) : [];
  } catch {
    return [];
  }
};

export default function SberbankView() {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [hiddenPointIds, setHiddenPointIds] = useState<number[]>(readHiddenPointIds);
  const [lists, setLists] = useState<api.SberbankPickupList[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [loading, setLoading] = useState(false);

  const visiblePoints = points.filter((point) => !hiddenPointIds.includes(point.id));

  useEffect(() => {
    loadPoints();
    loadLists();
  }, [selectedDay]);

  const loadPoints = async () => {
    try {
      setLoading(true);
      const data = await api.getAllSberbankPoints();
      setPoints(data);
    } catch (error) {
      console.error('Error loading Sberbank points:', error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const data = await api.getSberbankListsForDay(selectedDay);
      setLists(data);
    } catch (error) {
      console.error('Error loading Sberbank lists:', error);
      setLists([]);
    }
  };

  const handleTogglePoint = (pointId: number) => {
    setSelectedPoints(prev => prev.includes(pointId) ? prev.filter(id => id !== pointId) : [...prev, pointId]);
  };

  const handleSelectAll = () => {
    if (selectedPoints.length === visiblePoints.length) setSelectedPoints([]);
    else setSelectedPoints(visiblePoints.map(p => p.id));
  };

  const handleHidePoint = (point: api.SberbankPoint) => {
    if (!window.confirm(`Удалить точку «${point.name}» из рабочего списка?`)) return;
    const nextHiddenIds = Array.from(new Set([...hiddenPointIds, point.id]));
    setHiddenPointIds(nextHiddenIds);
    window.localStorage.setItem(HIDDEN_POINTS_STORAGE_KEY, JSON.stringify(nextHiddenIds));
    setSelectedPoints((prev) => prev.filter((id) => id !== point.id));
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPoints.length === 0) return alert('Выберите хотя бы одну точку');

    try {
      setLoading(true);
      await api.createSberbankPickupList(selectedDay, new Date().toLocaleDateString('ru-RU'), selectedPoints);
      setSelectedPoints([]);
      setShowListForm(false);
      loadLists();
    } catch (error) {
      console.error('Error creating Sberbank list:', error);
      alert('Ошибка при создании списка');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Заполните номер отделения и адрес');
      return;
    }

    try {
      setLoading(true);
      await api.createSberbankPoint(formData);
      setFormData({ name: '', address: '', phone: '', contactPerson: '' });
      setShowForm(false);
      loadPoints();
    } catch (error) {
      console.error('Error adding Sberbank point:', error);
      alert('Ошибка при добавлении точки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <label className="mb-3 block text-xs font-semibold text-slate-500">День недели</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.id}
                  onClick={() => setSelectedDay(day.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${selectedDay === day.id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                >
                  {day.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
            <button onClick={() => setShowForm(true)} className={primaryButtonClass}>
              <Plus size={18} />
              Добавить точку
            </button>

            <button className={secondaryButtonClass}>
              <Download size={18} />
              Отчёт
            </button>
          </div>
        </div>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Добавить точку Сбербанка</h3>
            <form onSubmit={handleAddPoint} className="mt-4 space-y-3">
              <input type="text" placeholder="Номер отделения, например 8601/0105" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} required />
              <input type="text" placeholder="Адрес" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} required />
              <input type="text" placeholder="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Комментарий" value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} className={inputClass} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className={`flex-1 ${primaryButtonClass}`}>Добавить</button>
                <button type="button" onClick={() => setShowForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {showListForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Создать список</h3>
            <form onSubmit={handleCreateList} className="mt-4 space-y-4">
              <p className="text-sm text-slate-700"><strong>День:</strong> {DAYS_OF_WEEK.find(day => day.id === selectedDay)?.name}</p>
              <p className="text-sm text-slate-500">Выбрано точек: {selectedPoints.length}</p>
              <div className="flex gap-2">
                <button type="submit" className={`flex-1 ${primaryButtonClass}`}>Создать</button>
                <button type="button" onClick={() => setShowListForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {lists.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">Созданные списки</h3>
          <div className="space-y-2">
            {lists.map(list => (
              <div key={list.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)} className="flex w-full items-center justify-between p-4 text-left transition hover:bg-slate-50">
                  <div>
                    <h4 className="font-semibold text-slate-950">{list.name}</h4>
                    <p className="text-sm text-slate-500">{new Date(list.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  {expandedListId === list.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <input type="checkbox" checked={selectedPoints.length === visiblePoints.length && visiblePoints.length > 0} onChange={handleSelectAll} className="h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300" />
            <span className="text-sm font-medium text-slate-700">Выбрано: {selectedPoints.length} из {visiblePoints.length}</span>
          </div>

          {selectedPoints.length > 0 && (
            <button onClick={() => setShowListForm(true)} className={primaryButtonClass}>Создать список</button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
        ) : visiblePoints.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Нет точек Сбербанка</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visiblePoints.map(point => (
              <div key={point.id} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                <input type="checkbox" checked={selectedPoints.includes(point.id)} onChange={() => handleTogglePoint(point.id)} className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-slate-950">{point.name}</h4>
                  <p className="text-sm text-slate-600">{point.address}</p>
                  {point.phone && <p className="text-xs text-slate-500">Тел: {point.phone}</p>}
                  {point.contactPerson && <p className="text-xs text-slate-500">{point.contactPerson}</p>}
                </div>
                <button type="button" onClick={() => handleHidePoint(point)} className={dangerButtonClass} title="Убрать точку из списка">
                  <Trash2 size={16} />
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
