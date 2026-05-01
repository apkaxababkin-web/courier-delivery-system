import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../lib/api';
import { parseRequestText } from '../lib/text-parser';

interface Client {
  id: number;
  name: string;
  address: string;
  phone?: string;
  email?: string;
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
  recipientImage?: string; // base64 image, not stored in DB
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
  // Nuts specific
  nutsBoxes?: NutsBox[];
  needsStickers?: boolean;
  nutsTariff?: number;
  cedroilTariff?: number;
  // Pickup from TC specific
  tcName: string;
  tcAddress: string;
  trackingNumber: string;
  pickupDirection: 'tc_to_recipient' | 'recipient_to_tc';
  pickupRecipientClientId?: number;
}

// Crop image function
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

// Compress image to max 100KB
const compressImage = (base64: string, callback: (compressed: string) => void) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    
    // Calculate max dimensions while maintaining aspect ratio
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
    
    // Compress with quality adjustment
    let quality = 0.9;
    let compressed = canvas.toDataURL('image/jpeg', quality);
    
    // Keep reducing quality until under 100KB
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
  const [showForm, setShowForm] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState<string>('');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
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
    
    // Handle paste event for image
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
      // Remove UI-only fields that shouldn't be sent to backend
      const { senderClientId, recipientClientId, nutsBoxes, needsStickers, ...requestPayload } = payload;
      await api.createRequest(requestPayload);
      alert('Заявка создана успешно!');
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

      {/* Manual Form Modal */}
      {showForm && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Создать заявку</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Task Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Тип заявки
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
                >
                  <option value="delivery">Доставка</option>
                  <option value="movement">Перемещение</option>
                  <option value="nuts">Орехи</option>
                  <option value="courier_call">Вызов курьера</option>
                  <option value="pickup_from_tc">Получение и отправка груза в ТК</option>
                  <option value="simple">Простая заявка</option>
                </select>
              </div>



              {/* PDF Upload for courier_call */}
              {/* PDF Upload section removed - using image upload instead */}
              {false && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Загрузить накладную</h4>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const base64 = event.target?.result as string;
                          try {
                            const extracted = await api.extractFromPdf(base64, file.name);
                            if (extracted) {
                              setFormData(prev => ({
                                ...prev,
                                senderName: extracted.senderName || prev.senderName,
                                senderCompany: extracted.senderCompany || prev.senderCompany,
                                senderPhone: extracted.senderPhone || prev.senderPhone,
                                senderAddress: extracted.senderAddress || prev.senderAddress,
                                senderCity: extracted.senderCity || prev.senderCity,
                                recipientName: extracted.recipientName || prev.recipientName,
                                recipientCompany: extracted.recipientCompany || prev.recipientCompany,
                                recipientPhone: extracted.recipientPhone || prev.recipientPhone,
                                recipientAddress: extracted.recipientAddress || prev.recipientAddress,
                                recipientCity: extracted.recipientCity || prev.recipientCity,
                              }));
                              alert('Данные накладной успешно загружены');
                            }
                          } catch (error) {
                            console.error('PDF extraction error:', error);
                            alert('Ошибка при обработке PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                    id="pdf-input"
                  />
                  <label
                    htmlFor="pdf-input"
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition font-medium cursor-pointer text-center"
                  >
                    Выбрать PDF
                  </label>
                </div>
              </div>
              )}

              {/* Sender Information - Hidden for nuts, pickup_from_tc, and simple */}
              {formData.taskType !== 'nuts' && formData.taskType !== 'pickup_from_tc' && formData.taskType !== 'simple' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Отправитель</h4>
                <div className="grid grid-cols-2 gap-3">
                  {formData.taskType === 'movement' || formData.taskType === 'delivery' ? (
                    <>
                      <select
                        value={formData.senderClientId || ''}
                        onChange={(e) => {
                          const clientId = parseInt(e.target.value);
                          const client = clients.find(c => c.id === clientId);
                          if (client) {
                            setFormData({
                              ...formData,
                              senderClientId: clientId,
                              senderName: client.name,
                              senderPhone: client.phone || '',
                              senderAddress: client.address,
                            });
                          }
                        }}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Выберите отправителя --</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.address})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Отправитель *"
                        value={formData.senderName}
                        onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="tel"
                        placeholder="Телефон отправителя"
                        value={formData.senderPhone}
                        onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Адрес отправителя *"
                        value={formData.senderAddress}
                        onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Имя отправителя *"
                        value={formData.senderName}
                        onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="tel"
                        placeholder="Телефон отправителя"
                        value={formData.senderPhone}
                        onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {formData.taskType === 'courier_call' && (
                        <>
                          <input
                            type="text"
                            placeholder="Компания отправителя"
                            value={formData.senderCompany}
                            onChange={(e) => setFormData({ ...formData, senderCompany: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="Город отправителя"
                            value={formData.senderCity}
                            onChange={(e) => setFormData({ ...formData, senderCity: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </>
                      )}
                      <input
                        type="text"
                        placeholder="Адрес отправителя *"
                        value={formData.senderAddress}
                        onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </>
                  )}
                </div>
              </div>
              )}

              {/* Recipient Information - Hidden for simple */}
              {formData.taskType !== 'pickup_from_tc' && formData.taskType !== 'simple' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Получатель</h4>
                <div className="grid grid-cols-2 gap-3">
                  {formData.taskType === 'movement' || formData.taskType === 'nuts' ? (
                    <>
                      <select
                        value={formData.recipientClientId || ''}
                        onChange={(e) => {
                          const clientId = parseInt(e.target.value);
                          const client = clients.find(c => c.id === clientId);
                          if (client) {
                            setFormData({
                              ...formData,
                              recipientClientId: clientId,
                              recipientName: client.name,
                              recipientPhone: client.phone || '',
                              deliveryAddress: client.address,
                            });
                          }
                        }}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Выберите получателя --</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.address})
                          </option>
                        ))}
                      </select>
                      {formData.taskType === 'movement' && (
                        <>
                          <input
                            type="text"
                            placeholder="Получатель *"
                            value={formData.recipientName}
                            onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                          <input
                            type="tel"
                            placeholder="Телефон получателя"
                            value={formData.recipientPhone}
                            onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="Адрес получателя *"
                            value={formData.deliveryAddress}
                            onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                            className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </>
                      )}
                      {(formData.taskType === 'nuts' || formData.taskType === 'courier_call') && (
                        <>
                          <input
                            type="text"
                            placeholder="Имя получателя *"
                            value={formData.recipientName}
                            onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                            className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                          <input
                            type="tel"
                            placeholder="Телефон получателя *"
                            value={formData.recipientPhone}
                            onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Адрес доставки *"
                            value={formData.deliveryAddress}
                            onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                            className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </>
                      )}
                    </>
                  ) : formData.taskType === 'delivery' ? (
                    <>
                      <input
                        type="text"
                        placeholder="Имя получателя *"
                        value={formData.recipientName}
                        onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <input
                        type="tel"
                        placeholder="Телефон получателя *"
                        value={formData.recipientPhone}
                        onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Адрес доставки *"
                        value={formData.deliveryAddress}
                        onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Имя получателя *"
                        value={formData.recipientName}
                        onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <input
                        type="tel"
                        placeholder="Телефон получателя *"
                        value={formData.recipientPhone}
                        onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      {formData.taskType === 'courier_call' && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Фото получателя (из буфера обмена)</label>
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            {formData.recipientImage ? (
                              <div className="relative">
                                <img src={formData.recipientImage} alt="Recipient" className="max-w-full max-h-64 mx-auto rounded" />
                                <div className="mt-2 flex gap-2 justify-center flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCropImage(formData.recipientImage!);
                                      setShowCropModal(true);
                                    }}
                                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                                  >
                                    Обрезать
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById('recipientImageInput')?.click()}
                                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                                  >
                                    Заменить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, recipientImage: undefined })}
                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-gray-600 mb-2">Нажмите Ctrl+V или выберите файл</p>
                                <button
                                  type="button"
                                  onClick={() => document.getElementById('recipientImageInput')?.click()}
                                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                  Выбрать изображение
                                </button>
                              </div>
                            )}
                            <input
                              id="recipientImageInput"
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const base64 = event.target?.result as string;
                                    compressImage(base64, (compressed) => {
                                      setFormData({ ...formData, recipientImage: compressed });
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </div>
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Адрес доставки *"
                        value={formData.deliveryAddress}
                        onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      {formData.taskType !== 'nuts' && formData.taskType !== 'courier_call' && (
                      <input
                        type="text"
                        placeholder="Квартира/офис"
                        value={formData.recipientAddress}
                        onChange={(e) => setFormData({ ...formData, recipientAddress: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      )}
                    </>
                  )}
                </div>
              </div>
              )}

              {/* Simple Task Type Fields */}
              {formData.taskType === 'simple' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Информация</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Откуда (адрес) *"
                    value={formData.senderAddress}
                    onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Имя *"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Телефон *"
                    value={formData.senderPhone}
                    onChange={(e) => setFormData({ ...formData, senderPhone: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <input
                    type="time"
                    placeholder="Время от"
                    value={formData.deliveryTimeFrom}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeFrom: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="time"
                    placeholder="Время до"
                    value={formData.deliveryTimeTo}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeTo: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    placeholder="Комментарии"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-20"
                  />
                </div>
              </div>
              )}

              {/* Delivery Details - Hidden for nuts, pickup_from_tc, and simple */}
              {formData.taskType !== 'nuts' && formData.taskType !== 'pickup_from_tc' && formData.taskType !== 'simple' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Детали доставки</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    placeholder="Время от"
                    value={formData.deliveryTimeFrom}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeFrom: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="time"
                    placeholder="Время до"
                    value={formData.deliveryTimeTo}
                    onChange={(e) => setFormData({ ...formData, deliveryTimeTo: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {formData.taskType !== 'movement' && (
                    <>
                    </>
                  )}

                  <textarea
                    placeholder="Комментарии"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-20"
                  />
                </div>
              </div>
              )}

              {/* Payment Details - Only for Delivery */}
              {formData.taskType === 'delivery' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Детали оплаты</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="paid">Оплачено</option>
                    <option value="transfer">Перевод</option>
                    <option value="cash">Наличные</option>
                    <option value="terminal">Терминал</option>
                    <option value="qr">QR-код</option>
                  </select>
                  
                  {formData.paymentMethod !== 'paid' && (
                    <>
                      <input
                        type="number"
                        placeholder="Сумма оплаты"
                        value={formData.paymentAmount || ''}
                        onChange={(e) => setFormData({ ...formData, paymentAmount: parseFloat(e.target.value) || 0 })}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      
                      {formData.paymentMethod === 'qr' && (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setFormData({ ...formData, qrCodeImage: event.target?.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                      
                      {formData.qrCodeImage && (
                        <div className="col-span-2">
                          <img src={formData.qrCodeImage} alt="QR Code" className="w-32 h-32 border border-gray-300 rounded-lg" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              )}

              {/* Nuts Section */}
              {formData.taskType === 'nuts' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Коробки Орехов</h4>
                
                {/* Tariffs */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Тариф Орехи (руб. за кг)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.nutsTariff || ''}
                      onChange={(e) => setFormData({ ...formData, nutsTariff: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Цена за единицу"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Тариф Кедрового масла</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.cedroilTariff || ''}
                      onChange={(e) => setFormData({ ...formData, cedroilTariff: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Цена за единицу"
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  {formData.nutsBoxes?.map((box, index) => {
                    const isDefault = index < 6;
                    return (
                      <div key={box.id} className="flex items-center gap-2">
                        {isDefault ? (
                          <div className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-gray-700">
                            {box.name}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={box.name}
                            onChange={(e) => {
                              const newBoxes = formData.nutsBoxes?.map((b) =>
                                b.id === box.id ? { ...b, name: e.target.value } : b
                              ) || [];
                              setFormData({ ...formData, nutsBoxes: newBoxes });
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="Название строки"
                          />
                        )}
                        <input
                          type="number"
                          min="0"
                          value={box.quantity}
                          onChange={(e) => {
                            const newBoxes = formData.nutsBoxes?.map((b) =>
                              b.id === box.id ? { ...b, quantity: parseInt(e.target.value) || 0 } : b
                            ) || [];
                            setFormData({ ...formData, nutsBoxes: newBoxes });
                          }}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Кол-во"
                        />
                        <div className="w-24 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 text-right">
                          {index === 5 
                            ? ((box.quantity || 0) * (formData.cedroilTariff || 0)).toFixed(2)
                            : ((box.quantity || 0) * (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0)).toFixed(2)
                          }
                        </div>
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => {
                              const newBoxes = formData.nutsBoxes?.filter((b) => b.id !== box.id) || [];
                              setFormData({ ...formData, nutsBoxes: newBoxes });
                            }}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const newId = Math.random().toString(36).substr(2, 9);
                      const newBoxes = [
                        ...(formData.nutsBoxes || []),
                        { id: newId, name: 'Новая строка', quantity: 0 },
                      ];
                      setFormData({ ...formData, nutsBoxes: newBoxes });
                    }}
                    className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                  >
                    + Добавить строку
                  </button>
                </div>
                
                {/* Total Calculator */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-300 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Итого сумма:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {(formData.nutsBoxes?.reduce((sum, box, index) => {
                        if (index === 5) {
                          return sum + ((box.quantity || 0) * (formData.cedroilTariff || 0));
                        } else {
                          return sum + ((box.quantity || 0) * (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0));
                        }
                      }, 0) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              )}

              {/* Pickup from TC Section */}
              {formData.taskType === 'pickup_from_tc' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Клиент</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formData.clientId || ''}
                    onChange={(e) => {
                      const clientId = parseInt(e.target.value);
                      const client = clients.find(c => c.id === clientId);
                      if (client) {
                        setFormData({
                          ...formData,
                          clientId,
                          senderName: client.name,
                          senderPhone: client.phone || '',
                          senderAddress: client.address,
                        });
                      }
                    }}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Выберите клиента --</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.address})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              )}

              {/* Pickup from TC - Transport Company or Recipient (reordered based on direction) */}
              {formData.taskType === 'pickup_from_tc' && formData.pickupDirection === 'tc_to_recipient' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Транспортная компания</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Название ТК"
                    value={formData.tcName}
                    onChange={(e) => setFormData({ ...formData, tcName: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Адрес ТК"
                    value={formData.tcAddress}
                    onChange={(e) => setFormData({ ...formData, tcAddress: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Номер трекинга"
                    value={formData.trackingNumber}
                    onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              )}

              {/* Pickup from TC - Recipient (shown first when direction is recipient_to_tc) */}
              {formData.taskType === 'pickup_from_tc' && formData.pickupDirection === 'recipient_to_tc' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Получатель</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formData.pickupRecipientClientId || ''}
                    onChange={(e) => {
                      const clientId = parseInt(e.target.value);
                      const client = clients.find(c => c.id === clientId);
                      if (client) {
                        setFormData({
                          ...formData,
                          pickupRecipientClientId: clientId,
                          recipientName: client.name,
                          recipientPhone: client.phone || '',
                          deliveryAddress: client.address,
                        });
                      }
                    }}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Выберите получателя --</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.address})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Количество мест *"
                    value={formData.placesCount}
                    onChange={(e) => setFormData({ ...formData, placesCount: parseInt(e.target.value) || 0 })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              )}

              {/* Pickup from TC - Transport Company (shown second when direction is recipient_to_tc) */}
              {formData.taskType === 'pickup_from_tc' && formData.pickupDirection === 'recipient_to_tc' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Транспортная компания</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Название ТК"
                    value={formData.tcName}
                    onChange={(e) => setFormData({ ...formData, tcName: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Адрес ТК"
                    value={formData.tcAddress}
                    onChange={(e) => setFormData({ ...formData, tcAddress: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Номер трекинга"
                    value={formData.trackingNumber}
                    onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              )}

              {/* Pickup from TC - Recipient (shown second when direction is tc_to_recipient) */}
              {formData.taskType === 'pickup_from_tc' && formData.pickupDirection === 'tc_to_recipient' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Получатель</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formData.pickupRecipientClientId || ''}
                    onChange={(e) => {
                      const clientId = parseInt(e.target.value);
                      const client = clients.find(c => c.id === clientId);
                      if (client) {
                        setFormData({
                          ...formData,
                          pickupRecipientClientId: clientId,
                          recipientName: client.name,
                          recipientPhone: client.phone || '',
                          deliveryAddress: client.address,
                        });
                      }
                    }}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Выберите получателя --</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.address})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Количество мест *"
                    value={formData.placesCount}
                    onChange={(e) => setFormData({ ...formData, placesCount: parseInt(e.target.value) || 0 })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              )}

              {/* Pickup from TC - Delivery Details */}
              {formData.taskType === 'pickup_from_tc' && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Детали доставки</h4>
                <div className="grid grid-cols-2 gap-3">
                  <textarea
                    placeholder="Комментарии"
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      pickupDirection: formData.pickupDirection === 'tc_to_recipient' ? 'recipient_to_tc' : 'tc_to_recipient'
                    })}
                    className="col-span-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium"
                  >
                    {formData.pickupDirection === 'tc_to_recipient' 
                      ? 'ТК → Получатель' 
                      : 'Получатель → ТК'
                    }
                  </button>
                </div>
              </div>
              )}

              {/* Stickers Checkbox - For nuts only */}
              {formData.taskType === 'nuts' && (
              <div className="border-t pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.needsStickers || false}
                    onChange={(e) => setFormData({ ...formData, needsStickers: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Нужны наклейки</span>
                </label>
              </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Создать заявку
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400 transition font-medium"
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full">
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Создать заявку по тексту</h2>
              <button
                onClick={() => setShowAiForm(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="Опишите заявку..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-32"
              />

              <div className="flex gap-3">
                <button
                  onClick={handleAiSubmit}
                  disabled={aiLoading}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
                >
                  {aiLoading ? 'Обработка...' : 'Создать заявку'}
                </button>
                <button
                  onClick={() => setShowAiForm(false)}
                  className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Crop Modal */}
      {showCropModal && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full">
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Обрезать изображение</h2>
              <button
                onClick={() => setShowCropModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="relative inline-block w-full">
                <canvas
                  ref={(canvas) => {
                    if (canvas && cropImage) {
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        const img = new Image();
                        img.onload = () => {
                          canvas.width = img.width;
                          canvas.height = img.height;
                          ctx.drawImage(img, 0, 0);
                          if (cropRect.width > 0 && cropRect.height > 0) {
                            ctx.strokeStyle = '#FF0000';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
                          }
                        };
                        img.src = cropImage;
                      }
                    }
                  }}
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    setIsDrawing(true);
                  }}
                  onMouseMove={(e) => {
                    if (!isDrawing) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const currentX = e.clientX - rect.left;
                    const currentY = e.clientY - rect.top;
                    setCropRect({
                      x: Math.min(startPos.x, currentX),
                      y: Math.min(startPos.y, currentY),
                      width: Math.abs(currentX - startPos.x),
                      height: Math.abs(currentY - startPos.y),
                    });
                  }}
                  onMouseUp={() => setIsDrawing(false)}
                  onMouseLeave={() => setIsDrawing(false)}
                  className="w-full border-2 border-gray-300 rounded-lg cursor-crosshair"
                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-4">Нажмите и перетащите для выделения области</p>
            </div>
            <div className="border-t p-4 flex gap-3">
              <button
                onClick={() => {
                  if (cropRect.width > 0 && cropRect.height > 0) {
                    cropImageData(cropImage, cropRect, (cropped) => {
                      compressImage(cropped, (compressed) => {
                        setFormData({ ...formData, recipientImage: compressed });
                        setShowCropModal(false);
                        setCropImage('');
                        setCropRect({ x: 0, y: 0, width: 0, height: 0 });
                      });
                    });
                  }
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Обрезать
              </button>
              <button
                onClick={() => {
                  setShowCropModal(false);
                  setCropImage('');
                  setCropRect({ x: 0, y: 0, width: 0, height: 0 });
                }}
                className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400 transition font-medium"
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
