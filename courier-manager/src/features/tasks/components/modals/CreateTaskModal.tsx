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
  isHistoricalCompleted: false,
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
  const [routeRegularClients, setRouteRegularClients] = useState<ClientRegularClient[]>([]);
  const [tcClientPointsMap, setTcClientPointsMap] = useState<Record<number, ClientPoint[]>>({});
  const [tcRecipientDropdownOpen, setTcRecipientDropdownOpen] = useState(false);
  const [expandedTcClientId, setExpandedTcClientId] = useState<number | null>(null);
  const [pickupClientPointsLoading, setPickupClientPointsLoading] = useState(false);
  const [extraPickupError, setExtraPickupError] = useState('');
  const requestFileInputRef = useRef<HTMLInputElement | null>(null);
  const requestType = formData.requestType || 'delivery';
  const allFieldsOptional = (
    requestType === 'courier_call'
    || requestType === 'simple'
  );
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

  const sortedPartners = useMemo(() => {
    const getUsageScore = (partner: Partner) => {
      const record = partner as Partner & Record<string, unknown>;
      const numericScore = Number(
        record.usageCount
        ?? record.requestsCount
        ?? record.ordersCount
        ?? record.callsCount
        ?? 0
      );
      return Number.isFinite(numericScore) ? numericScore : 0;
    };

    const getLastUsedTime = (partner: Partner) => {
      const record = partner as Partner & Record<string, unknown>;
      const value = typeof record.lastUsedAt === 'string'
        ? record.lastUsedAt
        : '';
      const timestamp = value ? Date.parse(value) : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    return [...partners].sort((a, b) => {
      const scoreDelta = getUsageScore(b) - getUsageScore(a);
      if (scoreDelta !== 0) return scoreDelta;

      const lastUsedDelta = getLastUsedTime(b) - getLastUsedTime(a);
      if (lastUsedDelta !== 0) return lastUsedDelta;

      const nameDelta = a.name.localeCompare(b.name, 'ru');
      if (nameDelta !== 0) return nameDelta;

      return a.id - b.id;
    });
  }, [partners]);

  const routePartyOptions = useMemo<RoutePartyOption[]>(() => {
    const client = formData.clientId
      ? clients.find((item) => item.id === formData.clientId)
      : undefined;

    if (!client) return [];

    const clientOption: RoutePartyOption = {
      key: `client:${client.id}`,
      name: client.name,
      address: client.address || '',
      phone: client.phone || '',
      description: client.address || 'Основной адрес',
      clientId: client.id,
    };

    const pointOptions: RoutePartyOption[] = (
      tcClientPointsMap[client.id] || []
    ).map((point) => ({
      key: `point:${client.id}:${point.id}`,
      name: point.name
        ? `${client.name} / ${point.name}`
        : client.name,
      address: point.address || '',
      phone: point.phone || client.phone || '',
      description: [
        'Точка',
        point.address,
        point.phone || client.phone,
      ].filter(Boolean).join(' · '),
      clientId: client.id,
      pointId: point.id,
    }));

    const regularClientOptions: RoutePartyOption[] = routeRegularClients.map(
      (regularClient) => ({
        key: `regular:${client.id}:${regularClient.id}`,
        name: regularClient.name || '',
        address: regularClient.address || '',
        phone: regularClient.phone || '',
        description: [
          'Постоянный клиент',
          regularClient.address,
          regularClient.phone,
        ].filter(Boolean).join(' · '),
        clientId: client.id,
      }),
    );

    return [
      clientOption,
      ...pointOptions,
      ...regularClientOptions,
    ];
  }, [
    clients,
    formData.clientId,
    tcClientPointsMap,
    routeRegularClients,
  ]);

  const pickupPointsClientId = formData.clientId;

  const selectedBillingClient = formData.clientId
    ? clients.find((client) => client.id === formData.clientId)
    : undefined;

  const automaticTitle = (
    requestType === 'delivery'
    || requestType === 'movement'
    || requestType === 'pickup_from_tc'
  )
    ? (selectedBillingClient?.name || '')
    : (
      requestType === 'courier_call'
      || requestType === 'simple'
    )
      ? (
        requestType === 'courier_call'
          ? (formData.senderCompany?.trim() || formData.senderName?.trim() || '')
          : (formData.senderName?.trim() || '')
      )
      : (formData.packageDescription || '');

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
    if (!isOpen || !formData.clientId) {
      setRouteRegularClients([]);
      return;
    }

    let cancelled = false;

    async function loadRouteRegularClients() {
      try {
        const items = await getClientRegularClients(formData.clientId!);

        if (!cancelled) {
          setRouteRegularClients(items || []);
        }
      } catch (error) {
        console.error('Failed to load route regular clients:', error);

        if (!cancelled) {
          setRouteRegularClients([]);
        }
      }
    }

    void loadRouteRegularClients();

    return () => {
      cancelled = true;
    };
  }, [isOpen, formData.clientId]);

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

  const changeRequestType = (nextType: RequestType) => {
    if (nextType === requestType) return;

    setExtraPickupError('');
    setTcRecipientDropdownOpen(false);
    setExpandedTcClientId(null);

    setFormData((prev) => ({
      ...prev,
      requestType: nextType,

      // Billing/client ownership is scenario-specific.
      clientId: undefined,
      senderClientId: undefined,
      recipientClientId: undefined,
      pickupRecipientClientId: undefined,

      // Route / pickup side.
      senderName: '',
      senderCompany: '',
      senderCity: '',
      senderPhone: '',
      senderAddress: '',
      senderAddressDetails: '',

      // Destination side.
      recipientName: '',
      recipientCompany: '',
      recipientCity: '',
      recipientPhone: '',
      recipientAddress: '',
      deliveryAddress: '',
      deliveryCity: '',

      // Request-type-specific descriptive fields.
      packageDescription: '',
      specialInstructions: '',
      items: '',
      callReason: '',
      description: '',
      estimatedMinutes: undefined,

      // TC-specific fields.
      tcName: '',
      tcAddress: '',
      trackingNumber: '',
      pickupDirection: 'tc_to_recipient',

      // Route additions.
      extraPickupPoints: [],

      // Physical facts should not leak between scenarios either.
      placesCount: undefined,

      // Comment belongs to the scenario being created.
      comments: '',

      // Files selected for one scenario must not silently move to another.
      requestFiles: [],
    }));
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

  const applyPickupDirection = (
    direction: 'tc_to_recipient' | 'recipient_to_tc',
  ) => {
    setFormData((prev) => {
      const previousDirection = prev.pickupDirection || 'tc_to_recipient';

      if (previousDirection === direction) {
        return {
          ...prev,
          pickupDirection: direction,
        };
      }

      return {
        ...prev,
        pickupDirection: direction,

        senderName: prev.recipientName || '',
        senderCompany: prev.recipientCompany || '',
        senderPhone: prev.recipientPhone || '',
        senderAddress: prev.deliveryAddress || '',
        senderAddressDetails: prev.recipientAddress || '',

        recipientName: prev.senderName || '',
        recipientCompany: prev.senderCompany || '',
        recipientPhone: prev.senderPhone || '',
        deliveryAddress: prev.senderAddress || '',
        recipientAddress: prev.senderAddressDetails || '',
      };
    });
  };

  const selectTransportCompanyForRequest = (companyId: number | null) => {
    if (!companyId) {
      setFormData((prev) => {
        const direction = prev.pickupDirection || 'tc_to_recipient';

        return {
          ...prev,
          tcName: '',
          tcAddress: '',
          trackingNumber: '',

          ...(direction === 'recipient_to_tc'
            ? {
                recipientName: '',
                recipientCompany: '',
                recipientPhone: '',
                deliveryAddress: '',
                recipientAddress: '',
              }
            : {
                senderName: '',
                senderCompany: '',
                senderPhone: '',
                senderAddress: '',
                senderAddressDetails: '',
              }),
        };
      });

      return;
    }

    const company = transportCompanies.find(
      (item) => item.id === companyId,
    );

    if (!company) return;

    setFormData((prev) => {
      const direction = prev.pickupDirection || 'tc_to_recipient';

      return {
        ...prev,
        tcName: company.name,
        tcAddress: company.address,

        ...(direction === 'recipient_to_tc'
          ? {
              recipientName: company.name,
              recipientCompany: company.name,
              recipientPhone: company.phone || '',
              deliveryAddress: company.address || '',
              recipientAddress: '',
            }
          : {
              senderName: company.name,
              senderCompany: company.name,
              senderPhone: company.phone || '',
              senderAddress: company.address || '',
              senderAddressDetails: '',
            }),
      };
    });
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
      senderName: '',
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

  const selectRoutePartyOption = (
    option: RoutePartyOption,
    target: 'sender' | 'recipient',
  ) => {
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
    const { senderAddressDetails, senderClientId, recipientClientId, pickupRecipientClientId, pickupDirection, nutsBoxes, nutsTariff, cedroilTariff, extraPickupPoints, requestFiles, isHistoricalCompleted, ...payload } = formData;
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
      isHistoricalCompleted: Boolean(isHistoricalCompleted),
      senderAddress: isUniversalRequest ? universalSenderAddress : (nutsSenderAddress || payload.senderAddress),
      recipientName: isUniversalRequest ? (payload.recipientName || '') : (payload.recipientName || payload.senderName || ''),
      recipientPhone: isUniversalRequest ? (payload.recipientPhone || '') : (payload.recipientPhone || payload.senderPhone || ''),
      deliveryAddress: isUniversalRequest
        ? (payload.deliveryAddress || payload.recipientAddress || '')
        : (payload.deliveryAddress || payload.recipientAddress || nutsSenderAddress || payload.senderAddress || ''),
      packageDescription: requestType === 'nuts' ? nutsSummary : automaticTitle,
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

  const routeTitle = requestType === 'delivery'
    ? 'Маршрут доставки'
    : requestType === 'movement'
      ? 'Перемещение'
      : requestType === 'pickup_from_tc'
        ? 'Транспортная компания'
        : 'Обычная заявка';

  const routeMeta = requestType === 'delivery'
    ? 'Отправитель → получатель'
    : requestType === 'movement'
      ? 'Между двумя адресами / подразделениями'
      : requestType === 'pickup_from_tc'
        ? 'ТК ↔ клиент, направление выбирается отдельно'
        : 'Произвольная задача с маршрутом при необходимости';

  const whatLabel = requestType === 'delivery'
    ? 'Что доставляем'
    : requestType === 'movement'
      ? 'Что перемещаем'
      : requestType === 'pickup_from_tc'
        ? 'Что забираем / передаём'
        : 'Суть заявки';

  const footerClient = selectedBillingClient?.name
    || formData.senderCompany
    || formData.senderName
    || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-h-[94vh] w-[min(1240px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-slate-300/80 bg-white shadow-2xl"
      overlayStyle={{
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[94vh] flex-col bg-white">

        {/* V11 HEADER */}
        <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white/95 px-[18px] py-[14px] backdrop-blur">
          <div className="min-w-[220px]">
            <h2 className="m-0 text-[20px] font-bold leading-[1.1] tracking-[-0.02em] text-slate-950">
              {title || (mode === 'edit' ? 'Редактировать заявку' : 'Создать заявку')}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {requestType === 'courier_call'
                ? 'Отдельная форма вызова курьера'
                : requestType === 'nuts'
                  ? 'Отдельная форма Орехов'
                  : 'Маршрутная заявка'}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-0.5">
            {(Object.entries(REQUEST_TYPE_LABELS) as Array<[RequestType, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeRequestType(value)}
                className={`shrink-0 whitespace-nowrap rounded-[11px] border px-[11px] py-[9px] text-xs font-bold transition ${
                  requestType === value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                }`}
              >
                {value === 'simple' ? 'Обычная заявка' : label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-[90px] pt-4">

          {/* V11 SUMMARY */}
          <div
            className={`mb-[13px] grid gap-[9px] rounded-[15px] border border-slate-200 bg-[#fbfdff] p-[11px] ${
              requestType === 'nuts'
                ? 'md:grid-cols-2'
                : requestType === 'courier_call'
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-[1.4fr_.8fr_.8fr_.75fr]'
            }`}
          >
            {requestType !== 'nuts' && requestType !== 'courier_call' && (
              <ClientSelect
                label="Клиент / заказчик"
                value={formData.clientId}
                clients={sortedBillingClients}
                onChange={selectUniversalClient}
              />
            )}

            <Field
              label="Дата"
              type="date"
              value={formData.requestDate || getLocalDateKey()}
              onChange={(value) => updateField('requestDate', value)}
              required={requestType !== 'simple'}
            />

            {requestType !== 'nuts' && (
              <TimeRangeField
                from={formData.deliveryTimeFrom || ''}
                to={formData.deliveryTimeTo || ''}
                onFromChange={(value) => updateField('deliveryTimeFrom', value)}
                onToChange={(value) => updateField('deliveryTimeTo', value)}
              />
            )}

            <div>
              <label className="mb-[5px] block text-[11px] font-bold text-slate-600">
                Курьер
              </label>
              <div className="flex h-10 items-center rounded-[11px] border border-slate-200 bg-white px-[11px] text-sm text-slate-500">
                {formData.courierId ? `Курьер #${formData.courierId}` : 'Не назначен'}
              </div>
            </div>

            {requestType === 'nuts' && (
              <ClientSelect
                label="Клиент Орехов"
                value={nutsOwnerClientId}
                clients={clients}
                onChange={selectNutsOwnerClient}
              />
            )}

          </div>

          {/* ==================================================
              ROUTE FAMILY
             ================================================== */}
          {(requestType === 'delivery'
            || requestType === 'movement'
            || requestType === 'pickup_from_tc'
            || requestType === 'simple') && (
            <div className="grid gap-[13px] lg:grid-cols-[minmax(0,1fr)_330px]">

              <div className="flex flex-col gap-[13px]">

                {/* ROUTE */}
                <V11Section
                  title={routeTitle}
                  meta={routeMeta}
                  badge={REQUEST_TYPE_LABELS[requestType]}
                >
                  {requestType === 'pickup_from_tc' && (
                    <>
                      <div className="mb-[10px] flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-extrabold text-slate-600">
                          Направление
                        </span>

                        <div className="inline-grid min-w-[320px] max-w-[420px] grid-cols-2 gap-[5px] rounded-xl border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => applyPickupDirection('tc_to_recipient')}
                            className={`h-9 rounded-[9px] border-0 text-xs font-bold ${
                              formData.pickupDirection !== 'recipient_to_tc'
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'bg-transparent text-slate-500'
                            }`}
                          >
                            ТК → Клиент
                          </button>

                          <button
                            type="button"
                            onClick={() => applyPickupDirection('recipient_to_tc')}
                            className={`h-9 rounded-[9px] border-0 text-xs font-bold ${
                              formData.pickupDirection === 'recipient_to_tc'
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'bg-transparent text-slate-500'
                            }`}
                          >
                            Клиент → ТК
                          </button>
                        </div>
                      </div>

                      <div className="mb-[10px]">
                        <TransportCompanySelect
                          label="Транспортная компания"
                          value={selectedTransportCompanyId}
                          companies={transportCompanies}
                          onChange={selectTransportCompanyForRequest}
                        />
                      </div>
                    </>
                  )}

                  <div className="grid gap-[11px] md:grid-cols-2">

                    {/* A */}
                    <div className="rounded-[13px] border border-slate-200 bg-[#fcfdff] p-[11px]">
                      <div className="mb-[9px] flex items-center justify-between text-xs font-extrabold">
                        <span>
                          {requestType === 'pickup_from_tc'
                            ? (
                              formData.pickupDirection === 'recipient_to_tc'
                                ? 'Клиент / отправитель'
                                : 'Транспортная компания'
                            )
                            : 'Отправитель'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-[7px] py-1 text-[10px] font-extrabold text-slate-600">
                          A
                        </span>
                      </div>

                      <div className="space-y-2">
                        {requestType === 'pickup_from_tc'
                          && formData.pickupDirection !== 'recipient_to_tc' ? (
                          <>
                            <Field
                              label="Компания / ФИО"
                              value={formData.tcName || formData.senderName || ''}
                              onChange={() => {}}
                              readOnly
                            />
                            <Field
                              label="Адрес"
                              value={formData.tcAddress || formData.senderAddress || ''}
                              onChange={() => {}}
                              readOnly
                            />
                            <Field
                              label="Телефон"
                              value={formData.senderPhone || ''}
                              onChange={() => {}}
                              readOnly
                            />
                          </>
                        ) : (
                          <>
                            <RoutePartyField
                              label={`Компания / ФИО${allFieldsOptional ? '' : ' *'}`}
                              value={formData.senderName || ''}
                              options={routePartyOptions}
                              onChange={(value) => updateField('senderName', value)}
                              onSelect={(option) => selectRoutePartyOption(option, 'sender')}
                              emptyText={
                                formData.clientId
                                  ? 'Нет точек по запросу'
                                  : 'Сначала выберите клиента / компанию'
                              }
                              required={!allFieldsOptional}
                            />

                            <Field
                              label="Контактное лицо"
                              value={formData.senderCompany || ''}
                              onChange={(value) => updateField('senderCompany', value)}
                            />

                            <Field
                              label="Телефон"
                              value={formData.senderPhone || ''}
                              onChange={(value) => updateField('senderPhone', value)}
                            />

                            <Field
                              label={`Адрес${allFieldsOptional ? '' : ' *'}`}
                              value={formData.senderAddress || ''}
                              onChange={(value) => updateField('senderAddress', value)}
                              required={!allFieldsOptional}
                            />

                            <Field
                              label="Квартира / офис / детали"
                              value={formData.senderAddressDetails || ''}
                              onChange={(value) => updateField('senderAddressDetails', value)}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    {/* B */}
                    <div className="rounded-[13px] border border-slate-200 bg-[#fcfdff] p-[11px]">
                      <div className="mb-[9px] flex items-center justify-between text-xs font-extrabold">
                        <span>
                          {requestType === 'pickup_from_tc'
                            ? (
                              formData.pickupDirection === 'recipient_to_tc'
                                ? 'Транспортная компания'
                                : 'Клиент / получатель'
                            )
                            : 'Получатель'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-[7px] py-1 text-[10px] font-extrabold text-slate-600">
                          B
                        </span>
                      </div>

                      <div className="space-y-2">
                        {requestType === 'pickup_from_tc'
                          && formData.pickupDirection === 'recipient_to_tc' ? (
                          <>
                            <Field
                              label="Компания / ФИО"
                              value={formData.tcName || formData.recipientName || ''}
                              onChange={() => {}}
                              readOnly
                            />
                            <Field
                              label="Адрес"
                              value={formData.tcAddress || formData.deliveryAddress || ''}
                              onChange={() => {}}
                              readOnly
                            />
                            <Field
                              label="Телефон"
                              value={formData.recipientPhone || ''}
                              onChange={() => {}}
                              readOnly
                            />
                          </>
                        ) : (
                          <>
                            <RoutePartyField
                              label={`Компания / ФИО${allFieldsOptional ? '' : ' *'}`}
                              value={formData.recipientName || ''}
                              options={routePartyOptions}
                              onChange={(value) => updateField('recipientName', value)}
                              onSelect={(option) => selectRoutePartyOption(option, 'recipient')}
                              emptyText={
                                formData.clientId
                                  ? 'Нет точек по запросу'
                                  : 'Сначала выберите клиента / компанию'
                              }
                              required={!allFieldsOptional}
                            />

                            <Field
                              label="Контактное лицо"
                              value={formData.recipientCompany || ''}
                              onChange={(value) => updateField('recipientCompany', value)}
                            />

                            <Field
                              label="Телефон"
                              value={formData.recipientPhone || ''}
                              onChange={(value) => updateField('recipientPhone', value)}
                            />

                            <Field
                              label={`Адрес${allFieldsOptional ? '' : ' *'}`}
                              value={formData.deliveryAddress || ''}
                              onChange={(value) => updateField('deliveryAddress', value)}
                              required={!allFieldsOptional}
                            />

                            <Field
                              label="Квартира / офис / детали"
                              value={formData.recipientAddress || ''}
                              onChange={(value) => updateField('recipientAddress', value)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {requestType !== 'simple' && (
                    <div className="mt-[10px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={addExtraPickupPoint}
                          className="h-[39px] rounded-[11px] border border-slate-200 bg-white px-[14px] text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          + Добавить точку забора
                        </button>

                        <span className="text-[11px] text-slate-500">
                          {(formData.extraPickupPoints || []).length > 0
                            ? `Добавлено точек: ${(formData.extraPickupPoints || []).length}`
                            : 'Дополнительных точек нет'}
                        </span>

                        {extraPickupError && (
                          <span className="text-[11px] font-semibold text-red-600">
                            {extraPickupError}
                          </span>
                        )}
                      </div>

                      {(formData.extraPickupPoints || []).length > 0 && (
                        <div className="mt-2 flex flex-col gap-[7px]">
                          {(formData.extraPickupPoints || []).map((point, index) => (
                            <div
                              key={`extra-pickup-${index}`}
                              className="grid items-end gap-2 rounded-[11px] border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[1fr_auto]"
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
                                className="h-10 rounded-[11px] border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50"
                              >
                                Удалить
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </V11Section>

                {/* PARAMETERS */}
                <V11Section
                  title="Параметры заявки"
                  meta={
                    requestType === 'simple'
                      ? 'Опишите суть произвольной заявки'
                      : 'Дополнительные данные для курьера'
                  }
                >
                  <div className={`grid gap-[9px] ${
                    requestType === 'simple'
                      ? 'md:grid-cols-[minmax(0,1fr)_220px]'
                      : 'md:grid-cols-[220px_minmax(0,1fr)]'
                  }`}>
                    {requestType === 'simple' && (
                      <Field
                        label="Суть заявки"
                        value={formData.packageDescription || ''}
                        onChange={(value) => updateField('packageDescription', value)}
                      />
                    )}

                    <Field
                      label="Количество мест"
                      type="number"
                      value={formData.placesCount ?? ''}
                      onChange={(value) => updateField(
                        'placesCount',
                        value === '' ? undefined : Number(value),
                      )}
                    />
                  </div>

                  <div className="mt-[9px]">
                    <TextareaField
                      label="Комментарий для курьера"
                      value={formData.comments || ''}
                      onChange={(value) => updateField('comments', value)}
                    />
                  </div>
                </V11Section>

                {/* FILES */}
                <V11Section
                  title="Файлы"
                  meta="Фото, PDF, накладные"
                >
                  <V11FilesField
                    files={formData.requestFiles || []}
                    inputRef={requestFileInputRef}
                    onAdd={addRequestFiles}
                    onRemove={removeRequestFile}
                  />
                </V11Section>
              </div>

              {/* ROUTE SIDEBAR */}
              <div className="flex flex-col gap-[13px]">
                <V11Section title="Оплата">
                  <V11Payment
                    method={formData.paymentMethod || 'paid'}
                    amount={formData.paymentAmount || 0}
                    onMethodChange={(value) => updateField('paymentMethod', value)}
                    onAmountChange={(value) => updateField('paymentAmount', value)}
                  />
                </V11Section>

                {mode === 'create' && (
                  <V11Section title="Дополнительно">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.isHistoricalCompleted)}
                        onChange={(event) => updateField(
                          'isHistoricalCompleted',
                          event.target.checked,
                        )}
                        className="accent-slate-900"
                      />
                      Создать как уже выполненную
                    </label>

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Для внесения старых заявок. На обычную новую заявку не влияет.
                    </p>
                  </V11Section>
                )}

                <V11Section title="Как это поймёт система">
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {requestType === 'delivery'
                      ? 'Тип: Доставка. Push и карточка будут собраны автоматически из клиента и маршрута.'
                      : requestType === 'movement'
                        ? 'Тип: Перемещение. Система покажет название клиента и маршрут A → B.'
                        : requestType === 'pickup_from_tc'
                          ? 'Тип: ТК. Направление, ТК и клиент используются системой для формирования отображения заявки.'
                          : 'Тип: Обычная заявка. Заполняйте только необходимые поля.'}
                  </p>
                </V11Section>
              </div>
            </div>
          )}

          {/* ==================================================
              COURIER CALL
             ================================================== */}
          {requestType === 'courier_call' && (
            <div className="grid gap-[13px] lg:grid-cols-[minmax(0,1fr)_330px]">

              <div className="flex flex-col gap-[13px]">
                <V11Section
                  title="Забрать у"
                  meta="Откуда курьер забирает"
                  badge="Вызов курьера"
                >
                  <div className="grid gap-[9px] md:grid-cols-4">
                    <Field
                      label="Компания *"
                      value={formData.senderCompany || ''}
                      onChange={(value) => updateField('senderCompany', value)}
                    />
                    <Field
                      label="Контактное лицо"
                      value={formData.senderName || ''}
                      onChange={(value) => updateField('senderName', value)}
                    />
                    <Field
                      label="Телефон"
                      value={formData.senderPhone || ''}
                      onChange={(value) => updateField('senderPhone', value)}
                    />
                    <Field
                      label="Город"
                      value={formData.senderCity || ''}
                      onChange={(value) => updateField('senderCity', value)}
                    />
                  </div>

                  <div className="mt-[9px] grid gap-[9px] md:grid-cols-2">
                    <Field
                      label="Адрес забора *"
                      value={formData.senderAddress || ''}
                      onChange={(value) => updateField('senderAddress', value)}
                    />
                    <Field
                      label="Офис / этаж / детали"
                      value={formData.senderAddressDetails || ''}
                      onChange={(value) => updateField('senderAddressDetails', value)}
                    />
                  </div>
                </V11Section>

                <V11Section
                  title="Куда направляется"
                  meta="Получатель / следующая точка после забора"
                >
                  <div className="grid gap-[9px] md:grid-cols-4">
                    <Field
                      label="Компания получателя *"
                      value={formData.recipientCompany || ''}
                      onChange={(value) => updateField('recipientCompany', value)}
                    />
                    <Field
                      label="Контактное лицо"
                      value={formData.recipientName || ''}
                      onChange={(value) => updateField('recipientName', value)}
                    />
                    <Field
                      label="Телефон"
                      value={formData.recipientPhone || ''}
                      onChange={(value) => updateField('recipientPhone', value)}
                    />
                    <Field
                      label="Город"
                      value={formData.recipientCity || ''}
                      onChange={(value) => updateField('recipientCity', value)}
                    />
                  </div>

                  <div className="mt-[9px]">
                    <Field
                      label="Адрес *"
                      value={formData.deliveryAddress || ''}
                      onChange={(value) => updateField('deliveryAddress', value)}
                    />
                  </div>
                </V11Section>

                <V11Section
                  title="Файлы"
                  meta="Фото или PDF, если нужны"
                >
                  <V11FilesField
                    files={formData.requestFiles || []}
                    inputRef={requestFileInputRef}
                    onAdd={addRequestFiles}
                    onRemove={removeRequestFile}
                  />
                </V11Section>
              </div>

              <div className="flex flex-col gap-[13px]">
                <V11Section title="Клиент / заказчик">
                  <PartnerSelect
                    label="Кто заказал вызов"
                    value={selectedCourierCallPartnerId}
                    partners={sortedPartners}
                    onChange={selectCourierCallPartner}
                  />
                </V11Section>

                <V11Section title="Оплата">
                  <V11Payment
                    method={formData.paymentMethod || 'paid'}
                    amount={formData.paymentAmount || 0}
                    onMethodChange={(value) => updateField('paymentMethod', value)}
                    onAmountChange={(value) => updateField('paymentAmount', value)}
                  />
                </V11Section>

                {mode === 'create' && (
                  <V11Section title="Дополнительно">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.isHistoricalCompleted)}
                        onChange={(event) => updateField(
                          'isHistoricalCompleted',
                          event.target.checked,
                        )}
                        className="accent-slate-900"
                      />
                      Создать как уже выполненную
                    </label>
                  </V11Section>
                )}
              </div>
            </div>
          )}

          {/* ==================================================
              NUTS
             ================================================== */}
          {requestType === 'nuts' && (
            <div className="grid gap-[13px] lg:grid-cols-[minmax(0,1fr)_330px]">
              <V11Section
                title="Состав заказа"
                meta="Укажите количество — сумма считается автоматически"
                badge="Орехи"
              >
                <div className="mb-1.5 grid grid-cols-[1fr_75px_105px] gap-2 px-[3px] text-[10px] font-extrabold uppercase text-slate-400">
                  <span>Позиция</span>
                  <span>Кол-во</span>
                  <span className="text-right">Сумма</span>
                </div>

                {(formData.nutsBoxes || []).map((box) => (
                  <div
                    key={box.id}
                    className="mb-[7px] grid grid-cols-[1fr_75px_105px] items-center gap-2"
                  >
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-[10px] py-[9px] text-[11px] font-bold text-slate-700">
                      {box.name}
                    </div>

                    <input
                      aria-label={`Количество ${box.name}`}
                      type="number"
                      min="0"
                      value={box.quantity}
                      onChange={(event) => updateNutsBox(
                        box.id,
                        { quantity: Number(event.target.value) || 0 },
                      )}
                      className="h-10 w-full rounded-[11px] border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400"
                    />

                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-[10px] py-[9px] text-right text-[11px] font-bold text-slate-700">
                      {getNutsBoxTotal(
                        box,
                        formData.nutsTariff || 0,
                        formData.cedroilTariff || 0,
                      ).toFixed(2)}
                    </div>
                  </div>
                ))}

                <div className="mt-[10px] rounded-[10px] border border-slate-200 bg-slate-50 px-[10px] py-[9px] text-right text-xs text-slate-700">
                  Итого: <b>{nutsTotal.toFixed(2)} ₽</b>
                </div>

                <div className="mt-[10px]">
                  <TextareaField
                    label="Комментарий"
                    value={formData.comments || ''}
                    onChange={(value) => updateField('comments', value)}
                  />
                </div>
              </V11Section>

              <div className="flex flex-col gap-[13px]">
                <V11Section title="Получатель">
                  <div className="space-y-2">
                    <ClientSelect
                      label="Клиент Орехов"
                      value={nutsOwnerClientId}
                      clients={clients}
                      onChange={selectNutsOwnerClient}
                    />

                    <NutsRegularClientSelect
                      label="Выберите получателя"
                      value={
                        nutsRegularClients.find(
                          (item) => (
                            item.name === formData.recipientName
                            && item.address === formData.deliveryAddress
                          ),
                        )?.id ?? null
                      }
                      items={nutsRegularClients}
                      loading={nutsRegularClientsLoading}
                      ownerFound={Boolean(nutsOwnerClient)}
                      onChange={selectNutsRegularClient}
                    />

                    <Field
                      label="Получатель"
                      value={formData.recipientName || ''}
                      onChange={(value) => updateField('recipientName', value)}
                    />

                    <Field
                      label="Телефон"
                      value={formData.recipientPhone || ''}
                      onChange={(value) => updateField('recipientPhone', value)}
                    />

                    <Field
                      label="Адрес доставки"
                      value={formData.deliveryAddress || ''}
                      onChange={(value) => updateField('deliveryAddress', value)}
                    />
                  </div>
                </V11Section>

                <V11Section title="Тарифы">
                  <div className="space-y-2">
                    <Field
                      label="Орехи, ₽/кг"
                      type="number"
                      value={formData.nutsTariff || ''}
                      onChange={(value) => updateTariff(
                        'nutsTariff',
                        Number(value) || 0,
                      )}
                    />

                    <Field
                      label="Кедровое масло, ₽"
                      type="number"
                      value={formData.cedroilTariff || ''}
                      onChange={(value) => updateTariff(
                        'cedroilTariff',
                        Number(value) || 0,
                      )}
                    />
                  </div>
                </V11Section>
              </div>
            </div>
          )}
        </div>

        {/* V11 FOOTER */}
        <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-[18px] py-[11px] backdrop-blur">
          <div className="text-[11px] text-slate-500">
            {REQUEST_TYPE_LABELS[requestType]}
            {footerClient ? ` · ${footerClient}` : ''}
            {formData.requestDate ? ` · ${formData.requestDate}` : ''}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[39px] rounded-[11px] border border-slate-200 bg-white px-[14px] text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="h-[39px] rounded-[11px] border border-slate-900 bg-slate-900 px-[14px] text-xs font-bold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading
                ? (mode === 'edit' ? 'Сохранение...' : 'Создание...')
                : (submitLabel || (mode === 'edit' ? 'Сохранить изменения' : 'Создать заявку'))}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function V11Section({
  title,
  meta,
  badge,
  children,
}: {
  title: string;
  meta?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-visible rounded-[15px] border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-[13px] py-[10px]">
        <div>
          <div className="text-[13px] font-extrabold text-slate-950">
            {title}
          </div>
          {meta && (
            <div className="mt-0.5 text-[11px] text-slate-400">
              {meta}
            </div>
          )}
        </div>

        {badge && (
          <span className="inline-flex rounded-full bg-blue-50 px-[7px] py-1 text-[10px] font-extrabold text-blue-700">
            {badge}
          </span>
        )}
      </div>

      <div className="px-[13px] py-3">
        {children}
      </div>
    </section>
  );
}

function V11Payment({
  method,
  amount,
  onMethodChange,
  onAmountChange,
}: {
  method: NonNullable<TaskFormData['paymentMethod']>;
  amount: number;
  onMethodChange: (value: NonNullable<TaskFormData['paymentMethod']>) => void;
  onAmountChange: (value: number) => void;
}) {
  const methods: Array<[NonNullable<TaskFormData['paymentMethod']>, string]> = [
    ['paid', 'Оплачено'],
    ['transfer', 'Перевод'],
    ['cash', 'Наличные'],
    ['terminal', 'Терминал'],
    ['qr', 'QR'],
  ];

  return (
    <>
      <div className="flex flex-wrap gap-[5px]">
        {methods.map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-[5px] rounded-[9px] border px-2 py-1.5 text-[11px] font-bold ${
              method === value
                ? 'border-slate-400 bg-slate-50 text-slate-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <input
              type="radio"
              checked={method === value}
              onChange={() => onMethodChange(value)}
              className="accent-slate-900"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-[9px]">
        <Field
          label="Сумма"
          type="number"
          value={amount || ''}
          onChange={(value) => onAmountChange(Number(value) || 0)}
        />
      </div>
    </>
  );
}

function V11FilesField({
  files,
  inputRef,
  onAdd,
  onRemove,
}: {
  files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-[14px] text-center">
        <strong className="block text-xs text-slate-700">
          Перетащить файлы сюда или выбрать
        </strong>
        <span className="mt-[3px] block text-[11px] text-slate-500">
          Можно прикрепить несколько файлов
        </span>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => onAdd(event.target.files)}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 h-8 rounded-[9px] border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          Выбрать файлы
        </button>
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-[9px] py-2 text-[11px]"
            >
              <span className="min-w-0 truncate">
                {file.name} · {Math.max(1, Math.round(file.size / 1024))} КБ
              </span>

              <button
                type="button"
                onClick={() => onRemove(index)}
                className="shrink-0 rounded-lg border border-red-200 px-2 py-1 font-bold text-red-600 hover:bg-red-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"><h3 className="mb-2.5 text-sm font-semibold leading-none text-slate-950">{title}</h3>{children}</section>; }

function RequestFilesField({ files, inputRef, onAdd, onRemove }: { files: File[]; inputRef: React.RefObject<HTMLInputElement | null>; onAdd: (files: FileList | null) => void; onRemove: (index: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">Вложения</label>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {files.map((file, index) => (
          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="min-w-0 truncate text-sm font-medium text-slate-700">{file.name}</span>
            <button type="button" onClick={() => onRemove(index)} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-950">Удалить</button>
          </div>
        ))}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => onAdd(event.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100">
          + Добавить файлы
        </button>
      </div>
    </div>
  );
}


function TimeRangeField({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const label = from && to
    ? `${from} — ${to}`
    : from
      ? `После ${from}`
      : to
        ? `До ${to}`
        : 'Без ограничения';

  const setRange = (nextFrom: string, nextTo: string) => {
    onFromChange(nextFrom);
    onToChange(nextTo);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium leading-none text-slate-700">
        Время
      </label>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-sm text-slate-800 outline-none transition hover:bg-white"
      >
        <span>{label}</span>
        <span className="text-xs text-slate-400">⌄</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[70] mt-1 w-[290px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15">
          <div className="grid grid-cols-[1fr_18px_1fr] items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                После / с
              </label>
              <input
                type="time"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white"
              />
            </div>

            <div className="pb-3 text-center text-slate-300">—</div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                До
              </label>
              <input
                type="time"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setRange('', '12:00')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              До 12:00
            </button>

            <button
              type="button"
              onClick={() => setRange('', '17:00')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              До 17:00
            </button>

            <button
              type="button"
              onClick={() => setRange('12:00', '')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              После 12:00
            </button>

            <button
              type="button"
              onClick={() => setRange('17:00', '')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              После 17:00
            </button>

            <button
              type="button"
              onClick={() => setRange('', '')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Без ограничения
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  className = '',
  readOnly = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
  readOnly?: boolean;
}) {
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
        readOnly={readOnly || (isAddressField ? true : undefined)}
        onMouseDown={(event) => {
          if (isAddressField && !readOnly) {
            event.currentTarget.removeAttribute('readonly');
          }
        }}
        onTouchStart={(event) => {
          if (isAddressField && !readOnly) {
            event.currentTarget.removeAttribute('readonly');
          }
        }}
        onFocus={(event) => {
          if (isAddressField && !readOnly) {
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
