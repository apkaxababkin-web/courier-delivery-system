import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Download,
  ChevronRight,
  Search,
  Building2,
  Loader2,
  ArrowLeft,
  MapPin,
  Store,
} from 'lucide-react';
import * as api from '../lib/api';
import { formatLocalDate } from '../lib/local-time';

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

interface ClientPoint {
  id: string;
  name: string;
  address: string;
  contactPerson?: string;
  phone?: string;
  isPrimary?: boolean;
}

interface PointFormData {
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
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

const taskStatusClass: Record<Task['status'], string> = {
  completed: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border border-red-200 bg-red-50 text-red-700',
  in_progress: 'border border-blue-200 bg-blue-50 text-blue-700',
  pending: 'border border-slate-200 bg-slate-100 text-slate-600',
};

const taskStatusLabel: Record<Task['status'], string> = {
  completed: 'Завершено',
  failed: 'Ошибка',
  in_progress: 'В процессе',
  pending: 'Ожидание',
};

const emptyPointForm: PointFormData = {
  name: '',
  address: '',
  contactPerson: '',
  phone: '',
};

function getClientPointsKey(clientId: number) {
  return `client-points:${clientId}`;
}

function getPrimaryPoint(client: Client): ClientPoint {
  return {
    id: 'primary',
    name: 'Основная точка',
    address: client.address,
    contactPerson: client.contactPerson,
    phone: client.phone,
    isPrimary: true,
  };
}

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [clientPoints, setClientPoints] = useState<ClientPoint[]>([]);
  const [showPointForm, setShowPointForm] = useState(false);
  const [pointFormData, setPointFormData] = useState<PointFormData>(emptyPointForm);
  const [searchQuery, setSearchQuery] = useState('');
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
      setClientTasks([]);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const loadClientPoints = (client: Client) => {
    try {
      const saved = localStorage.getItem(getClientPointsKey(client.id));
      const additionalPoints = saved ? (JSON.parse(saved) as ClientPoint[]) : [];
      setClientPoints([getPrimaryPoint(client), ...additionalPoints.filter((point) => !point.isPrimary)]);
    } catch (error) {
      console.error('Error loading client points:', error);
      setClientPoints([getPrimaryPoint(client)]);
    }
  };

