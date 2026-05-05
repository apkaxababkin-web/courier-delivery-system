import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, MapPin, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface Task {
  id: number;
  status: string;
  senderName: string;
  deliveryAddress: string;
  createdAt: string;
}

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/api/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="w-4 h-4" />;
      case 'in_progress':
        return <Clock className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CourierApp</h1>
            <p className="text-sm text-gray-600">Добро пожаловать, {user?.name}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
            Выход
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <p className="text-gray-600 text-sm">Всего заявок</p>
            <p className="text-3xl font-bold text-gray-900">{tasks.length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <p className="text-gray-600 text-sm">В работе</p>
            <p className="text-3xl font-bold text-blue-600">{tasks.filter(t => t.status === 'in_progress').length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <p className="text-gray-600 text-sm">Завершено</p>
            <p className="text-3xl font-bold text-green-600">{tasks.filter(t => t.status === 'completed').length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <p className="text-gray-600 text-sm">Ожидает</p>
            <p className="text-3xl font-bold text-yellow-600">{tasks.filter(t => t.status === 'pending').length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {['all', 'pending', 'in_progress', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {status === 'all' ? 'Все' : status === 'pending' ? 'Ожидают' : status === 'in_progress' ? 'В работе' : 'Завершено'}
            </button>
          ))}
        </div>

        {/* Tasks List */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Загрузка...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Нет заявок</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map(task => (
              <div
                key={task.id}
                className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
                        {getStatusIcon(task.status)}
                        {task.status === 'pending' ? 'Ожидает' : task.status === 'in_progress' ? 'В работе' : task.status === 'completed' ? 'Завершено' : task.status}
                      </span>
                    </div>
                    <p className="text-gray-900 font-semibold">#{task.id}</p>
                    <p className="text-gray-600 text-sm mt-1">От: {task.senderName}</p>
                    <p className="text-gray-600 text-sm">Адрес: {task.deliveryAddress}</p>
                    <p className="text-gray-500 text-xs mt-2">{new Date(task.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Подробнее
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
