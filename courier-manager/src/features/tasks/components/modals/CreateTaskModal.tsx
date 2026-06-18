import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import { getLocalDateKey } from '../../../../lib/local-time';
import { getClientPoints, getClientRegularClients, type ClientPoint, type ClientRegularClient, getTransportCompanies, type TransportCompany} from '../../../../lib/api';
import type { TaskFormData, Client, NutsBox } from '../../model/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
  clients: Client[];
  isLoading?: boolean;
  mode?: 'create' | 'edit';
  initialData?: Partial<TaskFormData> | null;
  title?: string;
  submitLabel?: string;
}

type RequestType = NonNullable<TaskFormData['requestType']>;
type ExtraPickupPoint = NonNullable<TaskFormData['extraPickupPoints']>[number];

type LocalFormData = TaskFormData & {
  senderClientId?: number;
  recipientClientId?: number;
  pickupRecipientClientId?: number;
  pickupDirection?: 'tc_to_recipient' | 'recipient_to_tc';
  nutsBoxes?: NutsBox[];
  nutsTariff?: number;
  cedroilTariff?: number;
};


const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  delivery: 'Доставка',
  movement: 'Перемещение',
  nuts: 'Орехи',
  courier_call: 'Вызов курьера',
  pickup_from_tc: 'Транспортная компания',
  simple: 'Простая заявка',
};

const NUTS_TARIFF_STORAGE_KEY = 'courier-manager:nuts-tariff';
const CEDROIL_TARIFF_STORAGE_KEY = 'courier-manager:cedroil-tariff';
const NUTS_OWNER_CLIENT_STORAGE_KEY = 'courier-manager:nuts-owner-client-id';
const NUTS_WEIGHTS: Record<string, number> = { '1': 15, '2': 16, '3': 16.5, '4': 18, '5': 18, '6': 0 };
const DEFAULT_NUTS_BOXES: NutsBox[] = [
  { id: '1', name: '0,1 (15 кг)', quantity: 0 },
  { id: '2', name: '0,2 (16 кг)', quantity: 0 },
  { id: '3', name: '0,3 (16,5 кг)', quantity: 0 },
  { id: '4', name: '0,5 (18 кг)', quantity: 0 },
  { id: '5', name: '1 (18 кг)', quantity: 0 },
  { id: '6', name: 'Кедровое масло', quantity: 0 },
];

const readStoredTariff = (key: string) => {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : 0;
};

const makeInitialFormData = (): LocalFormData => ({
  requestType: 'delivery',
  requestDate: getLocalDateKey(),
  extraPickupPoints: [],
  clientId: undefined,
  senderClientId: undefined,
  recipientClientId: undefined,
  senderName: '',
  senderCompany: '',
  senderCity: '',
  senderPhone: '',
  senderAddress: '',
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
  placesCount: undefined,
  comments: '',
  paymentMethod: 'paid',
  paymentAmount: 0,
  nutsBoxes: DEFAULT_NUTS_BOXES.map((box) => ({ ...box })),
  nutsTariff: readStoredTariff(NUTS_TARIFF_STORAGE_KEY),
  cedroilTariff: readStoredTariff(CEDROIL_TARIFF_STORAGE_KEY),
  tcName: '',
  tcAddress: '',
  trackingNumber: '',
  pickupDirection: 'tc_to_recipient',
  pickupRecipientClientId: undefined,
});

