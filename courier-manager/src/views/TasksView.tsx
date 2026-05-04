import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../lib/api';
import { parseRequestText } from '../lib/text-parser';
import { X, Sparkles, Plus, Search, Filter } from 'lucide-react';

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
        return 'bg-blue-100 text-blue-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
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

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-soft">
          <div className="text-sm font-medium text-gray-600 mb-2">Всего заявок</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-soft">
          <div className="text-sm font-medium text-gray-600 mb-2">Новые</div>
          <div className="text-3xl font-bold text-blue-600">{stats.new}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-soft">
          <div className="text-sm font-medium text-gray-600 mb-2">В работе</div>
          <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-soft">
          <div className="text-sm font-medium text-gray-600 mb-2">Завершённые</div>
          <div className="text-3xl font-bold text-green-600">{stats.completed}</div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-soft">
        <div className="flex items-end gap-4 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Клиент, адрес, ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">От</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">До</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все статусы</option>
              <option value="new">Новая</option>
              <option value="pending">В работе</option>
              <option value="completed">Завершена</option>
              <option value="cancelled">Отменена</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              <Plus className="w-4 h-4" />
              Создать заявку
            </button>
            <button
              onClick={() => setShowAiForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              <Sparkles className="w-4 h-4" />
              По тексту
            </button>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-soft overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-500 mb-2">Заявок пока нет</div>
            <div className="text-sm text-gray-400 mb-6">Создайте первую заявку вручную или через ИИ</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Создать заявку
              </button>
              <button
                onClick={() => setShowAiForm(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
              >
                Создать по тексту
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Клиент</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Адрес</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Статус</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Дата</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">#{request.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{request.senderName || request.recipientName || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 line-clamp-1">{request.deliveryAddress || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(request.status)}`}>
                      {getStatusLabel(request.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {request.createdAt ? new Date(request.createdAt).toLocaleDateString('ru-RU') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Task Creation Modal */}
      {showForm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-semibold text-gray-900">Создать заявку</h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Тип заявки *</label>
                <select
                  value={formData.taskType}
                  onChange={(e) => setFormData({ ...formData, taskType: e.target.value as TaskFormData['taskType'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="delivery">Доставка</option>
                  <option value="movement">Перемещение</option>
                  <option value="nuts">Орехи</option>
                  <option value="courier_call">Вызов курьера</option>
                  <option value="pickup_from_tc">Получение и отправка груза в ТК</option>
                  <option value="simple">Простая заявка</option>
                </select>
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-2 gap-4">
                {/* Sender Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Отправитель *</label>
                  <input
                    type="text"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Название компании"
                    required
                  />
                </div>

                {/* Sender Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Телефон отправителя</label>
                  <input
                    type="tel"
                    value={formData.senderPhone}
                    onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+7 (914) 111-22-33"
                  />
                </div>
              </div>

              {/* Sender Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Адрес отправителя *</label>
                <input
                  type="text"
                  value={formData.senderAddress}
                  onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ул. Калашникова, 17"
                  required
                />
              </div>

              {/* Recipient */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Получатель *</label>
                  <input
                    type="text"
                    value={formData.recipientName}
                    onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Имя получателя"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Телефон получателя *</label>
                  <input
                    type="tel"
                    value={formData.recipientPhone}
                    onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+7 (914) 111-22-33"
                    required
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Адрес доставки *</label>
                <input
                  type="text"
                  value={formData.deliveryAddress}
                  onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ул. Доставки, 5"
                  required
                />
              </div>

              {/* Delivery Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Время от</label>
                  <input
                    type="time"
                    value={formData.deliveryTimeFrom}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeFrom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Время до</label>
                  <input
                    type="time"
                    value={formData.deliveryTimeTo}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeTo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Комментарии</label>
                <textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Дополнительная информация"
                  rows={3}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Способ оплаты</label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as TaskFormData['paymentMethod'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="paid">Оплачено</option>
                  <option value="transfer">Перевод</option>
                  <option value="cash">Наличные</option>
                  <option value="terminal">Терминал</option>
                  <option value="qr">QR-код</option>
                </select>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Создать заявку
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {/* AI Text Parsing Modal */}
      {showAiForm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900">Создать заявку по тексту</h2>
              </div>
              <button
                onClick={() => setShowAiForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={(e) => { e.preventDefault(); handleAiSubmit(); }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Описание заявки</label>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Вставьте текст заявки из мессенджера, письма или другого источника..."
                  rows={8}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAiForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {aiLoading ? 'Распознавание...' : 'Распознать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
