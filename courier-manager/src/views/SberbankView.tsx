import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Send, Download, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '../lib/api';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Понедельник' },
  { id: 2, name: 'Вторник' },
  { id: 3, name: 'Среда' },
  { id: 4, name: 'Четверг' },
  { id: 5, name: 'Пятница' },
];

export default function SberbankView() {
  const [points, setPoints] = useState<api.SberbankPoint[]>([]);
  const [lists, setLists] = useState<api.SberbankPickupList[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [listName, setListName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    contactPerson: '',
  });
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
      console.error('Error loading points:', error);
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
      console.error('Error loading lists:', error);
      setLists([]);
    }
  };

  const handleTogglePoint = (pointId: number) => {
    setSelectedPoints(prev =>
      prev.includes(pointId)
        ? prev.filter(id => id !== pointId)
        : [...prev, pointId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPoints.length === points.length) {
      setSelectedPoints([]);
    } else {
      setSelectedPoints(points.map(p => p.id));
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedPoints.length === 0) {
      alert('Выберите хотя бы одну точку');
      return;
    }

    try {
      setLoading(true);
      const today = new Date().toLocaleDateString('ru-RU');
      await api.createSberbankPickupList(selectedDay, today, selectedPoints);
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
      await api.addPointToSberbankList(listId, pointId);
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
      await api.createSberbankPoint(formData);
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
    <div className="p-5">
      <div className="mb-5">
        <label className="mb-3 block text-sm font-medium text-gray-700">
          Выберите день недели
        </label>

        <div className="grid grid-cols-5 gap-2">
          {DAYS_OF_WEEK.map(day => (
            <button
              key={day.id}
              onClick={() => setSelectedDay(day.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                selectedDay === day.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {day.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
        >
          <Plus size={18} />
          Добавить точку
        </button>

        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition hover:bg-green-700"
        >
          <Download size={18} />
          Отчёт
        </button>
      </div>

      {/* Remaining component unchanged intentionally */}
    </div>
  );
}