  const saveClientPoints = (clientId: number, points: ClientPoint[]) => {
    const additionalPoints = points.filter((point) => !point.isPrimary);
    localStorage.setItem(getClientPointsKey(clientId), JSON.stringify(additionalPoints));
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
      localStorage.removeItem(getClientPointsKey(id));
      if (selectedClient?.id === id) setSelectedClient(null);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Ошибка при удалении клиента');
    }
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    loadClientTasks(client.id);
    loadClientPoints(client);
  };

  const handleAddPoint = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClient) return;

    if (!pointFormData.name.trim() || !pointFormData.address.trim()) {
      alert('Название точки и адрес обязательны');
      return;
    }

    const nextPoints = [
      ...clientPoints,
      {
        id: `${Date.now()}`,
        name: pointFormData.name.trim(),
        address: pointFormData.address.trim(),
        contactPerson: pointFormData.contactPerson.trim() || undefined,
        phone: pointFormData.phone.trim() || undefined,
      },
    ];

    setClientPoints(nextPoints);
    saveClientPoints(selectedClient.id, nextPoints);
    setPointFormData(emptyPointForm);
    setShowPointForm(false);
  };

  const handleDeletePoint = (pointId: string) => {
    if (!selectedClient) return;
    const point = clientPoints.find((item) => item.id === pointId);
    if (!point || point.isPrimary) return;
    if (!confirm('Удалить эту точку клиента?')) return;

    const nextPoints = clientPoints.filter((item) => item.id !== pointId);
    setClientPoints(nextPoints);
    saveClientPoints(selectedClient.id, nextPoints);
  };

  const handleExport = async () => {
    if (!selectedClient) return;

    try {
      alert('Отчёт будет загружен (функция в разработке)');
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Ошибка при экспорте отчёта');
    }
  };

  const toggleField = (fieldId: string) => {
    setExportFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, selected: !f.selected } : f))
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

  const filteredClients = clients.filter((client) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return [client.name, client.address, client.phone, client.contactPerson, client.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  if (selectedClient) {
    const stats = {
      total: clientTasks.length,
      completed: clientTasks.filter((t) => t.status === 'completed').length,
      inProgress: clientTasks.filter((t) => t.status === 'in_progress').length,
      failed: clientTasks.filter((t) => t.status === 'failed').length,
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              onClick={() => setSelectedClient(null)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedClient.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Клиентская карточка, точки и история заявок.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setShowPointForm(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Добавить точку
            </button>

            <button
              onClick={() => setShowExportForm(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95"
            >
              <Download className="h-4 w-4" />
              Экспортировать
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-950">Основная информация</h2>
              <p className="mt-1 text-xs text-slate-500">Базовая карточка клиента.</p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <InfoItem label="Основной адрес" value={selectedClient.address} icon={<MapPin className="h-4 w-4" />} className="sm:col-span-2" />
              <InfoItem label="Контактное лицо" value={selectedClient.contactPerson || '—'} />
              <InfoItem label="Телефон" value={selectedClient.phone || '—'} />
              <InfoItem label="Email" value={selectedClient.email || '—'} className="sm:col-span-2" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ['Всего заявок', stats.total, 'border-slate-200 bg-white text-slate-950'],
              ['В процессе', stats.inProgress, 'border-blue-200 bg-blue-50 text-blue-700'],
              ['Завершено', stats.completed, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
              ['Ошибки', stats.failed, 'border-red-200 bg-red-50 text-red-700'],
            ].map(([label, value, className]) => (
              <div key={label} className={`rounded-2xl border p-4 shadow-sm ${className}`}>
                <p className="text-xs font-medium opacity-75">{label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Точки и магазины клиента</h2>
              <p className="mt-1 text-xs text-slate-500">У одного клиента может быть несколько адресов, магазинов или точек забора.</p>
            </div>
            <button
              onClick={() => setShowPointForm(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white shadow-sm hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              Добавить магазин
            </button>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {clientPoints.map((point) => (
              <div key={point.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                      <Store className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{point.name}</p>
                      {point.isPrimary && <p className="text-xs text-slate-500">Основная точка клиента</p>}
                    </div>
                  </div>

                  {!point.isPrimary && (
                    <button
                      onClick={() => handleDeletePoint(point.id)}
                      className="rounded-xl border border-red-200 bg-white p-2 text-red-600 shadow-sm hover:bg-red-50"
                      title="Удалить точку"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <p className="text-sm text-slate-700">{point.address}</p>
                {(point.contactPerson || point.phone) && (
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    {point.contactPerson && <p>Контакт: {point.contactPerson}</p>}
                    {point.phone && <p>Телефон: {point.phone}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Заявки клиента</h2>
            <p className="mt-1 text-xs text-slate-500">История и статусы заявок по выбранному клиенту.</p>
          </div>

          {clientTasks.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center text-slate-500">
              <Building2 className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-950">Нет заявок для этого клиента</p>
              <p className="mt-1 text-sm text-slate-500">Когда появятся заявки, они будут отображаться здесь.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Получатель</th>
                    <th className="px-5 py-3 font-semibold">Адрес</th>
                    <th className="px-5 py-3 font-semibold">Статус</th>
                    <th className="px-5 py-3 font-semibold">Дата создания</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-950">#{task.id}</td>
                      <td className="px-5 py-4 text-slate-700">{task.recipientName}</td>
                      <td className="px-5 py-4 text-slate-600">{task.deliveryAddress}</td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusClass[task.status]}`}>{taskStatusLabel[task.status]}</span></td>
                      <td className="px-5 py-4 text-slate-500">{formatLocalDate(task.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showPointForm && createPortal(
          <div className="modal-overlay">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-950">Добавить точку</h3>
                  <p className="mt-1 text-sm text-slate-500">Магазин, склад или адрес забора клиента.</p>
                </div>
                <button onClick={() => setShowPointForm(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"><X size={18} /></button>
              </div>

              <form onSubmit={handleAddPoint} className="space-y-4">
                {[
                  ['name', 'Название точки *', 'Магазин на Ленина', 'text'],
                  ['address', 'Адрес *', 'ул. Ленина, 10', 'text'],
                  ['contactPerson', 'Контактное лицо', 'Анна', 'text'],
                  ['phone', 'Телефон', '+7...', 'tel'],
                ].map(([field, label, placeholder, type]) => (
                  <div key={field}>
                    <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
                    <input
                      type={type}
                      value={pointFormData[field as keyof PointFormData]}
                      onChange={(e) => setPointFormData({ ...pointFormData, [field]: e.target.value })}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                      placeholder={placeholder}
                      required={field === 'name' || field === 'address'}
                    />
                  </div>
                ))}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white hover:opacity-95">Добавить</button>
                  <button type="button" onClick={() => setShowPointForm(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Отмена</button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

        {showExportForm && createPortal(
          <div className="modal-overlay">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-950">Выбор полей</h3>
                  <p className="mt-1 text-sm text-slate-500">Настройте экспорт клиентского отчёта.</p>
                </div>
                <button onClick={() => setShowExportForm(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"><X size={18} /></button>
              </div>

              <div className="mb-6 max-h-96 space-y-2 overflow-y-auto">
                {exportFields.map((field) => (
                  <label key={field.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-white">
                    <input type="checkbox" checked={field.selected} onChange={() => toggleField(field.id)} className="h-4 w-4 rounded border-slate-300" />
                    <span>{field.name}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={handleExport} className="flex-1 rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white hover:opacity-95">Скачать Excel</button>
                <button onClick={() => setShowExportForm(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Отмена</button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Клиенты</h1>
          <p className="mt-1 text-sm text-slate-500">Клиенты как компании, внутри которых могут быть магазины и точки.</p>
        </div>

        <button onClick={() => setShowForm(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95">
          <Plus className="h-4 w-4" />
          Добавить клиента
        </button>
      </div>

      {showForm && createPortal(
        <div className="modal-overlay">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">{editingId ? 'Редактировать клиента' : 'Добавить клиента'}</h3>
                <p className="mt-1 text-sm text-slate-500">Это основная карточка клиента.</p>
              </div>
              <button onClick={resetForm} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                ['name', 'Название клиента *', 'Основа движения', 'text'],
                ['address', 'Основной адрес *', 'ул. Калашникова, 17', 'text'],
                ['contactPerson', 'Контактное лицо', 'Иван Петров', 'text'],
                ['phone', 'Телефон', '+7 (914) 111-22-33', 'tel'],
                ['email', 'Email', 'info@example.com', 'email'],
              ].map(([field, label, placeholder, type]) => (
                <div key={field}>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
                  <input
                    type={type}
                    value={formData[field as keyof FormData]}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    placeholder={placeholder}
                    required={field === 'name' || field === 'address'}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white hover:opacity-95">{editingId ? 'Сохранить' : 'Добавить'}</button>
                <button type="button" onClick={resetForm} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Отмена</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по клиенту, адресу или телефону..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
            />
          </div>
          <div className="text-xs text-slate-400">{filteredClients.length} из {clients.length} клиентов</div>
        </div>

        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Загрузка клиентов...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <Building2 className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-950">Клиенты не найдены</p>
            <p className="mt-1 text-sm text-slate-500">Попробуйте изменить поиск или добавьте нового клиента.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Клиент</th>
                  <th className="px-5 py-3 font-semibold">Основной адрес</th>
                  <th className="px-5 py-3 font-semibold">Контактное лицо</th>
                  <th className="px-5 py-3 font-semibold">Телефон</th>
                  <th className="px-5 py-3 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="group hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <button onClick={() => handleViewClient(client)} className="text-left font-semibold text-slate-950 hover:text-blue-700">
                        {client.name}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">Нажмите, чтобы открыть магазины и точки</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{client.address}</td>
                    <td className="px-5 py-4 text-slate-600">{client.contactPerson || '-'}</td>
                    <td className="px-5 py-4 text-slate-600">{client.phone || '-'}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleViewClient(client)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-950" title="Открыть карточку клиента"><ChevronRight size={16} /></button>
                        <button onClick={() => handleEdit(client)} className="rounded-xl border border-slate-200 bg-white p-2 text-blue-600 shadow-sm hover:bg-blue-50" title="Редактировать"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(client.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-red-600 shadow-sm hover:bg-red-50" title="Удалить"><Trash2 size={16} /></button>
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
  );
}

function InfoItem({ label, value, icon, className = '' }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
