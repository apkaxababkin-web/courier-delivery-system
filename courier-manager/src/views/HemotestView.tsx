import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Download, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '../lib/api';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50';

export default function HemotestView() {
  const [points, setPoints] = useState<api.HemotestPoint[]>([]);
  const [lists, setLists] = useState<api.HemotestPickupList[]>([]);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [listName, setListName] = useState('');
  const [formData, setFormData] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPoints();
    loadLists();
  }, [selectedDate]);

  const loadPoints = async () => {
    try {
      setLoading(true);
      const data = await api.getAllHemotestPoints();
      setPoints(data);
    } catch (error) {
      console.error('Error loading points:', error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const data = await api.getHemotestListsForDate(selectedDate);
      setLists(data);
    } catch (error) {
      console.error('Error loading lists:', error);
      setLists([]);
    }
  };

  const handleTogglePoint = (pointId: number) => {
    setSelectedPoints(prev => prev.includes(pointId) ? prev.filter(id => id !== pointId) : [...prev, pointId]);
  };

  const handleSelectAll = () => {
    if (selectedPoints.length === points.length) setSelectedPoints([]);
    else setSelectedPoints(points.map(p => p.id));
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPoints.length === 0) {
      alert('Выберите хотя бы одну точку');
      return;
    }

    try {
      setLoading(true);
      const formattedDate = new Date(selectedDate).toLocaleDateString('ru-RU');
      await api.createHemotestPickupList(selectedDate, formattedDate, selectedPoints);
      alert(`Список создан (${selectedPoints.length} точек)`);
      setListName('');
      setSelectedPoints([]);
      setShowListForm(false);
      loadLists();
    } catch (error) {
      console.error('Error creating list:', error);
      alert('Ошибка при создании списка');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPointToList = async (listId: number, pointId: number) => {
    try {
      setLoading(true);
      await api.addPointToHemotestList(listId, pointId);
      alert('Точка добавлена в список');
      loadLists();
    } catch (error) {
      console.error('Error adding point to list:', error);
      alert('Ошибка при добавлении точки');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Заполните название и адрес');
      return;
    }

    try {
      setLoading(true);
      await api.createHemotestPoint(formData);
      alert('Точка добавлена');
      setFormData({ name: '', address: '', phone: '', contactPerson: '' });
      setShowForm(false);
      loadPoints();
    } catch (error) {
      console.error('Error adding point:', error);
      alert('Ошибка при добавлении точки');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    try {
      alert('Отчёт будет загружен (функция в разработке)');
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Ошибка при экспорте отчёта');
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Дата</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={inputClass} />
        </div>

        <button onClick={() => setShowForm(true)} className={primaryButtonClass}>
          <Plus size={18} />
          Добавить точку
        </button>

        <button onClick={handleExportReport} className={secondaryButtonClass}>
          <Download size={18} />
          Отчёт
        </button>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Добавить точку Гемотест</h3>
            <form onSubmit={handleAddPoint} className="mt-4 space-y-3">
              <input type="text" placeholder="Название точки *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} required />
              <input type="text" placeholder="Адрес *" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} required />
              <input type="tel" placeholder="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Контактное лицо" value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} className={inputClass} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className={`flex-1 ${primaryButtonClass}`}>Добавить</button>
                <button type="button" onClick={() => setShowForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showListForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Создать список</h3>
            <form onSubmit={handleCreateList} className="mt-4 space-y-4">
              <p className="text-sm text-slate-700"><strong>Название:</strong> {new Date(selectedDate).toLocaleDateString('ru-RU')}</p>
              <p className="text-sm text-slate-500">Выбрано точек: {selectedPoints.length}</p>
              <div className="flex gap-2">
                <button type="submit" className={`flex-1 ${primaryButtonClass}`}>Создать</button>
                <button type="button" onClick={() => setShowListForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
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

                {expandedListId === list.id && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4">
                      <h5 className="mb-2 font-medium text-slate-950">Точки в списке:</h5>
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        <p className="text-sm text-slate-600">Точки загружаются...</p>
                      </div>
                    </div>
                    <div>
                      <h5 className="mb-2 font-medium text-slate-950">Добавить новую точку:</h5>
                      <select onChange={(e) => { if (e.target.value) { handleAddPointToList(list.id, parseInt(e.target.value)); e.target.value = ''; } }} className={inputClass}>
                        <option value="">Выберите точку...</option>
                        {points.map(point => <option key={point.id} value={point.id}>{point.name} - {point.address}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <input type="checkbox" checked={selectedPoints.length === points.length && points.length > 0} onChange={handleSelectAll} className="h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300" />
            <span className="text-sm font-medium text-slate-700">Выбрано: {selectedPoints.length} из {points.length}</span>
          </div>
          {selectedPoints.length > 0 && (
            <button onClick={() => setShowListForm(true)} className={primaryButtonClass}>Создать список</button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
        ) : points.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Нет сохранённых точек</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {points.map(point => (
              <div key={point.id} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                <input type="checkbox" checked={selectedPoints.includes(point.id)} onChange={() => handleTogglePoint(point.id)} className="mt-1 h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-2 focus:ring-slate-300" />
                <div className="flex-1">
                  <h4 className="font-medium text-slate-950">{point.name}</h4>
                  <p className="text-sm text-slate-600">{point.address}</p>
                  {point.phone && <p className="text-sm text-slate-500">Тел: {point.phone}</p>}
                  {point.contactPerson && <p className="text-sm text-slate-500">Контакт: {point.contactPerson}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
