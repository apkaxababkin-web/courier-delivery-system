import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../lib/api';
import { parseRequestText } from '../lib/text-parser';
import { X, Sparkles, Plus, Search, CheckCircle2, AlertCircle, Clock, FileText, Edit2, Trash2, TrendingUp } from 'lucide-react';

interface Client {
  id: number;
  name: string;
  address: string;
  phone?: string;
  email?: string;
}

interface Request {
  id: number;
  requestType: string;
  status: string;
  senderName?: string;
  recipientName?: string;
  deliveryAddress?: string;
  createdAt?: string;
}

interface NutsBox {
  id: string;
  name: string;
  quantity: number;
  price?: number;
}

interface TaskFormData {
  taskType: 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
  clientId?: number;
  senderClientId?: number;
  recipientClientId?: number;
  senderName: string;
  senderCompany: string;
  senderCity: string;
  senderAddress: string;
  senderPhone: string;
  recipientName: string;
  recipientCompany: string;
  recipientCity: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientImage?: string;
  deliveryAddress: string;
  packageDescription: string;
  packageType: 'document' | 'small' | 'medium' | 'large' | 'fragile';
  specialInstructions: string;
  deliveryTimeFrom: string;
  deliveryTimeTo: string;
  placesCount: number;
  comments: string;
  paymentMethod: 'paid' | 'transfer' | 'cash' | 'terminal' | 'qr';
  paymentAmount?: number;
  qrCodeImage?: string;
  nutsBoxes?: NutsBox[];
  needsStickers?: boolean;
  nutsTariff?: number;
  cedroilTariff?: number;
  tcName: string;
  tcAddress: string;
  trackingNumber: string;
  pickupDirection: 'tc_to_recipient' | 'recipient_to_tc';
  pickupRecipientClientId?: number;
}

const DEFAULT_NUTS_BOXES: NutsBox[] = [
  { id: '1', name: '0,1 (15 кг)', quantity: 0 },
  { id: '2', name: '0,2 (16 кг)', quantity: 0 },
  { id: '3', name: '0,3 (16,5 кг)', quantity: 0 },
  { id: '4', name: '0,5 (18 кг)', quantity: 0 },
  { id: '5', name: '1 (18 кг)', quantity: 0 },
  { id: '6', name: 'Кедровое масло', quantity: 0 },
];

