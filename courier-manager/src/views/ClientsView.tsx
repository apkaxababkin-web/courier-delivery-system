import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, X, Download, ChevronRight } from 'lucide-react';
import * as api from '../lib/api';
import { useManagerRealtime } from '../lib/useManagerRealtime';
import { RealtimeStatusCard } from '../components/RealtimeStatusCard';

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

interface ClientRequest {
  id: number;
  clientId?: number;
  recipientName?: string;
  deliveryAddress?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  completedAt?: string;
}

const EXPORT_FIELDS = [
  { id: 'id', name: 'ID заявки' },
  { id: 'recipientName', name: 'Получатель' },
  { id: 'deliveryAddress', name: 'Адрес доставки' },
  { id: 'status', name: 'Статус' },
  { id: 'createdAt', name: 'Дата создания' },
  { id: 'completedAt', name: 'Дата завершения' },
];

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportClientCsv(client: Client, rows: ClientRequest[], selectedFields: string[]) {
  const fields = EXPORT_FIELDS.filter((field) => selectedFields.includes(field.id));
  const header = fields.map((field) => csvCell(field.name)).join(',');
  const body = rows.map((row) => fields.map((field) => csvCell((row as any)[field.id])).join(',')).join('\n');
  const csv = [header, body].filter(Boolean).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `client_${client.id}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ClientsView() {
  const realtime = useManagerRealtime(5000);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showExportForm, setShowExportForm] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(EXPORT_FIELDS.slice(0, 5).map((field) => field.id));
  const [formData, setFormData] = useState<FormData>({ name: '', address: '', contactPerson: '', phone: '', email: '' });

  useEffect(() => {
    loadClients();
  }, []);

  const requests = (realtime.snapshot?.requests ?? []) as ClientRequest[];
  const clientRequests = useMemo(() => {
    if (!selectedClient) return [];
    return requests.filter((request) => request.clientId === selectedClient.id);
  }, [requests, selectedClient]);

  const loadClients = async () => {
    try {
      setLoading(true);
      setClients(await api.getAllClients());
    } catch (error) {
      console.error('Error loading clients:', error);
      alert('Ошибка при загрузке клиентов');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }
    try {
      if (editingId) await api.updateClient(editingId, formData);
      else await api.createClient(formData);
      resetForm();
      await loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Ошибка при сохранении клиента');
    }
  };

  const handleEdit = (client: Client) => {
    setFormData({ name: client.name, address: client.address, contactPerson: client.contactPerson || '', phone: client.phone || '', email: client.email || '' });
    setEditingId(client.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены что хотите удалить этого клиента?')) return;
    try {
      await api.deleteClient(id);
      await loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Ошибка при удалении клиента');
    }
  };

  const handleExport = () => {
    if (!selectedClient) return;
    exportClientCsv(selectedClient, clientRequests, selectedExportFields);
    setShowExportForm(false);
  };

  const toggleField = (fieldId: string) => {
    setSelectedExportFields((prev) => prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]);
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', contactPerson: '', phone: '', email: '' });
    setEditingId(null);
    setShowForm(false);
  };

  if (selectedClient) {
    const stats = {
      total: clientRequests.length,
      completed: clientRequests.filter((request) => request.status === 'completed').length,
      inProgress: clientRequests.filter((request) => request.status === 'in_progress').length,
      failed: clientRequests.filter((request) => request.status === 'failed' || request.status === 'cancelled').length,
    };

    return (
      <div className="space-y-6 p-8">
        <RealtimeStatusCard isRefreshing={realtime.isRefreshing} error={realtime.error} lastSyncAt={realtime.lastSyncAt} onRefresh={() => realtime.refresh(true)} />

        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedClient(null)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← Назад</button>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900">{selectedClient.name}</h2>
            <p className="text-gray-600 mt-1">{selectedClient.address}</p>
          </div>
          <button onClick={() => setShowExportForm(true)} className="flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-700"><Download size={20} />Экспортировать</button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-sm font-medium text-gray-600">Всего заявок</div><div className="mt-2 text-3xl font-bold text-gray-900">{stats.total}</div></div>
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 shadow-sm"><div className="text-sm font-medium text-blue-700">В процессе</div><div className="mt-2 text-3xl font-bold text-blue-600">{stats.inProgress}</div></div>
          <div className="rounded-3xl border border-green-200 bg-green-50 p-4 shadow-sm"><div className="text-sm font-medium text-green-700">Завершено</div><div className="mt-2 text-3xl font-bold text-green-600">{stats.completed}</div></div>
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 shadow-sm"><div className="text-sm font-medium text-red-700">Ошибки/отмена</div><div className="mt-2 text-3xl font-bold text-red-600">{stats.failed}</div></div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4"><h3 className="font-semibold text-gray-900">Заявки клиента</h3></div>
          {clientRequests.length === 0 ? <div className="p-8 text-center text-gray-500">Нет заявок для этого клиента</div> : (
            <div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">ID</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Получатель</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Адрес</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Статус</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Дата создания</th></tr></thead><tbody className="divide-y divide-gray-200">{clientRequests.map((request) => <tr key={request.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-medium text-gray-900">#{request.id}</td><td className="px-6 py-4 text-sm text-gray-600">{request.recipientName || '-'}</td><td className="px-6 py-4 text-sm text-gray-600">{request.deliveryAddress || '-'}</td><td className="px-6 py-4"><span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{request.status}</span></td><td className="px-6 py-4 text-sm text-gray-600">{new Date(request.createdAt).toLocaleDateString('ru-RU')}</td></tr>)}</tbody></table></div>
          )}
        </div>

        {showExportForm && createPortal(<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold text-gray-900">Поля экспорта</h3><button onClick={() => setShowExportForm(false)} className="rounded-xl p-2 hover:bg-gray-100"><X size={20} /></button></div><div className="mb-6 max-h-96 space-y-3 overflow-y-auto">{EXPORT_FIELDS.map((field) => <label key={field.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50"><input type="checkbox" checked={selectedExportFields.includes(field.id)} onChange={() => toggleField(field.id)} className="h-4 w-4 rounded text-blue-600" /><span className="text-sm text-gray-700">{field.name}</span></label>)}</div><div className="flex gap-3"><button onClick={handleExport} className="flex-1 rounded-xl bg-green-600 py-2 font-medium text-white transition hover:bg-green-700">Скачать CSV</button><button onClick={() => setShowExportForm(false)} className="flex-1 rounded-xl bg-gray-200 py-2 font-medium text-gray-700 transition hover:bg-gray-300">Отмена</button></div></div></div>, document.body)}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl space-y-6 p-8">
        <RealtimeStatusCard isRefreshing={realtime.isRefreshing} error={realtime.error} lastSyncAt={realtime.lastSyncAt} onRefresh={() => realtime.refresh(true)} />

        <div className="flex items-center justify-between">
          <div><h2 className="text-3xl font-bold text-gray-900">Клиенты</h2><p className="mt-2 text-gray-600">Управление клиентами и их заявками</p></div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition hover:bg-blue-700"><Plus size={20} />Добавить клиента</button>
        </div>

        {showForm && createPortal(<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold text-gray-900">{editingId ? 'Редактировать клиента' : 'Добавить клиента'}</h3><button onClick={resetForm} className="rounded-xl p-2 hover:bg-gray-100"><X size={20} /></button></div><form onSubmit={handleSubmit} className="space-y-4"><input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="Название *" required /><input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="Адрес *" required /><input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="Контактное лицо" /><input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="Телефон" /><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="Email" /><div className="flex gap-3 pt-4"><button type="submit" className="flex-1 rounded-xl bg-blue-600 py-2 font-medium text-white hover:bg-blue-700">{editingId ? 'Сохранить' : 'Добавить'}</button><button type="button" onClick={resetForm} className="flex-1 rounded-xl bg-gray-200 py-2 font-medium text-gray-700 hover:bg-gray-300">Отмена</button></div></form></div></div>, document.body)}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="p-8 text-center text-gray-500">Загрузка...</div> : clients.length === 0 ? <div className="p-8 text-center text-gray-500"><p>Нет добавленных клиентов</p><p className="mt-2 text-sm">Нажмите кнопку Добавить клиента чтобы начать</p></div> : <div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Название</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Адрес</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Контактное лицо</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Телефон</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Заявки</th><th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Действия</th></tr></thead><tbody className="divide-y divide-gray-200">{clients.map((client) => <tr key={client.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-medium text-gray-900">{client.name}</td><td className="px-6 py-4 text-sm text-gray-600">{client.address}</td><td className="px-6 py-4 text-sm text-gray-600">{client.contactPerson || '-'}</td><td className="px-6 py-4 text-sm text-gray-600">{client.phone || '-'}</td><td className="px-6 py-4 text-sm text-gray-600">{requests.filter((request) => request.clientId === client.id).length}</td><td className="px-6 py-4 text-sm"><div className="flex gap-2"><button onClick={() => setSelectedClient(client)} className="rounded-lg p-2 text-green-600 transition hover:bg-green-50" title="Просмотреть"><ChevronRight size={18} /></button><button onClick={() => handleEdit(client)} className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"><Edit2 size={18} /></button><button onClick={() => handleDelete(client.id)} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"><Trash2 size={18} /></button></div></td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </div>
  );
}
