import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Save } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Понедельник' },
  { id: 2, name: 'Вторник' },
  { id: 3, name: 'Среда' },
  { id: 4, name: 'Четверг' },
  { id: 5, name: 'Пятница' },
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50';

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100';

export default function SberbankView() {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);

  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
  });

  useEffect(() => {
    loadPoints();
  }, []);

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

  const handleSelectTemplate = async (dayId: number) => {
    try {
      const templatePoints = await api.getSberbankScheduleForDay(dayId);

      setSelectedTemplateDay(dayId);
      setSelectedPoints(templatePoints.map((point) => point.id));
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

      const title =
        selectedTemplateDay !== null
          ? DAYS_OF_WEEK.find((d) => d.id === selectedTemplateDay)?.name || 'Список'
          : 'Список';

      await api.createSberbankPickupList(
        selectedTemplateDay || 1,
        `${title} ${new Date().toLocaleDateString('ru-RU')}`,
        selectedPoints
      );

      alert('Список создан');
    } catch (error) {
      console.error(error);
      alert('Ошибка создания списка');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (dayId: number) => {
    try {
      setLoading(true);

      await api.setSberbankScheduleForDay(dayId, selectedPoints);

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

  const handleAddPoint = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Заполните номер отделения и адрес');
      return;
    }

    try {
      setLoading(true);

      await api.createSberbankPoint(formData);

      setFormData({
        name: '',
        address: '',
        phone: '',
        contactPerson: '',
      });

      setShowForm(false);

      await loadPoints();
    } catch (error) {
      console.error(error);
      alert('Ошибка добавления точки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <label className="mb-3 block text-xs font-semibold text-slate-500">
              Шаблоны
            </label>

            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => handleSelectTemplate(day.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    selectedTemplateDay === day.id
                      ? 'bg-slate-950 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {day.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={secondaryButtonClass}
            >
              <Plus size={18} />
              Добавить точку
            </button>

            <button
              type="button"
              onClick={() => setShowSaveTemplateModal(true)}
              className={secondaryButtonClass}
            >
              <Save size={18} />
              Сохранить как шаблон
            </button>

            <button
              type="button"
              onClick={handleCreateList}
              disabled={selectedPoints.length === 0}
              className={primaryButtonClass}
            >
              Создать список
            </button>
          </div>
        </div>
      </div>

      {showSaveTemplateModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-950">
                Сохранить как шаблон
              </h3>

              <div className="mt-4 space-y-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => handleSaveTemplate(day.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span>{day.name}</span>
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
                Добавить точку Сбербанка
              </h3>

              <form onSubmit={handleAddPoint} className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Номер отделения"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={inputClass}
                  required
                />

                <input
                  type="text"
                  placeholder="Адрес"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className={inputClass}
                  required
                />

                <input
                  type="text"
                  placeholder="Телефон"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className={inputClass}
                />

                <input
                  type="text"
                  placeholder="Комментарий"
                  value={formData.contactPerson}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactPerson: e.target.value,
                    })
                  }
                  className={inputClass}
                />

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className={`flex-1 ${primaryButtonClass}`}
                  >
                    Добавить
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className={`flex-1 ${secondaryButtonClass}`}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <span className="text-sm font-medium text-slate-700">
            Выбрано: {selectedPoints.length} из {points.length}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Загрузка...
          </div>
        ) : points.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Нет точек Сбербанка
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {points.map((point) => (
              <div
                key={point.id}
                className="flex items-start gap-4 p-4 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedPoints.includes(point.id)}
                  onChange={() => handleTogglePoint(point.id)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                />

                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-slate-950">
                    {point.name}
                  </h4>

                  <p className="text-sm text-slate-600">
                    {point.address}
                  </p>

                  {point.phone && (
                    <p className="text-xs text-slate-500">
                      Тел: {point.phone}
                    </p>
                  )}

                  {point.contactPerson && (
                    <p className="text-xs text-slate-500">
                      {point.contactPerson}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
