import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Upload, Trash2 } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Понедельник' },
  { id: 2, name: 'Вторник' },
  { id: 3, name: 'Среда' },
  { id: 4, name: 'Четверг' },
  { id: 5, name: 'Пятница' },
];

type Mode = 'all' | 'template';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
const dangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950';

export default function SberbankView() {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [mode, setMode] = useState<Mode>('template');
  const [selectedDay, setSelectedDay] = useState(1);
  const [templatePointIds, setTemplatePointIds] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [loading, setLoading] = useState(false);

  const selectedDayName = DAYS_OF_WEEK.find(day => day.id === selectedDay)?.name || 'День';
  const templatePoints = points.filter(point => templatePointIds.includes(point.id));

  useEffect(() => {
    loadPoints();
  }, []);

  useEffect(() => {
    if (mode === 'template') loadTemplate();
  }, [selectedDay, mode]);

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

  const loadTemplate = async () => {
    try {
      const data = await api.getSberbankScheduleForDay(selectedDay);
      setTemplatePointIds(data.map(point => point.id));
    } catch (error) {
      console.error('Error loading Sberbank template:', error);
      setTemplatePointIds([]);
    }
  };

  const saveTemplate = async (nextIds: number[]) => {
    setTemplatePointIds(nextIds);
    await api.setSberbankScheduleForDay(selectedDay, nextIds);
  };

  const handleToggleTemplatePoint = async (pointId: number) => {
    const nextIds = templatePointIds.includes(pointId)
      ? templatePointIds.filter(id => id !== pointId)
      : [...templatePointIds, pointId];

    try {
      await saveTemplate(nextIds);
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения шаблона');
      await loadTemplate();
    }
  };

  const handleSelectAllTemplate = async () => {
    const nextIds = templatePointIds.length === points.length ? [] : points.map(point => point.id);

    try {
      await saveTemplate(nextIds);
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения шаблона');
      await loadTemplate();
    }
  };

  const handlePublishTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (templatePointIds.length === 0) return alert('В шаблоне нет точек');

    try {
      setLoading(true);
      const today = new Date().toLocaleDateString('ru-RU');
      await api.createSberbankPickupList(selectedDay, `${selectedDayName} ${today}`, templatePointIds);
      setShowPublishForm(false);
      alert('Шаблон выложен в список для курьеров');
    } catch (error) {
      console.error('Error publishing Sberbank template:', error);
      alert('Ошибка при выкладке шаблона');
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
      await loadPoints();
      if (mode === 'template') await loadTemplate();
    } catch (error) {
      console.error('Error adding Sberbank point:', error);
      alert('Ошибка при добавлении точки');
    } finally {
      setLoading(false);
    }
  };

  const displayedPoints = mode === 'all' ? points : points;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <label className="mb-3 block text-xs font-semibold text-slate-500">Сбербанк</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'all' ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
              >
                Все точки
              </button>

              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    setMode('template');
                    setSelectedDay(day.id);
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'template' && selectedDay === day.id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                >
                  {day.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowForm(true)} className={secondaryButtonClass}>
              <Plus size={18} />
              Добавить точку
            </button>

            {mode === 'template' && (
              <button type="button" onClick={() => setShowPublishForm(true)} disabled={templatePointIds.length === 0} className={primaryButtonClass}>
                <Upload size={18} />
                Выложить в список
              </button>
            )}
          </div>
        </div>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Добавить точку Сбербанка</h3>
            <form onSubmit={handleAddPoint} className="mt-4 space-y-3">
              <input type="text" placeholder="Номер отделения" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} required />
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

      {showPublishForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Выложить шаблон в список</h3>
            <form onSubmit={handlePublishTemplate} className="mt-4 space-y-4">
              <p className="text-sm text-slate-700"><strong>Шаблон:</strong> {selectedDayName}</p>
              <p className="text-sm text-slate-500">Точек в шаблоне: {templatePointIds.length}</p>
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className={`flex-1 ${primaryButtonClass}`}>Выложить</button>
                <button type="button" onClick={() => setShowPublishForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">
              {mode === 'all' ? 'Все точки Сбербанка' : `Шаблон: ${selectedDayName}`}
            </h3>
            <p className="text-sm text-slate-500">
              {mode === 'all'
                ? `Всего точек: ${points.length}`
                : `Выбрано в шаблон: ${templatePointIds.length} из ${points.length}`}
            </p>
          </div>

          {mode === 'template' && (
            <button type="button" onClick={handleSelectAllTemplate} className={secondaryButtonClass}>
              {templatePointIds.length === points.length ? 'Снять все' : 'Выбрать все'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
        ) : displayedPoints.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Нет точек Сбербанка</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedPoints.map(point => (
              <div key={point.id} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                {mode === 'template' && (
                  <input
                    type="checkbox"
                    checked={templatePointIds.includes(point.id)}
                    onChange={() => handleToggleTemplatePoint(point.id)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-slate-950">{point.name}</h4>
                  <p className="text-sm text-slate-600">{point.address}</p>
                  {point.phone && <p className="text-xs text-slate-500">Тел: {point.phone}</p>}
                  {point.contactPerson && <p className="text-xs text-slate-500">{point.contactPerson}</p>}
                </div>

                {mode === 'template' && templatePointIds.includes(point.id) && (
                  <button type="button" onClick={() => handleToggleTemplatePoint(point.id)} className={dangerButtonClass}>
                    <Trash2 size={16} />
                    Убрать
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mode === 'template' && templatePoints.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Эти точки будут выложены курьерам после нажатия «Выложить в список».
        </div>
      )}
    </div>
  );
}