export default function TasksView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [formData, setFormData] = useState<TaskFormData>({
    taskType: 'delivery',
    clientId: undefined,
    senderClientId: undefined,
    recipientClientId: undefined,
    senderName: '',
    senderCompany: '',
    senderCity: '',
    senderAddress: '',
    senderPhone: '',
    recipientName: '',
    recipientCompany: '',
    recipientCity: '',
    recipientPhone: '',
    recipientAddress: '',
    deliveryAddress: '',
    packageDescription: '',
    packageType: 'small',
    specialInstructions: '',
    deliveryTimeFrom: '',
    deliveryTimeTo: '',
    placesCount: 1,
    comments: '',
    paymentMethod: 'paid',
    paymentAmount: 0,
    nutsBoxes: DEFAULT_NUTS_BOXES,
    needsStickers: false,
    tcName: '',
    tcAddress: '',
    trackingNumber: '',
    pickupDirection: 'tc_to_recipient',
    pickupRecipientClientId: undefined,
  });

  useEffect(() => {
    loadClients();
    loadRequests();
  }, []);

  const loadClients = async () => {
    try {
      const clients = await api.getAllClients();
      setClients(clients || []);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const requests = await api.getAllRequests();
      setRequests(requests || []);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        requestType: formData.taskType,
        ...formData,
      };
      const { senderClientId, recipientClientId, nutsBoxes, needsStickers, ...requestPayload } = payload;
      await api.createRequest(requestPayload);
      alert('Заявка создана успешно!');
      setShowForm(false);
      loadRequests();
      resetForm();
    } catch (error) {
      alert('Ошибка при создании заявки: ' + (error instanceof Error ? error.message : 'Unknown error'));
      console.error(error);
    }
  };

  const handleAiSubmit = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const response = await api.parseRequestWithAI(aiText);
      
      if (response.success && response.data) {
        setFormData({
          ...formData,
          taskType: response.data.requestType === 'delivery' ? 'delivery' : 'simple',
          senderName: response.data.courierName || '',
          senderCompany: response.data.clientName || '',
          senderPhone: '',
          senderAddress: response.data.pickupAddress || '',
          recipientName: response.data.recipientName || '',
          recipientPhone: response.data.recipientPhone || '',
          deliveryAddress: response.data.deliveryAddress || '',
          packageDescription: '',
          paymentMethod: (response.data.paymentMethod as any) || 'paid',
          comments: response.data.comment || '',
        });
        setShowAiForm(false);
        setShowForm(true);
        setAiText('');
      } else {
        alert('Ошибка при парсинге текста');
      }
    } catch (error) {
      console.error(error);
      alert('Ошибка при парсинге текста: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setFormData({
      taskType: 'delivery',
      clientId: undefined,
      senderClientId: undefined,
      recipientClientId: undefined,
      senderName: '',
      senderCompany: '',
      senderCity: '',
      senderAddress: '',
      senderPhone: '',
      recipientName: '',
      recipientCompany: '',
      recipientCity: '',
      recipientPhone: '',
      recipientAddress: '',
      deliveryAddress: '',
      packageDescription: '',
      packageType: 'small',
      specialInstructions: '',
      deliveryTimeFrom: '',
      deliveryTimeTo: '',
      placesCount: 1,
      comments: '',
      nutsBoxes: DEFAULT_NUTS_BOXES,
      paymentMethod: 'paid',
      paymentAmount: 0,
      tcName: '',
      tcAddress: '',
      trackingNumber: '',
      pickupDirection: 'tc_to_recipient',
      pickupRecipientClientId: undefined,
      needsStickers: false,
    });
  };

  const getFilteredRequests = () => {
    let filtered = requests;

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(r => r.status === selectedStatus);
    }

    if (dateFrom || dateTo) {
      filtered = filtered.filter(r => {
        if (!r.createdAt) return true;
        const requestDate = new Date(r.createdAt).toISOString().split('T')[0];
        if (dateFrom && requestDate < dateFrom) return false;
        if (dateTo && requestDate > dateTo) return false;
        return true;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.senderName?.toLowerCase().includes(query) ||
        r.recipientName?.toLowerCase().includes(query) ||
        r.deliveryAddress?.toLowerCase().includes(query) ||
        r.id.toString().includes(query)
      );
    }

    return filtered;
  };

  const getStatistics = () => {
    return {
      total: requests.length,
      new: requests.filter(r => r.status === 'new').length,
      pending: requests.filter(r => r.status === 'pending').length,
      completed: requests.filter(r => r.status === 'completed').length,
    };
  };

  const stats = getStatistics();
  const filteredRequests = getFilteredRequests();

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-purple-100 text-purple-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return 'Новая';
      case 'pending':
        return 'В работе';
      case 'completed':
        return 'Завершена';
      case 'cancelled':
        return 'Отменена';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-purple-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatDateRange = () => {
    if (dateFrom && dateTo) {
      return `${dateFrom} - ${dateTo}`;
    }
    if (dateFrom) {
      return `с ${dateFrom}`;
    }
    if (dateTo) {
      return `до ${dateTo}`;
    }
    return '';
  };

  return (
    <div className="bg-slate-50 min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Statistics Cards - 4 columns */}
        <div className="grid grid-cols-4 gap-6">
          {/* Total */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">Всего заявок</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          {/* New */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">Новые</p>
                <p className="text-3xl font-bold text-green-600">{stats.new}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Pending */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">В работе</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Completed */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">Завершённые</p>
                <p className="text-3xl font-bold text-purple-600">{stats.completed}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Status Select */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все статусы</option>
              <option value="new">Новые</option>
              <option value="pending">В работе</option>
              <option value="completed">Завершённые</option>
              <option value="cancelled">Отменённые</option>
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по клиенту или адресу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 ml-auto">
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Создать заявку
              </button>
              <button
                onClick={() => setShowAiForm(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                Создать по тексту
              </button>
            </div>
          </div>
        </div>

        {/* Table Card */}
        {filteredRequests.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Клиент</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Адрес</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Статус</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Дата</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, index) => (
                  <tr key={request.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">#{request.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{request.senderName || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{request.deliveryAddress || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(request.status)}`}>
                        {getStatusIcon(request.status)}
                        {getStatusLabel(request.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {request.createdAt ? new Date(request.createdAt).toLocaleDateString('ru-RU') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-600 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-xl border border-gray-200 p-12 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-gray-100 p-4 rounded-lg">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Заявок пока нет</h3>
            <p className="text-gray-600 mb-6">Создайте первую заявку вручную или через ИИ</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowForm(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Создать заявку
              </button>
              <button
                onClick={() => setShowAiForm(true)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Создать по тексту
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Создать заявку</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Имя отправителя"
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Имя получателя"
                  value={formData.recipientName}
                  onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input
                type="text"
                placeholder="Адрес доставки"
                value={formData.deliveryAddress}
                onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Описание посылки"
                value={formData.packageDescription}
                onChange={(e) => setFormData({ ...formData, packageDescription: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showAiForm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Создать заявку по тексту</h2>
              <button onClick={() => setShowAiForm(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                placeholder="Вставьте текст заявки..."
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowAiForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAiSubmit}
                  disabled={aiLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {aiLoading ? 'Распознавание...' : 'Распознать'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