export function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  isLoading,
  mode = 'create',
  initialData = null,
  title,
  submitLabel,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<LocalFormData>(makeInitialFormData);
  const [pickupClientPoints, setPickupClientPoints] = useState<ClientPoint[]>([]);
  const [transportCompanies, setTransportCompanies] = useState<TransportCompany[]>([]);
  const [nutsOwnerClient, setNutsOwnerClient] = useState<Client | null>(null);
  const [nutsOwnerClientId, setNutsOwnerClientId] = useState<number | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const stored = window.localStorage.getItem(NUTS_OWNER_CLIENT_STORAGE_KEY);
    const parsed = stored ? Number(stored) : undefined;
    return parsed && Number.isFinite(parsed) ? parsed : undefined;
  });
  const [nutsRegularClients, setNutsRegularClients] = useState<ClientRegularClient[]>([]);
  const [nutsRegularClientsLoading, setNutsRegularClientsLoading] = useState(false);
  const [tcClientPointsMap, setTcClientPointsMap] = useState<Record<number, ClientPoint[]>>({});
  const [tcRecipientDropdownOpen, setTcRecipientDropdownOpen] = useState(false);
  const [expandedTcClientId, setExpandedTcClientId] = useState<number | null>(null);
  const [pickupClientPointsLoading, setPickupClientPointsLoading] = useState(false);
  const [extraPickupError, setExtraPickupError] = useState('');
  const requestFileInputRef = useRef<HTMLInputElement | null>(null);
  const requestType = formData.requestType || 'delivery';
  const pickupPointsClientId = requestType === 'pickup_from_tc' ? formData.pickupRecipientClientId : formData.senderClientId;

  useEffect(() => {
    if (!isOpen) return;

    const base = makeInitialFormData();
    setFormData({
      ...base,
      ...(initialData || {}),
      requestType: initialData?.requestType || base.requestType,
      nutsBoxes: base.nutsBoxes,
      nutsTariff: base.nutsTariff,
      cedroilTariff: base.cedroilTariff,
    });
  }, [isOpen, initialData]);

  const nutsTotal = useMemo(() => (formData.nutsBoxes || []).reduce((sum, box, index) => {
    const tariff = index === 5 ? formData.cedroilTariff || 0 : (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0);
    return sum + (box.quantity || 0) * tariff;
  }, 0), [formData.nutsBoxes, formData.nutsTariff, formData.cedroilTariff]);

  useEffect(() => {
    if (!isOpen || requestType !== 'nuts') {
      setNutsOwnerClient(null);
      setNutsRegularClients([]);
      setNutsRegularClientsLoading(false);
      return;
    }

    const owner = nutsOwnerClientId
      ? clients.find((client) => client.id === nutsOwnerClientId) || null
      : null;

    setNutsOwnerClient(owner);

    if (!owner) {
      setNutsRegularClients([]);
      setNutsRegularClientsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadNutsRegularClients() {
      try {
        setNutsRegularClientsLoading(true);
        const items = await getClientRegularClients(owner.id);

        if (!cancelled) {
          setNutsRegularClients(items || []);
        }
      } catch (error) {
        console.error('Failed to load nuts regular clients:', error);

        if (!cancelled) {
          setNutsRegularClients([]);
        }
      } finally {
        if (!cancelled) {
          setNutsRegularClientsLoading(false);
        }
      }
    }

    void loadNutsRegularClients();

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestType, clients, nutsOwnerClientId]);

  useEffect(() => {
    if (!isOpen) {
      setTransportCompanies([]);
      return;
    }

    let cancelled = false;

    async function loadTransportCompaniesForTcRequest() {
      try {
        const items = await getTransportCompanies();

        if (!cancelled) {
          setTransportCompanies((items || []).filter((item) => item.isActive !== false));
        }
      } catch (error) {
        console.error('Failed to load transport companies:', error);

        if (!cancelled) {
          setTransportCompanies([]);
        }
      }
    }

    void loadTransportCompaniesForTcRequest();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || clients.length === 0) {
      setTcClientPointsMap({});
      return;
    }

    let cancelled = false;

    async function loadTcClientPointsMap() {
      const entries = await Promise.all(
        clients.map(async (client) => {
          try {
            const points = await getClientPoints(client.id);
            return [client.id, points || []] as const;
          } catch {
            return [client.id, []] as const;
          }
        }),
      );

      if (!cancelled) {
        setTcClientPointsMap(Object.fromEntries(entries));
      }
    }

    void loadTcClientPointsMap();

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestType, clients]);

  useEffect(() => {
    setExtraPickupError('');

    if (!isOpen || !pickupPointsClientId) {
      setPickupClientPoints([]);
      return;
    }

    let cancelled = false;

    async function loadPickupClientPoints() {
      try {
        setPickupClientPointsLoading(true);
        const points = await getClientPoints(pickupPointsClientId!);

        if (!cancelled) {
          setPickupClientPoints(points || []);
        }
      } catch (error) {
        console.error('Failed to load pickup client points:', error);

        if (!cancelled) {
          setPickupClientPoints([]);
        }
      } finally {
        if (!cancelled) {
          setPickupClientPointsLoading(false);
        }
      }
    }

    void loadPickupClientPoints();

    return () => {
      cancelled = true;
    };
  }, [isOpen, pickupPointsClientId]);

  if (!isOpen) return null;

  const updateField = <K extends keyof LocalFormData>(field: K, value: LocalFormData[K]) => setFormData((prev) => ({ ...prev, [field]: value }));

  const addExtraPickupPoint = () => {
    if (!pickupPointsClientId) {
      setExtraPickupError('Сначала выберите основного отправителя');
      return;
    }

    if (pickupClientPointsLoading) {
      setExtraPickupError('Точки клиента ещё загружаются');
      return;
    }

    if (pickupClientPoints.length === 0) {
      setExtraPickupError('У выбранного клиента нет магазинов');
      return;
    }

    setExtraPickupError('');
    setFormData((prev) => ({
      ...prev,
      extraPickupPoints: [...(prev.extraPickupPoints || []), { name: '', address: '' }],
    }));
  };

  const updateExtraPickupPoint = (index: number, field: keyof ExtraPickupPoint, value: string) => {
    setFormData((prev) => ({
      ...prev,
      extraPickupPoints: (prev.extraPickupPoints || []).map((point, pointIndex) => (
        pointIndex === index ? { ...point, [field]: value } : point
      )),
    }));
  };

  const addRequestFiles = (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);

    if (selectedFiles.length === 0) return;

    setFormData((prev) => ({
      ...prev,
      requestFiles: [...(prev.requestFiles || []), ...selectedFiles],
    }));

    if (requestFileInputRef.current) {
      requestFileInputRef.current.value = '';
    }
  };

  const removeRequestFile = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      requestFiles: (prev.requestFiles || []).filter((_, fileIndex) => fileIndex !== index),
    }));
  };

  const removeExtraPickupPoint = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      extraPickupPoints: (prev.extraPickupPoints || []).filter((_, pointIndex) => pointIndex !== index),
    }));
  };

  const selectTransportCompanyForRequest = (companyId: number | null) => {
    if (!companyId) {
      updateField('tcName', '');
      updateField('tcAddress', '');
      return;
    }

    const company = transportCompanies.find((item) => item.id === companyId);
    if (!company) return;

    setFormData((prev) => ({
      ...prev,
      tcName: company.name,
      tcAddress: company.address,
    }));
  };

  const getExtraPickupAddresses = (points: ExtraPickupPoint[]) => (
    points
      .map((point) => point.address.trim())
      .filter(Boolean)
  );

  const joinPickupAddresses = (mainAddress: string | undefined, points: ExtraPickupPoint[]) => (
    [mainAddress?.trim() || '', ...getExtraPickupAddresses(points)]
      .filter(Boolean)
      .join(', ')
  );

  const updateTariff = (field: 'nutsTariff' | 'cedroilTariff', value: number) => {
    updateField(field, value);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(field === 'nutsTariff' ? NUTS_TARIFF_STORAGE_KEY : CEDROIL_TARIFF_STORAGE_KEY, String(value));
  };

  const selectClient = (clientId: number | undefined, target: 'sender' | 'recipient' | 'pickupClient' | 'pickupRecipient') => {
    const client = clients.find((item) => item.id === clientId);
    setFormData((prev) => {
      if (!client) return { ...prev, [`${target}ClientId`]: undefined };
      if (target === 'sender') return { ...prev, senderClientId: client.id, senderName: client.name, senderPhone: client.phone || '', senderAddress: client.address };
      if (target === 'recipient') return { ...prev, recipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      if (target === 'pickupRecipient') return { ...prev, pickupRecipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      return { ...prev, clientId: client.id, senderName: client.name, senderPhone: client.phone || '', senderAddress: client.address };
    });
  };

  const selectNutsOwnerClient = (clientId: number | undefined) => {
    setNutsOwnerClientId(clientId);

    if (typeof window !== 'undefined') {
      if (clientId) {
        window.localStorage.setItem(NUTS_OWNER_CLIENT_STORAGE_KEY, String(clientId));
      } else {
        window.localStorage.removeItem(NUTS_OWNER_CLIENT_STORAGE_KEY);
      }
    }

    setFormData((prev) => ({
      ...prev,
      clientId,
      recipientClientId: undefined,
      recipientName: '',
      recipientPhone: '',
      deliveryAddress: '',
    }));
  };

  const selectNutsRegularClient = (regularClientId: number | null) => {
    if (!regularClientId) {
      setFormData((prev) => ({
        ...prev,
        clientId: nutsOwnerClientId,
        recipientClientId: undefined,
        recipientName: '',
        recipientPhone: '',
        deliveryAddress: '',
      }));
      return;
    }

    const item = nutsRegularClients.find((regularClient) => regularClient.id === regularClientId);
    if (!item) return;

    setFormData((prev) => ({
      ...prev,
      clientId: nutsOwnerClientId,
      recipientClientId: undefined,
      recipientName: item.name || '',
      recipientPhone: item.phone || '',
      deliveryAddress: item.address || '',
    }));
  };

  const selectClientPointForTask = (clientId: number, pointId: number, target: 'sender' | 'recipient') => {
    const client = clients.find((item) => item.id === clientId);
    const point = (tcClientPointsMap[clientId] || []).find((item) => item.id === pointId);

    if (!client || !point) return;

    setFormData((prev) => {
      if (target === 'sender') {
        return {
          ...prev,
          senderClientId: client.id,
          senderName: client.name,
          senderPhone: point.phone || client.phone || '',
          senderAddress: point.address || client.address,
        };
      }

      return {
        ...prev,
        recipientClientId: client.id,
        recipientName: client.name,
        recipientPhone: point.phone || client.phone || '',
        deliveryAddress: point.address || client.address,
      };
    });
  };

  const toggleTcRecipientClient = (clientId: number) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;

    setFormData((prev) => ({
      ...prev,
      pickupRecipientClientId: client.id,
      recipientName: client.name,
      recipientPhone: client.phone || '',
      deliveryAddress: client.address,
    }));

    setExpandedTcClientId((current) => (current === client.id ? null : client.id));
    setTcRecipientDropdownOpen(true);
  };

  const selectTcRecipientPoint = (clientId: number, pointId: number) => {
    const client = clients.find((item) => item.id === clientId);
    const point = (tcClientPointsMap[clientId] || []).find((item) => item.id === pointId);

    if (!client || !point) return;

    setFormData((prev) => ({
      ...prev,
      pickupRecipientClientId: client.id,
      recipientName: client.name,
      recipientPhone: point.phone || client.phone || '',
      deliveryAddress: point.address || client.address,
    }));

    setExpandedTcClientId(client.id);
    setTcRecipientDropdownOpen(false);
  };

  const clearTcRecipient = () => {
    setFormData((prev) => ({
      ...prev,
      pickupRecipientClientId: undefined,
      recipientName: '',
      recipientPhone: '',
      deliveryAddress: '',
    }));
    setExpandedTcClientId(null);
    setTcRecipientDropdownOpen(false);
  };

  const selectedTcRecipientLabel = (() => {
    if (!formData.pickupRecipientClientId) return '-- Не выбрано --';

    const client = clients.find((item) => item.id === formData.pickupRecipientClientId);
    const point = (tcClientPointsMap[formData.pickupRecipientClientId] || []).find((item) => item.address && item.address === formData.deliveryAddress);

    if (client && point) return `${client.name} / ${point.name}`;

    return client?.name || '-- Не выбрано --';
  })();

  const updateNutsBox = (boxId: string, patch: Partial<NutsBox>) => {
    updateField('nutsBoxes', (formData.nutsBoxes || []).map((box) => (box.id === boxId ? { ...box, ...patch } : box)));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { senderClientId, recipientClientId, pickupRecipientClientId, pickupDirection, nutsBoxes, nutsTariff, cedroilTariff, extraPickupPoints, requestFiles, ...payload } = formData;
    const pickupPoints = extraPickupPoints || [];
    const combinedSenderAddress = requestType === 'pickup_from_tc'
      ? joinPickupAddresses(payload.tcAddress, pickupPoints)
      : joinPickupAddresses(payload.senderAddress, pickupPoints);
    const baseComments = requestType === 'pickup_from_tc'
      ? [payload.comments, pickupDirection === 'recipient_to_tc' ? 'Направление: получатель → ТК' : 'Направление: ТК → получатель'].filter(Boolean).join('\n')
      : payload.comments;

    onSubmit({
      ...payload,
      requestType,
      senderAddress: combinedSenderAddress || payload.senderAddress,
      tcAddress: requestType === 'pickup_from_tc' ? (combinedSenderAddress || payload.tcAddress) : payload.tcAddress,
      recipientName: payload.recipientName || payload.senderName || '',
      recipientPhone: payload.recipientPhone || payload.senderPhone || '',
      deliveryAddress: payload.deliveryAddress || payload.recipientAddress || combinedSenderAddress || payload.senderAddress || '',
      items: requestType === 'nuts' ? (nutsBoxes || []).filter((box) => box.quantity > 0).map((box) => `${box.name}: ${box.quantity}`).join('; ') : payload.items,
      description: requestType === 'nuts' ? `Орехи. Сумма: ${nutsTotal.toFixed(2)}` : payload.description,
      comments: baseComments,
      requestFiles,
      clientId: requestType === 'pickup_from_tc' ? pickupRecipientClientId : payload.clientId,
    });
    if (mode === 'create') {
      setFormData(makeInitialFormData());
    }
  };
  const selectedTransportCompanyId = transportCompanies.find((company) => (
    company.name === formData.tcName && company.address === formData.tcAddress
  ))?.id ?? null;

  const requestTypeLabel = REQUEST_TYPE_LABELS[requestType] || "Заявка";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-h-[92vh] w-[min(1180px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20" overlayStyle={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)' }}>
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
        <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Создать заявку</h2>

          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="whitespace-nowrap text-sm font-semibold text-slate-700">Дата заявки</span>
            <input
              type="date"
              value={formData.requestDate || getLocalDateKey()}
              onChange={(event) => updateField('requestDate', event.target.value)}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none focus:border-slate-300"
            />
          </label>

          <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 md:block">
            {requestTypeLabel}
          </div>

          <button type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-950 md:static"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {requestType !== 'nuts' && requestType !== 'pickup_from_tc' && requestType !== 'simple' && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Section title="Отправитель"><div className="grid gap-2.5 md:grid-cols-2">{(requestType === 'delivery' || requestType === 'movement') && <ClientStoreSelect label="Выберите отправителя" value={formData.senderClientId} addressValue={formData.senderAddress} clients={clients} pointsMap={tcClientPointsMap} onClientChange={(id) => selectClient(id, 'sender')} onPointChange={(clientId, pointId) => selectClientPointForTask(clientId, pointId, 'sender')} className="md:col-span-2" />}<Field label="Отправитель *" value={formData.senderName || ''} onChange={(value) => updateField('senderName', value)} required /><Field label="Телефон отправителя" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} />{requestType === 'courier_call' && <><Field label="Компания отправителя" value={formData.senderCompany || ''} onChange={(value) => updateField('senderCompany', value)} /><Field label="Город отправителя" value={formData.senderCity || ''} onChange={(value) => updateField('senderCity', value)} /></>}<Field label="Адрес отправителя *" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} required className="md:col-span-2" /></div></Section>
              <Section title="Получатель"><div className="grid gap-2.5 md:grid-cols-2">{requestType === 'movement' && <ClientStoreSelect label="Выберите получателя" value={formData.recipientClientId} addressValue={formData.deliveryAddress} clients={clients} pointsMap={tcClientPointsMap} onClientChange={(id) => selectClient(id, 'recipient')} onPointChange={(clientId, pointId) => selectClientPointForTask(clientId, pointId, 'recipient')} className="md:col-span-2" />}<Field label="Получатель *" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} required /><Field label="Телефон получателя *" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} required />{requestType === 'courier_call' && <><Field label="Компания получателя" value={formData.recipientCompany || ''} onChange={(value) => updateField('recipientCompany', value)} /><Field label="Город получателя" value={formData.recipientCity || ''} onChange={(value) => updateField('recipientCity', value)} /></>}<Field label="Адрес доставки *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required className="md:col-span-2" />{requestType !== 'courier_call' && <Field label="Квартира/офис" value={formData.recipientAddress || ''} onChange={(value) => updateField('recipientAddress', value)} className="md:col-span-2" />}</div></Section>
            </div>
          )}

          {(['delivery', 'movement'].includes(requestType)) && (
            <Section title="Дополнительные точки забора">
                <div className="space-y-3">
                  {(formData.extraPickupPoints || []).map((point, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">Точка забора {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeExtraPickupPoint(index)}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                        >
                          Удалить
                        </button>
                      </div>

                      <PointSelect
                          label="Магазин / точка клиента"
                          value={point.address}
                          points={pickupClientPoints}
                          loading={pickupClientPointsLoading}
                          disabled={!pickupPointsClientId || pickupClientPointsLoading || pickupClientPoints.length === 0}
                          onChange={(address) => updateExtraPickupPoint(index, 'address', address)}
                        />
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={addExtraPickupPoint}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      + Добавить точку забора
                    </button>

                    {extraPickupError && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                        {extraPickupError}
                      </span>
                    )}
                  </div>
                </div>
              </Section>

          )}



          {requestType === 'simple' && <Section title="Информация"><div className="grid gap-2.5 md:grid-cols-2"><Field label="Откуда (адрес) *" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} required className="md:col-span-2" /><Field label="Имя *" value={formData.senderName || ''} onChange={(value) => updateField('senderName', value)} required /><Field label="Телефон *" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} required /><Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} /><Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} />

