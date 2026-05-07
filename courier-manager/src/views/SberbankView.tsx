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
    <div className="p-6">
      {/* Day Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Выберите день недели
        </label>
        <div className="grid grid-cols-5 gap-2">
          {DAYS_OF_WEEK.map(day => (
            <button
              key={day.id}
              onClick={() => setSelectedDay(day.id)}
              className={`py-2 px-3 rounded-lg font-medium transition ${
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

      {/* Header with actions */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          Добавить точку
        </button>

        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          <Download size={20} />
          Отчёт
        </button>
      </div>

      {/* Add Point Form Modal */}
      {showForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Добавить точку Сбербанка</h3>

            <form onSubmit={handleAddPoint} className="space-y-4">
              <input
                type="text"
                placeholder="Название точки *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />

              <input
                type="text"
                placeholder="Адрес *"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />

              <input
                type="tel"
                placeholder="Телефон"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="Контактное лицо"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {/* Create List Form Modal */}
      {showListForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Создать список</h3>

            <form onSubmit={handleCreateList} className="space-y-4">
              <p className="text-sm text-gray-700">
                <strong>Название:</strong> {new Date().toLocaleDateString('ru-RU')}
              </p>

              <p className="text-sm text-gray-600">
                Выбрано точек: {selectedPoints.length}
              </p>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setShowListForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {/* Created Lists */}
      {lists.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Созданные списки</h3>
          <div className="space-y-2">
            {lists.map(list => (
              <div key={list.id} className="bg-white rounded-lg shadow border border-gray-200">
                <button
                  onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="text-left">
                    <h4 className="font-semibold text-gray-900">{list.name}</h4>
                    <p className="text-sm text-gray-500">{new Date(list.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  {expandedListId === list.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>

                {expandedListId === list.id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-900 mb-2">Точки в списке:</h5>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {/* List items would be shown here */}
                        <p className="text-sm text-gray-600">Точки загружаются...</p>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Добавить новую точку:</h5>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddPointToList(list.id, parseInt(e.target.value));
                            e.target.value = '';
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Выберите точку...</option>
                        {points.map(point => (
                          <option key={point.id} value={point.id}>
                            {point.name} - {point.address}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points List for creating new list */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              checked={selectedPoints.length === points.length && points.length > 0}
              onChange={handleSelectAll}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-gray-700">
              Выбрано: {selectedPoints.length} из {points.length}
            </span>
          </div>
          {selectedPoints.length > 0 && (
            <button
              onClick={() => setShowListForm(true)}
              className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition"
            >
              Создать список
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Загрузка...</div>
        ) : points.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Нет точек Сбербанка. Добавьте первую точку.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {points.map((point) => (
              <div key={point.id} className="p-4 flex items-start gap-4 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedPoints.includes(point.id)}
                  onChange={() => handleTogglePoint(point.id)}
                  className="w-5 h-5 text-blue-600 rounded mt-1 cursor-pointer"
                />

                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{point.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{point.address}</p>
                  {point.contactPerson && (
                    <p className="text-sm text-gray-600">Контакт: {point.contactPerson}</p>
                  )}
                  {point.phone && (
                    <p className="text-sm text-gray-600">Телефон: {point.phone}</p>
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
