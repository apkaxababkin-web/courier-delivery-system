import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import { AppSelect } from '../../../../components/AppSelect';
import { getLocalDateKey } from '../../../../lib/local-time';
import {
  getClientPoints,
  getClientRegularClients,
  getPartners,
  getTransportCompanies,
  type ClientPoint,
  type ClientRegularClient,
  type Partner,
  type TransportCompany,
} from '../../../../lib/api';
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

type RoutePartyOption = {
  key: string;
  name: string;
  address: string;
  phone: string;
  description: string;
  clientId: number;
  pointId?: number;
};

type LocalFormData = TaskFormData & {
  senderAddressDetails?: string;
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
  simple: 'Заявка',
};

const NUTS_TARIFF_STORAGE_KEY = 'courier-manager:nuts-tariff';
const CEDROIL_TARIFF_STORAGE_KEY = 'courier-manager:cedroil-tariff';
const NUTS_OWNER_CLIENT_STORAGE_KEY = 'courier-manager:nuts-owner-client-id';
const NUTS_WEIGHTS: Record<string, number> = { '1': 15, '2': 16, '3': 16.5, '4': 18, '5': 18, '6': 0 };
const NUTS_SHORT_LABELS: Record<string, string> = { '1': '0.1', '2': '0.2', '3': '0.3', '4': '0.5', '5': '1', '6': 'Кедровое масло' };
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

const cloneDefaultNutsBoxes = () => DEFAULT_NUTS_BOXES.map((box) => ({ ...box }));

const parseNutsBoxesFromItems = (items?: string, existingBoxes?: NutsBox[]): NutsBox[] => {
  const boxes = cloneDefaultNutsBoxes();
  const sourceBoxes = existingBoxes?.length ? existingBoxes : [];

  for (const box of sourceBoxes) {
    const target = boxes.find((item) => item.id === box.id || item.name === box.name);
    if (target) target.quantity = Number(box.quantity) || 0;
  }

  if (!items) return boxes;

  for (const part of items.split(/[;\n]+/)) {
    const text = part.trim();
    if (!text) continue;

    const quantityMatch = text.match(/(?:[:—-])\s*(\d+)/);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 0;
    if (!quantity) continue;

    const normalizedText = text.replace(/,/g, '.').toLocaleLowerCase('ru-RU');
    const target = boxes.find((box) => {
      const normalizedName = box.name.replace(/,/g, '.').toLocaleLowerCase('ru-RU');
      const shortLabel = (NUTS_SHORT_LABELS[box.id] || box.name).toLocaleLowerCase('ru-RU');
      return normalizedText.includes(normalizedName) || normalizedText.includes(shortLabel);
    });
    if (target) target.quantity = quantity;
  }

  return boxes;
};

const getNutsBoxTotal = (box: NutsBox, nutsTariff = 0, cedroilTariff = 0) => {
  const tariff = box.id === '6' ? cedroilTariff : (NUTS_WEIGHTS[box.id] || 0) * nutsTariff;
  return (Number(box.quantity) || 0) * tariff;
};

const calculateNutsTotal = (boxes: NutsBox[] = [], nutsTariff = 0, cedroilTariff = 0) => boxes.reduce(
  (sum, box) => sum + getNutsBoxTotal(box, nutsTariff, cedroilTariff),
  0,
);

const buildNutsOrderLines = (boxes: NutsBox[] = []) => boxes
  .filter((box) => (Number(box.quantity) || 0) > 0)
  .map((box) => {
    const quantity = Number(box.quantity) || 0;
    return box.id === '6'
      ? `Кедровое масло - ${quantity} шт.`
      : `${NUTS_SHORT_LABELS[box.id] || box.name} - ${quantity} кор.`;
  });

const buildNutsOrderSummary = (boxes: NutsBox[] = []) => {
  const lines = buildNutsOrderLines(boxes);
  return lines.length ? lines.join('\n') : 'Орехи';
};

