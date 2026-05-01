import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, X, Download, ChevronRight } from 'lucide-react';
import * as api from '../lib/api';

interface Client {
  id: number;
  name: string;
  address: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
  email: string;
}

interface Task {
  id: number;
  clientId: number;
  recipientName: string;
  deliveryAddress: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

interface ExportField {
  id: string;
  name: string;
  selected: boolean;
  order: number;
}

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [showExportForm, setShowExportForm] = useState(false);
  const [exportFields, setExportFields] = useState<ExportField[]>([
    { id: 'id', name: 'ID заявки', selected: true, order: 1 },
    { id: 'recipientName', name: 'Получатель', selected: true, order: 2 },
    { id: 'deliveryAddress', name: 'Адрес доставки', selected: true, order: 3 },
    { id: 'status', name: 'Статус', selected: true, order: 4 },
    { id: 'createdAt', name: 'Дата создания', selected: true, order: 5 },
    { id: 'completedAt', name: 'Дата завершения', selected: false, order: 6 },
  ]);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await api.getAllClients();
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      alert('Ошибка при загрузке клиентов');
    } finally {
      setLoading(false);
    }
  };

  const loadClientTasks = async (_clientId: number) => {
    try {
      // TODO: Replace with actual API call
      // const data = await api.getClientTasks(clientId);
      // setClientTasks(data);
      setClientTasks([]);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    try {
      if (editingId) {
        await api.updateClient(editingId, formData);
      } else {
        await api.createClient(formData);
      }
      
      resetForm();
      loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Ошибка при сохранении клиента');
    }
  };

  const handleEdit = (client: Client) => {
    setFormData({
      name: client.name,
      address: client.address,
      contactPerson: client.contactPerson || '',
      phone: client.phone || '',
      email: client.email || '',
    });
    setEditingId(client.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены что хотите удалить этого клиента?')) return;

    try {
      await api.deleteClient(id);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Ошибка при удалении клиента');
    }
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    loadClientTasks(client.id);
  };

  const handleExport = async () => {
    if (!selectedClient) return;

    // TODO: Implement field selection for export

    try {
      // TODO: Replace with actual API call
      // await api.exportClientReport(selectedClient.id, []);
      
      alert('Отчёт будет загружен (функция в разработке)');
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Ошибка при экспорте отчёта');
    }
  };

  const toggleField = (fieldId: string) => {
    setExportFields(prev =>
      prev.map(f => f.id === fieldId ? { ...f, selected: !f.selected } : f)
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Client Details View
  if (selectedClient) {
    const stats = {
      total: clientTasks.length,
      completed: clientTasks.filter(t => t.status === 'completed').length,
      inProgress: clientTasks.filter(t => t.status === 'in_progress').length,
      failed: clientTasks.filter(t => t.status === 'failed').length,
    };

    return (
      <div className="p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedClient(null)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            ← Назад
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{selectedClient.name}</h2>
            <p className="text-gray-600 mt-1">{selectedClient.address}</p>
          </div>
          <button
            onClick={() => setShowExportForm(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            <Download size={20} />
            Экспортировать
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm font-medium">Всего заявок</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
          </div>

          <div className="bg-blue-50 rounded-lg shadow p-4 border border-blue-200">
            <div className="text-blue-700 text-sm font-medium">В процессе</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">{stats.inProgress}</div>
          </div>

          <div className="bg-green-50 rounded-lg shadow p-4 border border-green-200">
            <div className="text-green-700 text-sm font-medium">Завершено</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.completed}</div>
          </div>

          <div className="bg-red-50 rounded-lg shadow p-4 border border-red-200">
            <div className="text-red-700 text-sm font-medium">Ошибки</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{stats.failed}</div>
          </div>
        </div>

        {/* Tasks Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Заявки клиента</h3>
          </div>

          {clientTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Нет заявок для этого клиента
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Получатель</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Адрес</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Статус</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Дата создания</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clientTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">#{task.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{task.recipientName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{task.deliveryAddress}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : task.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : task.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {task.status === 'completed'
                            ? 'Завершено'
                            : task.status === 'failed'
                            ? 'Ошибка'
                            : task.status === 'in_progress'
                            ? 'В процессе'
                            : 'Ожидание'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(task.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Export Form Modal */}
        {showExportForm && createPortal(
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Выбор полей для экспорта</h3>
                <button
                  onClick={() => setShowExportForm(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                {exportFields.map((field) => (
                  <label key={field.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.selected}
                      onChange={() => toggleField(field.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{field.name}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleExport}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
                >
                  Скачать Excel
                </button>
                <button
                  onClick={() => setShowExportForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        , document.body)}
      </div>
    );
  }

  // Clients List View
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-7xl">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Клиенты</h2>
        <p className="text-gray-600 mt-2">Управление клиентами и их заявками</p>
      </div>
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold text-lg"
        >
          <Plus size={20} />
          Добавить клиента
        </button>
      </div>

      {/* Form Modal */}
      {showForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {editingId ? 'Редактировать клиента' : 'Добавить клиента'}
              </h3>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Основа движения"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Адрес *
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ул. Калашникова, 17"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Контактное лицо
                </label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Иван Петров"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Телефон
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+7 (914) 111-22-33"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="info@example.com"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  {editingId ? 'Сохранить' : 'Добавить'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {/* Clients List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Загрузка...</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>Нет добавленных клиентов</p>
            <p className="text-sm mt-2">Нажмите кнопку "Добавить клиента" чтобы начать</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Название</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Адрес</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Контактное лицо</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Телефон</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{client.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.address}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.contactPerson || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewClient(client)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                          title="Просмотреть и экспортировать"
                        >
                          <ChevronRight size={18} />
                        </button>
                        <button
                          onClick={() => handleEdit(client)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
