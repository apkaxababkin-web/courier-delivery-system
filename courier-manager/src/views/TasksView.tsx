import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../lib/api';
import { parseRequestText } from '../lib/text-parser';
import { X } from 'lucide-react';

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

const cropImageData = (base64: string, rect: { x: number; y: number; width: number; height: number }, callback: (cropped: string) => void) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    }
    callback(canvas.toDataURL('image/jpeg', 0.9));
  };
  img.src = base64;
};

const compressImage = (base64: string, callback: (compressed: string) => void) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    
    const maxWidth = 1200;
    const maxHeight = 1200;
    if (width > height) {
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
    }
    
    let quality = 0.9;
    let compressed = canvas.toDataURL('image/jpeg', quality);
    
    while (compressed.length > 100 * 1024 && quality > 0.1) {
      quality -= 0.1;
      compressed = canvas.toDataURL('image/jpeg', quality);
    }
    
    callback(compressed);
  };
  img.src = base64;
};

const NUTS_WEIGHTS: { [key: string]: number } = {
  '1': 15,
  '2': 16,
  '3': 16.5,
  '4': 18,
  '5': 18,
  '6': 0,
};

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
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState<string>('');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
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
    
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              compressImage(base64, (compressed) => {
                setFormData(prev => ({ ...prev, recipientImage: compressed }));
              });
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
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

  const handleClientSelect = (clientId: number) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setFormData({
        ...formData,
        clientId,
        senderName: client.name,
        senderCompany: '',
        senderCity: '',
        senderPhone: client.phone || '',
        senderAddress: client.address,
        recipientName: client.name,
        recipientCompany: '',
        recipientCity: '',
        recipientPhone: client.phone || '',
        deliveryAddress: client.address,
      });
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
    } catch (error) {
      alert('Ошибка при создании заявки: ' + (error instanceof Error ? error.message : 'Unknown error'));
      console.error(error);
    }
  };

  const handleAiSubmit = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const parsed = parseRequestText(aiText);
      setFormData({
        ...formData,
        taskType: parsed.taskType,
        senderName: parsed.senderName,
        senderPhone: parsed.senderPhone,
        senderAddress: parsed.senderAddress,
        recipientName: parsed.recipientName,
        recipientPhone: parsed.recipientPhone,
        deliveryAddress: parsed.recipientAddress,
        packageDescription: parsed.packageDescription,
      });
      setShowAiForm(false);
      setShowForm(true);
      setAiText('');
      setAiLoading(false);
    } catch (error) {
      console.error(error);
      alert('Ошибка при парсинге текста');
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

    // Filter by type
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(r => r.requestType === selectedFilter);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(r => r.status === selectedStatus);
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      filtered = filtered.filter(r => {
        if (!r.createdAt) return true;
        const requestDate = new Date(r.createdAt).toISOString().split('T')[0];
        if (dateFrom && requestDate < dateFrom) return false;
        if (dateTo && requestDate > dateTo) return false;
        return true;
      });
    }

    return filtered;
  };

  const statusOptions = [
    { id: 'all', label: 'Все статусы' },
    { id: 'new', label: 'Новая' },
    { id: 'pending', label: 'В процессе' },
    { id: 'completed', label: 'Завершена' },
    { id: 'cancelled', label: 'Отменена' },
  ];

  const filterButtons = [
    { id: 'all', label: 'Все типы' },
    { id: 'sberbank', label: 'Сбербанк' },
    { id: 'hemotest', label: 'Гемотест' },
    { id: 'other', label: 'Другие' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          onClick={() => setShowForm(true)}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Создать заявку в ручную
        </button>
        <button
          onClick={() => setShowAiForm(true)}
          className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium"
        >
          Создать заявку по тексту
        </button>
      </div>

      {/* Date and Status Filters */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              От
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              До
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map(button => (
          <button
            key={button.id}
            onClick={() => setSelectedFilter(button.id)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedFilter === button.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {button.label}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-2">
        {getFilteredRequests().length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Нет заявок
          </div>
        ) : (
          getFilteredRequests().map(request => (
            <div key={request.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Заявка #{request.id}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {request.senderName && <div>От: {request.senderName}</div>}
                    {request.recipientName && <div>Кому: {request.recipientName}</div>}
                    {request.deliveryAddress && <div>Адрес: {request.deliveryAddress}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    request.status === 'new' ? 'bg-blue-100 text-blue-800' :
                    request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    request.status === 'completed' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {request.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Form Modal - Simplified Design */}
      {showForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Создать заявку
              </h3>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Тип заявки *
                </label>
                <select
                  value={formData.taskType}
                  onChange={(e) => {
                    const newType = e.target.value as TaskFormData['taskType'];
                    setFormData({
                      ...formData,
                      taskType: newType,
                      nutsBoxes: newType === 'nuts' ? DEFAULT_NUTS_BOXES : formData.nutsBoxes,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Sender Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Отправитель *
                </label>
                <input
                  type="text"
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Название компании"
                  required
                />
              </div>

              {/* Sender Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Адрес отправителя *
                </label>
                <input
                  type="text"
                  value={formData.senderAddress}
                  onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ул. Калашникова, 17"
                  required
                />
              </div>

              {/* Sender Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Телефон отправителя
                </label>
                <input
                  type="tel"
                  value={formData.senderPhone}
                  onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+7 (914) 111-22-33"
                />
              </div>

              {/* Recipient Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Получатель *
                </label>
                <input
                  type="text"
                  value={formData.recipientName}
                  onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Имя получателя"
                  required
                />
              </div>

              {/* Recipient Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Телефон получателя *
                </label>
                <input
                  type="tel"
                  value={formData.recipientPhone}
                  onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+7 (914) 111-22-33"
                  required
                />
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Адрес доставки *
                </label>
                <input
                  type="text"
                  value={formData.deliveryAddress}
                  onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ул. Доставки, 5"
                  required
                />
              </div>

              {/* Delivery Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Время от
                  </label>
                  <input
                    type="time"
                    value={formData.deliveryTimeFrom}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Время до
                  </label>
                  <input
                    type="time"
                    value={formData.deliveryTimeTo}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Комментарии
                </label>
                <textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Дополнительная информация"
                  rows={3}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Способ оплаты
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as TaskFormData['paymentMethod'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="paid">Оплачено</option>
                  <option value="transfer">Перевод</option>
                  <option value="cash">Наличные</option>
                  <option value="terminal">Терминал</option>
                  <option value="qr">QR-код</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Создать заявку
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

      {/* AI Form Modal */}
      {showAiForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Создать заявку по тексту
              </h3>
              <button
                onClick={() => setShowAiForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAiSubmit(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание заявки
                </label>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Опишите заявку..."
                  rows={6}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                >
                  {aiLoading ? 'Обработка...' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