<div>
<label className="mb-1 block text-sm font-medium leading-none text-slate-700">
Количество мест
</label>

<input
type="text"
inputMode="numeric"
placeholder="Не указано"
name="placesCountManual"
autoComplete="off"
value={formData.placesCount ?? ""}
onChange={(e) =>
updateField(
"placesCount",
e.target.value === ""
? undefined
: Number(e.target.value)
)
}
className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
/>
</div>

<TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-2" /></div></Section>}

          {requestType !== 'nuts' && requestType !== 'pickup_from_tc' && requestType !== 'simple' && (
            <Section title="Детали доставки">
              <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} />
                <Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} />

                <div>
                  <label className="mb-1 block text-sm font-medium leading-none text-slate-700">
                    Количество мест
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Не указано"
                    name="placesCountManual"
                    autoComplete="off"
                    value={formData.placesCount ?? ""}
                    onChange={(e) =>
                      updateField(
                        "placesCount",
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value)
                      )
                    }
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                  />
                </div>

                {requestType === 'delivery' ? (
                  <SelectField
                    label="Способ оплаты"
                    value={formData.paymentMethod || 'paid'}
                    onChange={(value) => updateField('paymentMethod', value as TaskFormData['paymentMethod'])}
                    options={[["paid", "Оплачено"], ["transfer", "Перевод"], ["cash", "Наличные"], ["terminal", "Терминал"], ["qr", "QR-код"]]}
                  />
                ) : (
                  <div className="hidden lg:block" />
                )}

                {requestType === 'delivery' && formData.paymentMethod !== 'paid' && (
                  <Field
                    label="Сумма оплаты"
                    type="number"
                    value={formData.paymentAmount || ''}
                    onChange={(value) => updateField('paymentAmount', Number(value) || 0)}
                  />
                )}

                <TextareaField
                  label="Комментарии"
                  value={formData.comments || ''}
                  onChange={(value) => updateField('comments', value)}
                  className="md:col-span-2 lg:col-span-4"
                />
              </div>
            </Section>
          )}

          {requestType === 'nuts' && <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]"><Section title="Коробки Орехов"><div className="space-y-2">{(formData.nutsBoxes || []).map((box, index) => <div key={box.id} className="grid grid-cols-[1fr_76px_108px] items-center gap-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{box.name}</div><input aria-label={`Количество ${box.name}`} type="number" min="0" value={box.quantity} onChange={(event) => updateNutsBox(box.id, { quantity: Number(event.target.value) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-300 focus:bg-white" /><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium text-slate-700">{(index === 5 ? (box.quantity || 0) * (formData.cedroilTariff || 0) : (box.quantity || 0) * (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0)).toFixed(2)}</div></div>)}<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><div className="flex justify-between gap-4"><span className="font-semibold text-slate-900">Итого сумма:</span><span className="font-bold text-slate-950">{nutsTotal.toFixed(2)}</span></div></div><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} /></div></Section><div className="space-y-3"><Section title="Получатель"><div className="grid gap-2.5"><ClientSelect label="Клиент Орехов" value={nutsOwnerClientId} clients={clients} onChange={selectNutsOwnerClient} /><NutsRegularClientSelect label="Выберите получателя" value={nutsRegularClients.find((item) => item.name === formData.recipientName && item.address === formData.deliveryAddress)?.id ?? null} items={nutsRegularClients} loading={nutsRegularClientsLoading} ownerFound={Boolean(nutsOwnerClient)} onChange={selectNutsRegularClient} /><Field label="Получатель *" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} required /><Field label="Телефон получателя *" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} required /><Field label="Адрес доставки *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required /></div></Section><Section title="Тарифы"><div className="grid gap-2.5"><Field label="Орехи, руб. за кг" type="number" value={formData.nutsTariff || ''} onChange={(value) => updateTariff('nutsTariff', Number(value) || 0)} /><Field label="Кедровое масло, руб." type="number" value={formData.cedroilTariff || ''} onChange={(value) => updateTariff('cedroilTariff', Number(value) || 0)} /><p className="text-xs leading-4 text-slate-500">Сейчас тарифы сохраняются на этом рабочем месте. Для общего хранения нужна backend-настройка в базе.</p></div></Section></div></div>}

          {requestType === 'pickup_from_tc' && <><div className="grid gap-3 lg:grid-cols-2"><Section title="Транспортная компания"><div className="grid gap-2.5 md:grid-cols-2"><SelectField label="Направление" value={formData.pickupDirection || 'tc_to_recipient'} onChange={(value) => updateField('pickupDirection', value as LocalFormData['pickupDirection'])} options={[["tc_to_recipient", "ТК → получатель"], ["recipient_to_tc", "Получатель → ТК"]]} className="md:col-span-2" /><TransportCompanySelect label="Транспортная компания" value={selectedTransportCompanyId} companies={transportCompanies} onChange={selectTransportCompanyForRequest} className="md:col-span-2" /><Field label="Адрес ТК" value={formData.tcAddress || ''} onChange={(value) => updateField('tcAddress', value)} className="md:col-span-2" /><Field label="Номер трекинга" value={formData.trackingNumber || ''} onChange={(value) => updateField('trackingNumber', value)} className="md:col-span-2" /></div></Section><Section title="Получатель"><div className="grid gap-2.5 md:grid-cols-2"><div className="relative md:col-span-2"><label className="mb-1 block text-sm font-medium leading-none text-slate-700">Выберите получателя</label><button type="button" onClick={() => setTcRecipientDropdownOpen((value) => !value)} className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm text-slate-900 outline-none transition ${tcRecipientDropdownOpen ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white' : 'rounded-2xl bg-slate-50 hover:bg-white'}`}><span className={formData.pickupRecipientClientId ? 'truncate' : 'truncate text-slate-500'}>{selectedTcRecipientLabel}</span><span className="text-slate-400">{tcRecipientDropdownOpen ? '−' : '⌄'}</span></button>{tcRecipientDropdownOpen && <div className="absolute left-0 right-0 top-full z-[80] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10"><button type="button" onClick={clearTcRecipient} className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50">-- Не выбрано --</button>{clients.map((client) => { const points = tcClientPointsMap[client.id] || []; const isExpanded = expandedTcClientId === client.id; const isClientSelected = formData.pickupRecipientClientId === client.id; return <div key={client.id} className="mt-0.5"><button type="button" onClick={() => toggleTcRecipientClient(client.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isClientSelected ? 'bg-slate-950 text-white' : 'text-slate-900 hover:bg-slate-50'}`}><span className="truncate">{client.name}</span><span className={isClientSelected ? 'text-white/70' : 'text-slate-400'}>{isExpanded ? '−' : '+'}</span></button>{isExpanded && <div className="mt-1 space-y-0.5 rounded-xl bg-slate-50 p-1">{points.length > 0 ? points.map((point) => <button key={point.id} type="button" onClick={() => selectTcRecipientPoint(client.id, point.id)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${point.address && point.address === formData.deliveryAddress ? 'bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><span className="block truncate">{point.name || 'Магазин'}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{point.address || 'Адрес не указан'}</span></button>) : <div className="px-3 py-2 text-xs text-slate-400">У клиента нет магазинов</div>}</div>}</div>; })}</div>}</div><Field label="Получатель" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} /><Field label="Телефон получателя" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} /><Field label="Адрес доставки" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} className="md:col-span-2" /><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-2" /></div></Section></div></>}

          {(['pickup_from_tc', 'simple'].includes(requestType)) && (
            <Section title="Дополнительные точки забора">
                <div className="space-y-3">
                  {(formData.extraPickupPoints || []).map((point, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">Точка забора {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeExtraPickupPoint(index)}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                        >
                          Удалить
                        </button>
                      </div>

                      <PointSelect
                          label="Магазин / точка клиента"
                          value={point.address}
                          points={pickupClientPoints}
                          loading={pickupClientPointsLoading}
                          disabled={!pickupPointsClientId || pickupClientPointsLoading || pickupClientPoints.length === 0}
                          onChange={(address) => updateExtraPickupPoint(index, 'address', address)}
                        />
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={addExtraPickupPoint}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      + Добавить точку забора
                    </button>

                    {extraPickupError && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                        {extraPickupError}
                      </span>
                    )}
                  </div>
                </div>
              </Section>

          )}

          {requestType !== 'nuts' && (
            <Section title="Файлы для курьера">
              <div className="space-y-3">
                {(formData.requestFiles || []).length > 0 && (
                  <div className="space-y-2">
                    {(formData.requestFiles || []).map((file, index) => (
                      <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{file.name}</p>
                          <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} МБ</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRequestFile(index)}
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={requestFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => addRequestFiles(event.target.files)}
                />

                <button
                  type="button"
                  onClick={() => requestFileInputRef.current?.click()}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  + Добавить файл
                </button>
              </div>
            </Section>
          )}

        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Отмена</button><button type="submit" disabled={isLoading} className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? (mode === 'edit' ? 'Сохранение...' : 'Создание...') : (submitLabel || (mode === 'edit' ? 'Сохранить изменения' : 'Создать заявку'))}</button></div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"><h3 className="mb-2.5 text-sm font-semibold leading-none text-slate-950">{title}</h3>{children}</section>; }
function Field({ label, value, onChange, required, type = 'text', className = '' }: { label: string; value: string | number; onChange: (value: string) => void; required?: boolean; type?: string; className?: string }) {
  const isAddressField = label.toLowerCase().includes('адрес');
  const inputType = isAddressField && type === 'text' ? 'search' : type;

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <input
        type={inputType}
        name={isAddressField ? 'mig-field-no-browser-fill' : undefined}
        autoComplete={isAddressField ? 'new-password' : undefined}
        autoCorrect={isAddressField ? 'off' : undefined}
        autoCapitalize={isAddressField ? 'off' : undefined}
        spellCheck={isAddressField ? false : undefined}
        data-form-type={isAddressField ? 'other' : undefined}
        data-lpignore={isAddressField ? 'true' : undefined}
        data-1p-ignore={isAddressField ? 'true' : undefined}
        readOnly={isAddressField ? true : undefined}
        onMouseDown={(event) => {
          if (isAddressField) {
            event.currentTarget.removeAttribute('readonly');
          }
        }}
        onTouchStart={(event) => {
          if (isAddressField) {
            event.currentTarget.removeAttribute('readonly');
          }
        }}
        onFocus={(event) => {
          if (isAddressField) {
            event.currentTarget.removeAttribute('readonly');
          }
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        required={required}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
      />
    </div>
  );
}

function TransportCompanySelect({
  label,
  value,
  companies,
  onChange,
  className = '',
}: {
  label: string;
  value: number | null;
  companies: TransportCompany[];
  onChange: (value: number | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedCompany = companies.find((company) => company.id === value);
  const disabled = companies.length === 0;

  const handleSelect = (companyId: number | null) => {
    onChange(companyId);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white text-slate-900' : 'rounded-2xl bg-slate-50 text-slate-900 hover:bg-white'}`}
      >
        <span className={selectedCompany ? 'truncate' : 'truncate text-slate-500'}>
          {selectedCompany ? selectedCompany.name : disabled ? 'Сначала добавьте ТК в Контрагентах' : '-- Выберите ТК --'}
        </span>
        <span className="ml-2 shrink-0 text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${!value ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            -- Не выбрано --
          </button>

          {companies.map((company) => {
            const isSelected = company.id === value;

            return (
              <button
                key={company.id}
                type="button"
                onClick={() => handleSelect(company.id)}
                className={`mt-0.5 block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${isSelected ? 'bg-slate-950 font-semibold text-white' : 'text-slate-900 hover:bg-slate-50'}`}
              >
                <span className="block truncate font-medium">{company.name}</span>
                <span className={`mt-0.5 block truncate text-xs ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                  {company.address}
                </span>
                {(company.phone || company.contactPerson) && (
                  <span className={`mt-0.5 block truncate text-xs ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                    {[company.contactPerson, company.phone].filter(Boolean).join(' • ')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function PointSelect({
  label,
  value,
  points,
  loading,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  points: ClientPoint[];
  loading: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedPoint = points.find((point) => point.address === value);
  const placeholder = loading
    ? 'Загрузка точек...'
    : points.length === 0
      ? 'Нет магазинов'
      : '-- Выберите магазин / точку --';

  const handleSelect = (address: string) => {
    onChange(address);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white text-slate-900' : 'rounded-2xl bg-white text-slate-900 hover:bg-slate-50'}`}
      >
        <span className={selectedPoint ? 'truncate' : 'truncate text-slate-500'}>
          {selectedPoint ? selectedPoint.name : placeholder}
        </span>
        <span className="text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          <button
            type="button"
            onClick={() => handleSelect('')}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${!value ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            -- Не выбрано --
          </button>

          {points.map((point) => {
            const isSelected = point.address === value;

            return (
              <button
                key={point.id}
                type="button"
                onClick={() => handleSelect(point.address)}
                className={`mt-0.5 block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${isSelected ? 'bg-slate-950 font-semibold text-white' : 'text-slate-900 hover:bg-slate-50'}`}
              >
                <span className="block truncate font-medium">{point.name || 'Магазин'}</span>
                <span className={`mt-0.5 block truncate text-xs ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                  {point.address || 'Адрес не указан'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function SelectField({ label, value, onChange, options, className = '' }: { label: string; value: string | number; onChange: (value: string) => void; options: Array<[string | number, string]>; className?: string }) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find(([optionValue]) => String(optionValue) === String(value));
  const selectedLabel = selectedOption?.[1] || '-- Не выбрано --';

  const handleSelect = (optionValue: string | number) => {
    onChange(String(optionValue));
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm text-slate-900 outline-none transition ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white' : 'rounded-2xl bg-slate-50 hover:bg-white'}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          {options.map(([optionValue, labelText]) => {
            const isSelected = String(optionValue) === String(value);

            return (
              <button
                key={String(optionValue)}
                type="button"
                onClick={() => handleSelect(optionValue)}
                className={`mt-0.5 block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${isSelected ? 'bg-slate-950 font-semibold text-white' : 'text-slate-900 hover:bg-slate-50'}`}
              >
                <span className="block truncate">{labelText}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function NutsRegularClientSelect({
  label,
  value,
  items,
  loading,
  ownerFound,
  onChange,
}: {
  label: string;
  value: number | null;
  items: ClientRegularClient[];
  loading: boolean;
  ownerFound: boolean;
  onChange: (value: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedItem = items.find((item) => item.id === value);
  const placeholder = loading
    ? 'Загрузка постоянных клиентов...'
    : !ownerFound
      ? 'Сначала выберите клиента Орехов'
      : items.length === 0
        ? 'Нет постоянных клиентов'
        : '-- Выберите получателя --';

  const disabled = loading || !ownerFound || items.length === 0;

  const handleSelect = (itemId: number | null) => {
    onChange(itemId);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white text-slate-900' : 'rounded-2xl bg-slate-50 text-slate-900 hover:bg-white'}`}
      >
        <span className={selectedItem ? 'truncate' : 'truncate text-slate-500'}>
          {selectedItem ? selectedItem.name : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${!value ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            -- Не выбрано --
          </button>

          {items.map((item) => {
            const isSelected = item.id === value;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`mt-0.5 block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${isSelected ? 'bg-slate-950 font-semibold text-white' : 'text-slate-900 hover:bg-slate-50'}`}
              >
                <span className="block truncate font-medium">{item.name}</span>
                {item.address && (
                  <span className={`mt-0.5 block truncate text-xs ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                    {item.address}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function ClientStoreSelect({
  label,
  value,
  addressValue,
  clients,
  pointsMap,
  onClientChange,
  onPointChange,
  className = '',
}: {
  label: string;
  value?: number;
  addressValue?: string;
  clients: Client[];
  pointsMap: Record<number, ClientPoint[]>;
  onClientChange: (value: number | undefined) => void;
  onPointChange: (clientId: number, pointId: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const selectedClient = clients.find((client) => client.id === value);
  const selectedPoint = value ? (pointsMap[value] || []).find((point) => point.address && point.address === addressValue) : undefined;

  const selectedLabel = selectedClient
    ? selectedPoint
      ? `${selectedClient.name} / ${selectedPoint.name || 'Магазин'}`
      : selectedClient.name
    : '-- Не выбрано --';

  const handleClientClick = (clientId: number) => {
    onClientChange(clientId);
    setExpandedClientId((current) => (current === clientId ? null : clientId));
    setOpen(true);
  };

  const handlePointClick = (clientId: number, pointId: number) => {
    onPointChange(clientId, pointId);
    setExpandedClientId(clientId);
    setOpen(false);
  };

  const handleClear = () => {
    onClientChange(undefined);
    setExpandedClientId(null);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm text-slate-900 outline-none transition ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white' : 'rounded-2xl bg-slate-50 hover:bg-white'}`}
      >
        <span className={selectedClient ? 'truncate' : 'truncate text-slate-500'}>{selectedLabel}</span>
        <span className="text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          <button
            type="button"
            onClick={handleClear}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${!value ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            -- Не выбрано --
          </button>

          {clients.map((client) => {
            const points = pointsMap[client.id] || [];
            const isExpanded = expandedClientId === client.id;
            const isClientSelected = value === client.id;

            return (
              <div key={client.id} className="mt-0.5">
                <button
                  type="button"
                  onClick={() => handleClientClick(client.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isClientSelected ? 'bg-slate-950 text-white' : 'text-slate-900 hover:bg-slate-50'}`}
                >
                  <span className="truncate">{client.name}</span>
                  <span className={isClientSelected ? 'text-white/70' : 'text-slate-400'}>{isExpanded ? '−' : '+'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-1 space-y-0.5 rounded-xl bg-slate-50 p-1">
                    {points.length > 0 ? points.map((point) => (
                      <button
                        key={point.id}
                        type="button"
                        onClick={() => handlePointClick(client.id, point.id)}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${point.address && point.address === addressValue ? 'bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}
                      >
                        <span className="block truncate">{point.name || 'Магазин'}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{point.address || 'Адрес не указан'}</span>
                      </button>
                    )) : (
                      <div className="px-3 py-2 text-xs text-slate-400">У клиента нет магазинов</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function ClientSelect({ label, value, clients, onChange, className = '' }: { label: string; value?: number; clients: Client[]; onChange: (value: number | undefined) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const selectedClient = clients.find((client) => client.id === value);

  const handleSelect = (clientId: number | undefined) => {
    onChange(clientId);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between border border-slate-200 px-4 text-left text-sm text-slate-900 outline-none transition ${open ? 'rounded-t-2xl rounded-b-none border-slate-300 bg-white' : 'rounded-2xl bg-slate-50 hover:bg-white'}`}
      >
        <span className={selectedClient ? 'truncate' : 'truncate text-slate-500'}>
          {selectedClient ? selectedClient.name : '-- Не выбрано --'}
        </span>
        <span className="text-slate-400">{open ? '−' : '⌄'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[90] -mt-px max-h-72 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-300 bg-white p-1.5 shadow-lg shadow-slate-950/10">
          <button
            type="button"
            onClick={() => handleSelect(undefined)}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${!value ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            -- Не выбрано --
          </button>

          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client.id)}
              className={`mt-0.5 block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${value === client.id ? 'bg-slate-950 font-semibold text-white' : 'text-slate-900 hover:bg-slate-50'}`}
            >
              <span className="block truncate font-medium">{client.name}</span>
              {client.address && (
                <span className={`mt-0.5 block truncate text-xs ${value === client.id ? 'text-white/70' : 'text-slate-400'}`}>
                  {client.address}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function TextareaField({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} rows={3} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm leading-5 outline-none transition focus:border-slate-300 focus:bg-white" /></div>; }
