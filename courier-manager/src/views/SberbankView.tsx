import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Download, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Понедельник' },
  { id: 2, name: 'Вторник' },
  { id: 3, name: 'Среда' },
  { id: 4, name: 'Четверг' },
  { id: 5, name: 'Пятница' },
];

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100';

export default function SberbankView() {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [lists, setLists] = useState<api.SberbankPickupList[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '', contactPerson: '' });
  const [loading, setLoading] = useState(false);

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
    if (selectedPoints.length === 0) return alert('Выберите хотя бы одну точку');

    try {
      setLoading(true);
      await api.createSberbankPickupList(selectedDay, new Date().toLocaleDateString('ru-RU'), selectedPoints);
      setSelectedPoints([]);
      setShowListForm(false);
      loadLists();
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.createSberbankPoint(formData);
      setFormData({ name: '', address: '', phone: '', contactPerson: '' });
      setShowForm(false);
      loadPoints();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

        <div className="mt-4 flex flex-wrap gap-2">
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

      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Добавить точку Сбербанка</h3>
            <form onSubmit={handleAddPoint} className="mt-4 space-y-3">
              <input type="text" placeholder="Название точки" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} required />
              <input type="text" placeholder="Адрес" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} required />
              <input type="text" placeholder="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Контактное лицо" value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} className={inputClass} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className={`flex-1 ${primaryButtonClass}`}>Добавить</button>
                <button type="button" onClick={() => setShowForm(false)} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <input type="checkbox" checked={selectedPoints.length === points.length && points.length > 0} onChange={handleSelectAll} className="h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300" />
            <span className="text-sm font-medium text-slate-700">Выбрано: {selectedPoints.length} из {points.length}</span>
          </div>

          {selectedPoints.length > 0 && (
            <button onClick={() => setShowListForm(true)} className={primaryButtonClass}>Создать список</button>
          )}
        </div>

        {points.map(point => (
          <div key={point.id} className="flex items-start gap-4 border-b border-slate-100 p-4 hover:bg-slate-50">
            <input type="checkbox" checked={selectedPoints.includes(point.id)} onChange={() => handleTogglePoint(point.id)} className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-300" />
            <div className="flex-1">
              <h4 className="font-semibold text-slate-950">{point.name}</h4>
              <p className="text-sm text-slate-600">{point.address}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