const stripGeneratedNutsCommentLines = (comments?: string) => String(comments || '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('Орехи:') && !line.startsWith('Сумма:'))
  .join('\n');

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
  senderAddressDetails: '',
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
  nutsBoxes: cloneDefaultNutsBoxes(),
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
  const [partners, setPartners] = useState<Partner[]>([]);
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
  const sortedBillingClients = useMemo(() => {
    const getUsageScore = (client: Client) => {
      const record = client as Client & Record<string, unknown>;
      const numericScore = Number(record.usageCount ?? record.requestsCount ?? record.ordersCount ?? 0);
      return Number.isFinite(numericScore) ? numericScore : 0;
    };

    const getLastUsedTime = (client: Client) => {
      const record = client as Client & Record<string, unknown>;
      const value = typeof record.lastUsedAt === 'string' ? record.lastUsedAt : '';
      const timestamp = value ? Date.parse(value) : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    return [...clients].sort((a, b) => {
      const scoreDelta = getUsageScore(b) - getUsageScore(a);
      if (scoreDelta !== 0) return scoreDelta;

      const lastUsedDelta = getLastUsedTime(b) - getLastUsedTime(a);
      if (lastUsedDelta !== 0) return lastUsedDelta;

      const nameDelta = a.name.localeCompare(b.name, 'ru');
      if (nameDelta !== 0) return nameDelta;

      return a.id - b.id;
    });
  }, [clients]);

  const routePartyOptions = useMemo<RoutePartyOption[]>(() => {
    const client = formData.clientId ? clients.find((item) => item.id === formData.clientId) : undefined;
    if (!client) return [];

    const clientOption: RoutePartyOption = {
      key: `client:${client.id}`,
      name: client.name,
      address: client.address || '',
      phone: client.phone || '',
      description: client.address || 'Основной адрес',
      clientId: client.id,
    };

    const pointOptions = (tcClientPointsMap[client.id] || []).map((point) => ({
      key: `point:${client.id}:${point.id}`,
      name: point.name ? `${client.name} / ${point.name}` : client.name,
      address: point.address || '',
      phone: point.phone || client.phone || '',
      description: [point.address, point.phone || client.phone].filter(Boolean).join(' · ') || 'Точка клиента',
      clientId: client.id,
      pointId: point.id,
    }));

    return [clientOption, ...pointOptions];
  }, [clients, formData.clientId, tcClientPointsMap]);
  const pickupPointsClientId = formData.clientId;

  useEffect(() => {
    if (!isOpen) return;

    const base = makeInitialFormData();
    const initialNutsBoxes = parseNutsBoxesFromItems(
      initialData?.items,
      (initialData as Partial<LocalFormData> | null)?.nutsBoxes,
    );

    setFormData({
      ...base,
      ...(initialData || {}),
      requestType: initialData?.requestType || base.requestType,
      comments: initialData?.requestType === 'nuts'
        ? stripGeneratedNutsCommentLines(initialData.comments)
        : initialData?.comments || base.comments,
      nutsBoxes: initialNutsBoxes,
      nutsTariff: base.nutsTariff,
      cedroilTariff: base.cedroilTariff,
    });
  }, [isOpen, initialData]);

  const nutsTotal = useMemo(() => calculateNutsTotal(
    formData.nutsBoxes || [],
    formData.nutsTariff || 0,
    formData.cedroilTariff || 0,
  ), [formData.nutsBoxes, formData.nutsTariff, formData.cedroilTariff]);

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
    if (!isOpen) {
      setPartners([]);
      return;
    }

    let cancelled = false;

    async function loadPartnersForCourierCall() {
      try {
        const items = await getPartners();

        if (!cancelled) {
          setPartners((items || []).filter((item) => item.isActive !== false));
        }
      } catch (error) {
        console.error('Failed to load partners:', error);

        if (!cancelled) {
          setPartners([]);
        }
      }
    }

    void loadPartnersForCourierCall();

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

  const updateField = <K extends keyof LocalFormData>(
    field: K,
    value: LocalFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addExtraPickupPoint = () => {
    if (!pickupPointsClientId) {
      setExtraPickupError('Сначала выберите клиента / компанию');
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
      setFormData((prev) => ({
        ...prev,
        tcName: '',
        tcAddress: '',
        senderName: '',
        senderAddress: '',
      }));
      return;
    }

    const company = transportCompanies.find((item) => item.id === companyId);
    if (!company) return;

    setFormData((prev) => ({
      ...prev,
      tcName: company.name,
      tcAddress: company.address,
      senderName: company.name,
      senderAddress: company.address,
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
      if (target === 'sender') {
        return {
          ...prev,
          senderClientId: client.id,
          senderName: client.name,
          senderPhone: client.phone || '',
          senderAddress: client.address,
        };
      }
      if (target === 'recipient') return { ...prev, recipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      if (target === 'pickupRecipient') return { ...prev, pickupRecipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      return { ...prev, clientId: client.id };
    });
  };

  const selectUniversalClient = (clientId: number | undefined) => {
    setExtraPickupError('');
    setFormData((prev) => ({
      ...prev,
      clientId,
      extraPickupPoints: [],
    }));
  };

  const selectCourierCallPartner = (partnerId: number | undefined) => {
    const partner = partners.find((item) => item.id === partnerId);

    if (!partner) {
      setFormData((prev) => ({
        ...prev,
        senderCompany: '',
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      clientId: undefined,
      senderName: partner.name,
      senderCompany: partner.name,
      senderPhone: partner.phone || '',
    }));
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

  const selectRoutePartyOption = (option: RoutePartyOption, target: 'sender' | 'recipient') => {
    setFormData((prev) => {
      if (target === 'sender') {
        return {
          ...prev,
          senderClientId: option.clientId,
          senderName: option.name,
          senderPhone: option.phone,
          senderAddress: option.address,
        };
      }

      return {
        ...prev,
        recipientClientId: option.clientId,
        recipientName: option.name,
        recipientPhone: option.phone,
        deliveryAddress: option.address,
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
    const { senderAddressDetails, senderClientId, recipientClientId, pickupRecipientClientId, pickupDirection, nutsBoxes, nutsTariff, cedroilTariff, extraPickupPoints, requestFiles, ...payload } = formData;
    const isUniversalRequest = requestType !== 'nuts';
    const supportsExtraPickupPoints = (
      requestType === 'delivery'
      || requestType === 'movement'
      || requestType === 'pickup_from_tc'
    );

    const mainSenderAddress = [
      payload.senderAddress?.trim(),
      senderAddressDetails?.trim(),
    ].filter(Boolean).join(', ');

    const extraPickupAddresses = supportsExtraPickupPoints
      ? getExtraPickupAddresses(extraPickupPoints || [])
      : [];

    const universalSenderAddress = requestType === 'pickup_from_tc'
      ? mainSenderAddress
      : [mainSenderAddress, ...extraPickupAddresses].filter(Boolean).join(', ');

    const nutsSenderAddress = joinPickupAddresses(
      payload.senderAddress,
      extraPickupPoints || [],
    );

    const selectedNutsBoxes = (nutsBoxes || [])
      .filter((box) => (Number(box.quantity) || 0) > 0);

    const nutsItems = buildNutsOrderLines(selectedNutsBoxes).join('\n');
    const nutsSummary = buildNutsOrderSummary(selectedNutsBoxes);
    const nutsComments = stripGeneratedNutsCommentLines(payload.comments);

    const manualComments = String(payload.comments || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => (
        line
        && !line.startsWith('Направление:')
        && !line.startsWith('Дополнительные точки:')
      ))
      .join('\n');

    const requestComments = [
      requestType === 'pickup_from_tc'
        ? (
          pickupDirection === 'recipient_to_tc'
            ? 'Направление: получатель → ТК'
            : 'Направление: ТК → получатель'
        )
        : '',
      extraPickupAddresses.length > 0
        ? `Дополнительные точки: ${extraPickupAddresses.join('; ')}`
        : '',
      manualComments,
    ].filter(Boolean).join('\n');

    onSubmit({
      ...payload,
      requestType,
      senderAddress: isUniversalRequest ? universalSenderAddress : (nutsSenderAddress || payload.senderAddress),
      recipientName: isUniversalRequest ? (payload.recipientName || '') : (payload.recipientName || payload.senderName || ''),
      recipientPhone: isUniversalRequest ? (payload.recipientPhone || '') : (payload.recipientPhone || payload.senderPhone || ''),
      deliveryAddress: isUniversalRequest
        ? (payload.deliveryAddress || payload.recipientAddress || '')
        : (payload.deliveryAddress || payload.recipientAddress || nutsSenderAddress || payload.senderAddress || ''),
      packageDescription: requestType === 'nuts' ? nutsSummary : payload.packageDescription,
      items: requestType === 'nuts' ? nutsItems : payload.items,
      description: requestType === 'nuts' ? nutsSummary : payload.description,
      comments: requestType === 'nuts' ? nutsComments : requestComments,
      paymentAmount: requestType === 'nuts' ? nutsTotal : payload.paymentAmount,
      requestFiles,
      clientId: payload.clientId,
    });
    if (mode === 'create') {
      setFormData(makeInitialFormData());
    }
  };
  const selectedTransportCompanyId = transportCompanies.find((company) => (
    company.name === formData.tcName && company.address === formData.tcAddress
  ))?.id ?? null;

  const selectedCourierCallPartnerId = partners.find((partner) => (
    partner.name === formData.senderCompany
    || partner.name === formData.senderName
  ))?.id;

  const requestTypeLabel = REQUEST_TYPE_LABELS[requestType] || "Заявка";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-h-[92vh] w-[min(1180px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20" overlayStyle={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)' }}>
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
        <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Создать заявку</h2>

          <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 md:block">
            {requestTypeLabel}
          </div>

          <button type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-950 md:static"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
          <Section title="Основное">
            <div className={`grid gap-2.5 ${requestType === 'nuts' ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
              <SelectField
                label="Тип заявки"
                value={requestType}
                onChange={(value) => updateField('requestType', value as RequestType)}
                options={Object.entries(REQUEST_TYPE_LABELS)}
              />
              {requestType !== 'nuts' && (
                requestType === 'courier_call' ? (
                  <PartnerSelect
                    label="Клиент / компания"
                    value={selectedCourierCallPartnerId}
                    partners={partners}
                    onChange={selectCourierCallPartner}
                  />
                ) : (
                  <ClientSelect
                    label="Клиент / компания"
                    value={formData.clientId}
                    clients={sortedBillingClients}
                    onChange={selectUniversalClient}
                  />
                )
              )}
              <Field label="Дата" type="date" value={formData.requestDate || getLocalDateKey()} onChange={(value) => updateField('requestDate', value)} required />
              {requestType !== 'nuts' && (
                <>
                  <Field label="Заголовок" value={formData.packageDescription || ''} onChange={(value) => updateField('packageDescription', value)} />
                  <Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} />
                  <Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} />
                </>
              )}
            </div>
          </Section>

          {requestType !== 'nuts' && (
            <div className="space-y-3">
              <div className="space-y-3">
                <Section title="Отправитель">
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {requestType === 'pickup_from_tc' && (
                      <div className="xl:col-span-4">
                        <label className="mb-1 block text-sm font-medium leading-none text-slate-700">
                          Направление
                        </label>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => updateField('pickupDirection', 'tc_to_recipient')}
                            className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${
                              formData.pickupDirection !== 'recipient_to_tc'
                                ? 'bg-slate-950 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            ТК → клиент
                          </button>

                          <button
                            type="button"
                            onClick={() => updateField('pickupDirection', 'recipient_to_tc')}
                            className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${
                              formData.pickupDirection === 'recipient_to_tc'
                                ? 'bg-slate-950 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            Клиент → ТК
                          </button>
                        </div>
                      </div>
                    )}

                    {requestType === 'pickup_from_tc' && (
                      <TransportCompanySelect
                        label="Транспортная компания"
                        value={selectedTransportCompanyId}
                        companies={transportCompanies}
                        onChange={selectTransportCompanyForRequest}
                        className="xl:col-span-4"
                      />
                    )}
                    <RoutePartyField
                      label="Отправитель / компания *"
                      value={formData.senderName || ''}
                      options={routePartyOptions}
                      onChange={(value) => updateField('senderName', value)}
                      onSelect={(option) => selectRoutePartyOption(option, 'sender')}
                      emptyText={formData.clientId ? 'Нет точек по запросу' : 'Сначала выберите клиента / компанию'}
                      required
                    />
                    <Field label="Улица / адрес отправителя *" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} required />
                    <Field label="Квартира / офис отправителя" value={formData.senderAddressDetails || ''} onChange={(value) => updateField('senderAddressDetails', value)} />
                    <Field label="Телефон отправителя" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} />

                    {(requestType === 'delivery'
                      || requestType === 'movement'
                      || requestType === 'pickup_from_tc') && (
                      <div className="space-y-2 xl:col-span-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={addExtraPickupPoint}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                          >
                            + Добавить дополнительную точку
                          </button>

                          {extraPickupError && (
                            <span className="text-sm font-medium text-red-600">
                              {extraPickupError}
                            </span>
                          )}
                        </div>

                        {(formData.extraPickupPoints || []).map((point, index) => (
                          <div
                            key={`extra-pickup-${index}`}
                            className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                          >
                            <PointSelect
                              label={`Дополнительная точка ${index + 1}`}
                              value={point.address || ''}
                              points={pickupClientPoints}
                              loading={pickupClientPointsLoading}
                              disabled={!pickupPointsClientId || pickupClientPointsLoading}
                              onChange={(value) => {
                                const selectedPoint = pickupClientPoints.find(
                                  (item) => item.address === value,
                                );

                                updateExtraPickupPoint(index, 'address', value);
                                updateExtraPickupPoint(
                                  index,
                                  'name',
                                  selectedPoint?.name || '',
                                );
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => removeExtraPickupPoint(index)}
                              className="h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>

                <Section title="Получатель">
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <RoutePartyField
                      label="Получатель / компания *"
                      value={formData.recipientName || ''}
                      options={routePartyOptions}
                      onChange={(value) => updateField('recipientName', value)}
                      onSelect={(option) => selectRoutePartyOption(option, 'recipient')}
                      emptyText={formData.clientId ? 'Нет точек по запросу' : 'Сначала выберите клиента / компанию'}
                      required
                    />
                    <Field label="Улица / адрес получателя *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required />
                    <Field label="Квартира / офис получателя" value={formData.recipientAddress || ''} onChange={(value) => updateField('recipientAddress', value)} />
                    <Field label="Телефон получателя" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} />
                  </div>
                </Section>
              </div>

              <Section title="Комментарий">
                <TextareaField label="Комментарий к заявке" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} />
              </Section>

              <Section title="Детали">
                <div className="grid gap-2.5 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium leading-none text-slate-700">Кол-во мест</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Не указано"
                      name="placesCountManual"
                      autoComplete="off"
                      value={formData.placesCount ?? ''}
                      onChange={(event) => updateField('placesCount', event.target.value === '' ? undefined : Number(event.target.value))}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    />
                  </div>
                  <SelectField
                    label="Статус оплаты"
                    value={formData.paymentMethod || 'paid'}
                    onChange={(value) => updateField('paymentMethod', value as TaskFormData['paymentMethod'])}
                    options={[["paid", "Оплачено"], ["transfer", "Перевод"], ["cash", "Наличные"], ["terminal", "Терминал"], ["qr", "QR-код"]]}
                  />
                  <Field label="Сумма новой оплаты" type="number" value={formData.paymentAmount || ''} onChange={(value) => updateField('paymentAmount', Number(value) || 0)} />
                </div>
              </Section>

              <Section title="Прикрепление файла">
                <RequestFilesField files={formData.requestFiles || []} inputRef={requestFileInputRef} onAdd={addRequestFiles} onRemove={removeRequestFile} />
              </Section>
            </div>
          )}

          {requestType === 'nuts' && <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]"><Section title="Коробки Орехов"><div className="space-y-2">{(formData.nutsBoxes || []).map((box) => <div key={box.id} className="grid grid-cols-[1fr_76px_108px] items-center gap-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{box.name}</div><input aria-label={`Количество ${box.name}`} type="number" min="0" value={box.quantity} onChange={(event) => updateNutsBox(box.id, { quantity: Number(event.target.value) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-300 focus:bg-white" /><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium text-slate-700">{getNutsBoxTotal(box, formData.nutsTariff || 0, formData.cedroilTariff || 0).toFixed(2)}</div></div>)}<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><div className="flex justify-between gap-4"><span className="font-semibold text-slate-900">Итого сумма:</span><span className="font-bold text-slate-950">{nutsTotal.toFixed(2)}</span></div></div><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} /></div></Section><div className="space-y-3"><Section title="Получатель"><div className="grid gap-2.5"><ClientSelect label="Клиент Орехов" value={nutsOwnerClientId} clients={clients} onChange={selectNutsOwnerClient} /><NutsRegularClientSelect label="Выберите получателя" value={nutsRegularClients.find((item) => item.name === formData.recipientName && item.address === formData.deliveryAddress)?.id ?? null} items={nutsRegularClients} loading={nutsRegularClientsLoading} ownerFound={Boolean(nutsOwnerClient)} onChange={selectNutsRegularClient} /><Field label="Получатель *" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} required /><Field label="Телефон получателя *" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} required /><Field label="Адрес доставки *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required /></div></Section><Section title="Тарифы"><div className="grid gap-2.5"><Field label="Орехи, руб. за кг" type="number" value={formData.nutsTariff || ''} onChange={(value) => updateTariff('nutsTariff', Number(value) || 0)} /><Field label="Кедровое масло, руб." type="number" value={formData.cedroilTariff || ''} onChange={(value) => updateTariff('cedroilTariff', Number(value) || 0)} /><p className="text-xs leading-4 text-slate-500">Сейчас тарифы сохраняются на этом рабочем месте. Для общего хранения нужна backend-настройка в базе.</p></div></Section></div></div>}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Отмена</button><button type="submit" disabled={isLoading} className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? (mode === 'edit' ? 'Сохранение...' : 'Создание...') : (submitLabel || (mode === 'edit' ? 'Сохранить изменения' : 'Создать заявку'))}</button></div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"><h3 className="mb-2.5 text-sm font-semibold leading-none text-slate-950">{title}</h3>{children}</section>; }

function RequestFilesField({ files, inputRef, onAdd, onRemove }: { files: File[]; inputRef: React.RefObject<HTMLInputElement | null>; onAdd: (files: FileList | null) => void; onRemove: (index: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">Файл</label>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {files.map((file, index) => (
          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="min-w-0 truncate text-sm font-medium text-slate-700">{file.name}</span>
            <button type="button" onClick={() => onRemove(index)} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-950">Удалить</button>
          </div>
        ))}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => onAdd(event.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100">
          + Добавить файл
        </button>
      </div>
    </div>
  );
}

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
  const disabled = companies.length === 0;

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <AppSelect
        value={value}
        disabled={disabled}
        searchable
        placeholder={disabled ? 'Сначала добавьте ТК в Контрагентах' : 'Выберите ТК'}
        options={[
          { value: null, label: 'Не выбрано' },
          ...companies.map((company) => ({
            value: company.id,
            label: company.name,
            description: [company.address, company.contactPerson, company.phone].filter(Boolean).join(' • '),
          })),
        ]}
        onChange={(nextValue) => onChange(typeof nextValue === 'number' ? nextValue : null)}
      />
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
  const placeholder = loading
    ? 'Загрузка точек...'
    : points.length === 0
      ? 'Нет магазинов'
      : '-- Выберите магазин / точку --';

  return (
    <div>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <AppSelect
        value={value || null}
        options={[
          { value: null, label: '-- Не выбрано --' },
          ...points.map((point) => ({
            value: point.address,
            label: point.name || 'Магазин',
            description: point.address || 'Адрес не указан',
          })),
        ]}
        placeholder={placeholder}
        emptyText="Нет магазинов"
        disabled={disabled}
        searchable={points.length > 6}
        onChange={(nextValue) => onChange(typeof nextValue === 'string' ? nextValue : '')}
      />
    </div>
  );
}


function SelectField({ label, value, onChange, options, className = '' }: { label: string; value: string | number; onChange: (value: string) => void; options: Array<[string | number, string]>; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <AppSelect
        value={value}
        options={options.map(([optionValue, labelText]) => ({ value: optionValue, label: labelText }))}
        onChange={(nextValue) => onChange(String(nextValue ?? ''))}
      />
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
  const placeholder = loading
    ? 'Загрузка постоянных клиентов...'
    : !ownerFound
      ? 'Сначала выберите клиента Орехов'
      : items.length === 0
        ? 'Нет постоянных клиентов'
        : '-- Выберите получателя --';

  const disabled = loading || !ownerFound || items.length === 0;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <AppSelect
        value={value}
        options={[
          { value: null, label: '-- Не выбрано --' },
          ...items.map((item) => ({
            value: item.id,
            label: item.name,
            description: [item.address, item.phone].filter(Boolean).join(' · '),
          })),
        ]}
        placeholder={placeholder}
        emptyText="Нет постоянных клиентов"
        disabled={disabled}
        searchable={items.length > 6}
        onChange={(nextValue) => onChange(typeof nextValue === 'number' ? nextValue : null)}
      />
    </div>
  );
}


function RoutePartyField({
  label,
  value,
  options,
  onChange,
  onSelect,
  required,
  emptyText = 'Нет вариантов',
}: {
  label: string;
  value: string;
  options: RoutePartyOption[];
  onChange: (value: string) => void;
  onSelect: (option: RoutePartyOption) => void;
  required?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLocaleLowerCase('ru-RU');
  const filteredOptions = options
    .filter((option) => {
      if (!query) return true;
      return `${option.name} ${option.address} ${option.phone}`.toLocaleLowerCase('ru-RU').includes(query);
    })
    .slice(0, 12);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <input
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        placeholder={label}
        required={required}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-950/15">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">{emptyText}</div>
          ) : filteredOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              className="mt-0.5 flex w-full flex-col rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-slate-100"
            >
              <span className="font-medium text-slate-900">{option.name}</span>
              <span className="mt-0.5 truncate text-xs text-slate-400">{option.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function PartnerSelect({
  label,
  value,
  partners,
  onChange,
  className = '',
}: {
  label: string;
  value?: number;
  partners: Partner[];
  onChange: (value: number | undefined) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">
        {label}
      </label>

      <AppSelect
        value={value ?? null}
        searchable
        placeholder={partners.length === 0 ? 'Нет активных контрагентов' : 'Выберите контрагента'}
        options={[
          { value: null, label: 'Не выбрано' },
          ...partners.map((partner) => ({
            value: partner.id,
            label: partner.name,
            description: [
              partner.contactPerson,
              partner.phone,
              partner.email,
            ].filter(Boolean).join(' • '),
          })),
        ]}
        onChange={(nextValue) => onChange(
          typeof nextValue === 'number' ? nextValue : undefined,
        )}
      />
    </div>
  );
}

function ClientSelect({ label, value, clients, onChange, className = '' }: { label: string; value?: number; clients: Client[]; onChange: (value: number | undefined) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label>
      <AppSelect
        value={value ?? null}
        searchable
        options={[
          { value: null, label: 'Не выбрано' },
          ...clients.map((client) => ({ value: client.id, label: client.name, description: client.address })),
        ]}
        onChange={(nextValue) => onChange(typeof nextValue === 'number' ? nextValue : undefined)}
      />
    </div>
  );
}
function TextareaField({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} rows={3} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm leading-5 outline-none transition focus:border-slate-300 focus:bg-white" /></div>; }
