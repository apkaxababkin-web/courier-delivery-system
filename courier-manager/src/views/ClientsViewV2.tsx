import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, ChevronRight,
  KeyRound, Download, Edit2, FileSpreadsheet, MapPin, Phone, Plus, Search, Store, Trash2, UserRound, X } from 'lucide-react';
import * as api from '../lib/api';

type Client = api.Client;
type Point = api.ClientPoint & { isPrimary?: boolean };
type RegularClient = api.ClientRegularClient;
type Partner = api.Partner;
type Mail = api.Mail;
type TransportCompany = api.TransportCompany;
type Request = api.Request;
type HemotestReconciliationItem = api.HemotestReconciliationItem;
type HemotestHalfMonthPeriod = { key: string; label: string; start: string; end: string };
type CounterpartyTab = 'clients' | 'partners' | 'transport';

type ClientForm = { name: string; address: string; contactPerson: string; phone: string; email: string };
type PointForm = { name: string; address: string; contactPerson: string; phone: string };
type PartnerForm = { name: string; email: string; contactPerson: string; phone: string; comment: string };
type TransportCompanyForm = { name: string; address: string; contactPerson: string; phone: string; comment: string };
type TariffRule = { firstPlace: string; nextPlace: string };
type StandardTariffCategory = 'delivery' | 'transportCompany' | 'movement' | 'other';
type ClientTariffs = { delivery: TariffRule; transportCompany: TariffRule; movement: TariffRule; other: TariffRule; hemotest: { pointPrice: string; sundayFirstPointPrice: string; sundayNextPointPrice: string } };
type ExcelCell = string | number | null | undefined;

const emptyClient: ClientForm = { name: '', address: '', contactPerson: '', phone: '', email: '' };
const emptyPoint: PointForm = { name: '', address: '', contactPerson: '', phone: '' };
const emptyPartner: PartnerForm = { name: '', email: '', contactPerson: '', phone: '', comment: '' };
const emptyTransportCompany: TransportCompanyForm = { name: '', address: '', contactPerson: '', phone: '', comment: '' };
const emptyTariffRule: TariffRule = { firstPlace: '', nextPlace: '' };
const emptyTariffs: ClientTariffs = {
  delivery: { ...emptyTariffRule },
  transportCompany: { ...emptyTariffRule },
  movement: { ...emptyTariffRule },
  other: { ...emptyTariffRule },
  hemotest: { pointPrice: '', sundayFirstPointPrice: '', sundayNextPointPrice: '' },
};

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white';
const buttonPrimary = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:opacity-50';
const buttonSecondary = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50';

export default function ClientsViewV2() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  const [activeCounterpartyTab, setActiveCounterpartyTab] = useState<CounterpartyTab>('clients');

  const [partners, setPartners] = useState<Partner[]>([]);
  const [transportCompanies, setTransportCompanies] = useState<TransportCompany[]>([]);
  const [counterpartiesLoading, setCounterpartiesLoading] = useState(false);

  const [points, setPoints] = useState<Point[]>([]);
  const [regularClients, setRegularClients] = useState<RegularClient[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [deliveryFeesByRequestId, setDeliveryFeesByRequestId] = useState<Record<number, string>>({});
  const [showTariffsModal, setShowTariffsModal] = useState(false);
  const [selectedClientSection, setSelectedClientSection] = useState<'details' | 'reconciliation'>('details');
  const [clientTariffs, setClientTariffs] = useState<ClientTariffs>(emptyTariffs);
  const [hemotestReconciliation, setHemotestReconciliation] = useState<HemotestReconciliationItem[]>([]);
  const [selectedHemotestPeriodKey, setSelectedHemotestPeriodKey] = useState('');

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient);
  const [showClientPortalModal, setShowClientPortalModal] = useState(false);
  const [portalClient, setPortalClient] = useState<Client | null>(null);
  const [portalForm, setPortalForm] = useState({ ownerName: '', login: '', password: '' });
  const [createdPortalAccess, setCreatedPortalAccess] = useState<api.ClientPortalAccount | null>(null);
  const [isCreatingPortalAccess, setIsCreatingPortalAccess] = useState(false);

  const [showPointModal, setShowPointModal] = useState(false);
  const [editingPointId, setEditingPointId] = useState<number | null>(null);
  const [pointForm, setPointForm] = useState<PointForm>(emptyPoint);

  const [showRegularClientModal, setShowRegularClientModal] = useState(false);
  const [editingRegularClientId, setEditingRegularClientId] = useState<number | null>(null);
  const [regularClientForm, setRegularClientForm] = useState<PointForm>(emptyPoint);

  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerForm>(emptyPartner);

  const [showTransportCompanyModal, setShowTransportCompanyModal] = useState(false);
  const [editingTransportCompanyId, setEditingTransportCompanyId] = useState<number | null>(null);
  const [transportCompanyForm, setTransportCompanyForm] = useState<TransportCompanyForm>(emptyTransportCompany);

  useEffect(() => {
    void loadClients();
    void loadRequests();
    void loadMails();
    void loadHemotestReconciliation();
    void loadCounterpartyDirectories();
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('mig-client-reconciliation-delivery-fees');
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        setDeliveryFeesByRequestId(parsed as Record<number, string>);
      }
    } catch {
      setDeliveryFeesByRequestId({});
    }
  }, []);

  async function loadMails() {
    try {
      const data = await api.getAllMails({});
      setMails(data || []);
    } catch (error) {
      console.error(error);
      setMails([]);
    }
  }

  async function loadHemotestReconciliation() {
    try {
      const data = await api.getHemotestReconciliation();
      setHemotestReconciliation(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setHemotestReconciliation([]);
    }
  }

  async function loadRequests() {
    try {
      const data = await api.getAllRequests();
      setRequests(data || []);
    } catch (error) {
      console.error(error);
      alert('Ошибка при загрузке заявок клиента');
    }
  }

  async function loadClients() {
    try {
      setLoading(true);
      const data = await api.getAllClients();
      setClients(data || []);

      if (selected) {
        const fresh = (data || []).find((client) => client.id === selected.id);
        if (fresh) {
          setSelected(fresh);
          await loadClientDetails(fresh);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Ошибка при загрузке клиентов');
    } finally {
      setLoading(false);
    }
  }

  async function loadClientDetails(client: Client) {
    const [dbPoints, dbRegularClients] = await Promise.all([
      api.getClientPoints(client.id),
      api.getClientRegularClients(client.id),
    ]);

    setPoints(dbPoints);
    setRegularClients(dbRegularClients);
  }

  async function openClient(client: Client) {
    setSelected(client);
    setSelectedClientSection('details');
    loadClientTariffs(client.id);
    await loadClientDetails(client);
  }


  function openClientForm(client?: Client) {
    if (client) {
      setEditingClientId(client.id);
      setClientForm({
        name: client.name,
        address: client.address,
        contactPerson: client.contactPerson || '',
        phone: client.phone || '',
        email: client.email || '',
      });
    } else {
      setEditingClientId(null);
      setClientForm(emptyClient);
    }

    setShowClientModal(true);
  }

  async function submitClient(event: FormEvent) {
    event.preventDefault();

    if (!clientForm.name.trim() || !clientForm.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    try {
      if (editingClientId) {
        await api.updateClient(editingClientId, clientForm);
      } else {
        await api.createClient(clientForm);
      }

      setShowClientModal(false);
      setEditingClientId(null);
      setClientForm(emptyClient);
      await loadClients();
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении клиента');
    }
  }

  function openClientPortalAccess(client: Client) {
    setPortalClient(client);
    setPortalForm({
      ownerName: client.contactPerson || '',
      login: client.email || '',
      password: '',
    });
    setCreatedPortalAccess(null);
    setShowClientPortalModal(true);
  }

  function generateClientPortalPassword() {
    let password = '';
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

    for (let index = 0; index < 10; index += 1) {
      password += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    setPortalForm((value) => ({ ...value, password }));
  }


  async function submitClientPortalAccess(event: FormEvent) {
    event.preventDefault();

    if (!portalClient) return;

    if (!portalForm.ownerName.trim() || !portalForm.login.trim()) {
      alert('Укажите ФИО руководителя и логин');
      return;
    }

    try {
      setIsCreatingPortalAccess(true);

      const account = await api.createClientPortalAccount(portalClient.id, {
        ownerName: portalForm.ownerName,
        login: portalForm.login,
        password: portalForm.password || undefined,
        role: 'owner',
      });

      setCreatedPortalAccess(account);
      setPortalForm((value) => ({ ...value, password: '' }));
    } catch (error) {
      console.error(error);
      alert('Ошибка при создании доступа. Возможно, такой логин уже существует.');
    } finally {
      setIsCreatingPortalAccess(false);
    }
  }

  async function copyCreatedPortalAccess() {
    if (!createdPortalAccess || !portalClient) return;

    const accessText = `Доступ к личному кабинету клиента ${portalClient.name}\nСсылка: https://couriermig.ru/?client=1\nЛогин: ${createdPortalAccess.login}\nПароль: ${createdPortalAccess.temporaryPassword || 'пароль задан вручную'}`;

    await navigator.clipboard.writeText(accessText);
    alert('Логин и пароль скопированы');
  }

  async function deleteClient(client: Client) {
    if (!confirm(`Удалить клиента «${client.name}»?`)) return;

    try {
      await api.deleteClient(client.id);
      setSelected(null);
      await loadClients();
    } catch (error) {
      console.error(error);
      alert('Ошибка при удалении клиента');
    }
  }

  function openPointForm(point?: Point) {
    if (point) {
      setEditingPointId(point.id);
      setPointForm({
        name: point.name,
        address: point.address,
        contactPerson: point.contactPerson || '',
        phone: point.phone || '',
      });
    } else {
      setEditingPointId(null);
      setPointForm(emptyPoint);
    }

    setShowPointModal(true);
  }

  async function submitPoint(event: FormEvent) {
    event.preventDefault();

    if (!selected) return;

    if (!pointForm.name.trim() || !pointForm.address.trim()) {
      alert('Название точки и адрес обязательны');
      return;
    }

    const payload = {
      name: pointForm.name.trim(),
      address: pointForm.address.trim(),
      contactPerson: pointForm.contactPerson.trim() || undefined,
      phone: pointForm.phone.trim() || undefined,
      sortOrder: points.length,
    };

    try {
      if (editingPointId) {
        await api.updateClientPoint(editingPointId, payload);
      } else {
        await api.createClientPoint(selected.id, payload);
      }

      setShowPointModal(false);
      setEditingPointId(null);
      setPointForm(emptyPoint);
      await loadClientDetails(selected);
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении точки');
    }
  }

  function openRegularClientForm(item?: RegularClient) {
    if (item) {
      setEditingRegularClientId(item.id);
      setRegularClientForm({
        name: item.name,
        address: item.address,
        contactPerson: item.contactPerson || '',
        phone: item.phone || '',
      });
    } else {
      setEditingRegularClientId(null);
      setRegularClientForm(emptyPoint);
    }

    setShowRegularClientModal(true);
  }

  async function submitRegularClient(event: FormEvent) {
    event.preventDefault();

    if (!selected) return;

    if (!regularClientForm.name.trim() || !regularClientForm.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    const payload = {
      name: regularClientForm.name.trim(),
      address: regularClientForm.address.trim(),
      contactPerson: regularClientForm.contactPerson.trim() || undefined,
      phone: regularClientForm.phone.trim() || undefined,
      sortOrder: regularClients.length,
    };

    try {
      if (editingRegularClientId) {
        await api.updateClientRegularClient(editingRegularClientId, payload);
      } else {
        await api.createClientRegularClient(selected.id, payload);
      }

      setShowRegularClientModal(false);
      setEditingRegularClientId(null);
      setRegularClientForm(emptyPoint);
      await loadClientDetails(selected);
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении постоянного клиента');
    }
  }

  async function loadCounterpartyDirectories() {
    try {
      setCounterpartiesLoading(true);
      const [partnersData, transportCompaniesData] = await Promise.all([
        api.getPartners(),
        api.getTransportCompanies(),
      ]);

      setPartners(Array.isArray(partnersData) ? partnersData : []);
      setTransportCompanies(Array.isArray(transportCompaniesData) ? transportCompaniesData : []);
    } catch (error) {
      console.error(error);
      alert('Ошибка при загрузке партнёров и транспортных компаний');
    } finally {
      setCounterpartiesLoading(false);
    }
  }

  function openPartnerForm(item?: Partner) {
    if (item) {
      setEditingPartnerId(item.id);
      setPartnerForm({
        name: item.name || '',
        email: item.email || '',
        contactPerson: item.contactPerson || '',
        phone: item.phone || '',
        comment: item.comment || '',
      });
    } else {
      setEditingPartnerId(null);
      setPartnerForm(emptyPartner);
    }

    setShowPartnerModal(true);
  }

  async function submitPartner(event: FormEvent) {
    event.preventDefault();

    if (!partnerForm.name.trim()) {
      alert('Название партнёра обязательно');
      return;
    }

    const payload = {
      name: partnerForm.name.trim(),
      email: partnerForm.email.trim() || null,
      contactPerson: partnerForm.contactPerson.trim() || null,
      phone: partnerForm.phone.trim() || null,
      comment: partnerForm.comment.trim() || null,
      isActive: true,
    };

    try {
      if (editingPartnerId) {
        await api.updatePartner(editingPartnerId, payload);
      } else {
        await api.createPartner(payload);
      }

      setShowPartnerModal(false);
      setEditingPartnerId(null);
      setPartnerForm(emptyPartner);
      await loadCounterpartyDirectories();
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении партнёра');
    }
  }

  async function deletePartner(item: Partner) {
    if (!confirm(`Удалить партнёра «${item.name}»?`)) return;

    try {
      await api.deletePartner(item.id);
      await loadCounterpartyDirectories();
    } catch (error) {
      console.error(error);
      alert('Ошибка при удалении партнёра');
    }
  }

  function openTransportCompanyForm(item?: TransportCompany) {
    if (item) {
      setEditingTransportCompanyId(item.id);
      setTransportCompanyForm({
        name: item.name || '',
        address: item.address || '',
        contactPerson: item.contactPerson || '',
        phone: item.phone || '',
        comment: item.comment || '',
      });
    } else {
      setEditingTransportCompanyId(null);
      setTransportCompanyForm(emptyTransportCompany);
    }

    setShowTransportCompanyModal(true);
  }

  async function submitTransportCompany(event: FormEvent) {
    event.preventDefault();

    if (!transportCompanyForm.name.trim() || !transportCompanyForm.address.trim()) {
      alert('Название и адрес ТК обязательны');
      return;
    }

    const payload = {
      name: transportCompanyForm.name.trim(),
      address: transportCompanyForm.address.trim(),
      contactPerson: transportCompanyForm.contactPerson.trim() || null,
      phone: transportCompanyForm.phone.trim() || null,
      comment: transportCompanyForm.comment.trim() || null,
      isActive: true,
    };

    try {
      if (editingTransportCompanyId) {
        await api.updateTransportCompany(editingTransportCompanyId, payload);
      } else {
        await api.createTransportCompany(payload);
      }

      setShowTransportCompanyModal(false);
      setEditingTransportCompanyId(null);
      setTransportCompanyForm(emptyTransportCompany);
      await loadCounterpartyDirectories();
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении транспортной компании');
    }
  }

  async function deleteTransportCompany(item: TransportCompany) {
    if (!confirm(`Удалить транспортную компанию «${item.name}»?`)) return;

    try {
      await api.deleteTransportCompany(item.id);
      await loadCounterpartyDirectories();
    } catch (error) {
      console.error(error);
      alert('Ошибка при удалении транспортной компании');
    }
  }

  function normalizeClientText(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRequestClientSearchText(request: Request): string {
    return [
      request.recipientName,
      request.recipientCompany,
      request.recipientAddress,
      request.recipientCity,
      request.deliveryAddress,
      request.deliveryCity,
      request.senderName,
      request.senderCompany,
      request.senderAddress,
      request.senderCity,
      request.tcName,
      request.tcAddress,
      request.packageDescription,
      request.items,
      request.description,
      request.specialInstructions,
      request.comments,
    ]
      .filter(Boolean)
      .join(' ');
  }

  function requestBelongsToClient(request: Request, client: Client): boolean {
    if (request.clientId === client.id) return true;

    const haystack = normalizeClientText(getRequestClientSearchText(request));
    const clientName = normalizeClientText(client.name);

    return clientName.length > 0 && haystack.includes(clientName);
  }

  function getRequestTypeLabel(type?: string): string {
    const labels: Record<string, string> = {
      delivery: 'Доставка',
      movement: 'Перемещение',
      nuts: 'Орехи',
      courier_call: 'Вызов курьера',
      pickup_from_tc: 'Забор из ТК',
      simple: 'Простая заявка',
    };

    return type ? labels[type] ?? type : 'Без типа';
  }

  function getRequestFromAddress(request: Request): string {
    return request.senderAddress || request.tcAddress || request.senderCompany || request.senderName || '—';
  }

  function getRequestToAddress(request: Request): string {
    return request.deliveryAddress || request.recipientAddress || request.recipientCompany || request.recipientName || request.tcAddress || '—';
  }

  function getRequestComment(request: Request): string {
    return request.comments || request.specialInstructions || request.description || '';
  }

  function formatDateTime(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function formatMoney(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatPickupDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;

    return new Date(year, month - 1, day).toLocaleDateString('ru-RU');
  }

  function isSundayPickupDate(value: string): boolean {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return false;

    return new Date(year, month - 1, day).getDay() === 0;
  }

  function localDateToIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function addDaysToIso(value: string, days: number): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);

    return localDateToIso(date);
  }

  function lastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  function monthNameRu(month: number): string {
    const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return names[month - 1] || '';
  }

  function periodForIsoDate(value: string): HemotestHalfMonthPeriod {
    const [year, month, day] = value.split('-').map(Number);
    const half = day <= 15 ? 'I' : 'II';
    const startDay = half === 'I' ? 1 : 16;
    const endDay = half === 'I' ? 15 : lastDayOfMonth(year, month);

    return {
      key: `${year}-${String(month).padStart(2, '0')}-${half}`,
      label: `${monthNameRu(month)}-${half === 'I' ? '1' : '2'}`,
      start: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    };
  }

  function buildHemotestHalfMonthPeriods(sourceDates: string[]): HemotestHalfMonthPeriod[] {
    const today = localDateToIso(new Date());
    const allDates = sourceDates.length > 0 ? [...sourceDates, today] : [today];
    const sortedDates = [...allDates].sort();

    const first = periodForIsoDate(sortedDates[0]).start;
    const last = periodForIsoDate(sortedDates[sortedDates.length - 1]).end;
    const result: HemotestHalfMonthPeriod[] = [];

    let cursor = periodForIsoDate(first);

    while (cursor.start <= last) {
      result.push(cursor);

      const [year, month] = cursor.start.split('-').map(Number);
      if (cursor.key.endsWith('-I')) {
        cursor = periodForIsoDate(`${year}-${String(month).padStart(2, '0')}-16`);
      } else {
        const nextMonthDate = new Date(year, month, 1);
        cursor = periodForIsoDate(localDateToIso(nextMonthDate));
      }
    }

    return result.sort((a, b) => a.start.localeCompare(b.start));
  }

  function buildHemotestPeriodDates(period?: HemotestHalfMonthPeriod): string[] {
    if (!period) return [];

    const result: string[] = [];
    for (let cursor = period.start; cursor <= period.end; cursor = addDaysToIso(cursor, 1)) {
      result.push(cursor);
    }

    return result;
  }

  function tariffRuleFromNumbers(firstPlace?: number, nextPlace?: number): TariffRule {
    return {
      firstPlace: firstPlace ? String(firstPlace) : '',
      nextPlace: nextPlace ? String(nextPlace) : '',
    };
  }

  function clientTariffsFromDto(dto: api.ClientTariffsDto): ClientTariffs {
    return {
      delivery: tariffRuleFromNumbers(dto.deliveryFirstPlace, dto.deliveryNextPlace),
      transportCompany: tariffRuleFromNumbers(dto.transportCompanyFirstPlace, dto.transportCompanyNextPlace),
      movement: tariffRuleFromNumbers(dto.movementFirstPlace, dto.movementNextPlace),
      other: tariffRuleFromNumbers(dto.otherFirstPlace, dto.otherNextPlace),
      hemotest: {
        pointPrice: dto.hemotestPointPrice ? String(dto.hemotestPointPrice) : '',
        sundayFirstPointPrice: dto.hemotestSundayFirstPointPrice ? String(dto.hemotestSundayFirstPointPrice) : '',
        sundayNextPointPrice: dto.hemotestSundayNextPointPrice ? String(dto.hemotestSundayNextPointPrice) : '',
      },
    };
  }

  function parseTariffInput(value: string): number {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  function clientTariffsToDto(tariffs: ClientTariffs): api.ClientTariffsDto {
    return {
      deliveryFirstPlace: parseTariffInput(tariffs.delivery.firstPlace),
      deliveryNextPlace: parseTariffInput(tariffs.delivery.nextPlace),
      transportCompanyFirstPlace: parseTariffInput(tariffs.transportCompany.firstPlace),
      transportCompanyNextPlace: parseTariffInput(tariffs.transportCompany.nextPlace),
      movementFirstPlace: parseTariffInput(tariffs.movement.firstPlace),
      movementNextPlace: parseTariffInput(tariffs.movement.nextPlace),
      otherFirstPlace: parseTariffInput(tariffs.other.firstPlace),
      otherNextPlace: parseTariffInput(tariffs.other.nextPlace),
      hemotestPointPrice: parseTariffInput(tariffs.hemotest.pointPrice),
      hemotestSundayFirstPointPrice: parseTariffInput(tariffs.hemotest.sundayFirstPointPrice),
      hemotestSundayNextPointPrice: parseTariffInput(tariffs.hemotest.sundayNextPointPrice),
    };
  }

  async function loadClientTariffs(clientId: number) {
    try {
      const tariffs = await api.getClientTariffs(clientId);
      setClientTariffs(clientTariffsFromDto(tariffs));
    } catch (error) {
      console.error(error);
      setClientTariffs(emptyTariffs);
      alert('Ошибка при загрузке тарифов клиента');
    }
  }

  async function saveClientTariffs(next: ClientTariffs) {
    if (!selected) return;

    setClientTariffs(next);

    try {
      const saved = await api.updateClientTariffs(selected.id, clientTariffsToDto(next));
      setClientTariffs(clientTariffsFromDto(saved));
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении тарифов клиента');
    }
  }

  function parseTariffAmount(value: string): number {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function getTariffCategoryForRequest(request: Request): StandardTariffCategory {
    if (request.requestType === 'movement') return 'movement';

    if (
      request.requestType === 'pickup_from_tc' ||
      Boolean(request.tcName) ||
      Boolean(request.tcAddress) ||
      Boolean(request.trackingNumber)
    ) {
      return 'transportCompany';
    }

    if (request.requestType === 'delivery') return 'delivery';

    return 'other';
  }

  function calculateTariffByPlaces(rule: TariffRule, placesCount?: number): number {
    const places = Math.max(1, Number(placesCount || 1));
    const firstPlace = parseTariffAmount(rule.firstPlace);
    const nextPlace = parseTariffAmount(rule.nextPlace);

    return firstPlace + Math.max(0, places - 1) * nextPlace;
  }

  function getRequestTariff(request: Request): number {
    const category = getTariffCategoryForRequest(request);
    return calculateTariffByPlaces(clientTariffs[category], request.placesCount);
  }

  function getDeliveryFeeForRequest(request: Request): number {
    const manual = deliveryFeesByRequestId[request.id];
    if (manual) {
      const value = Number(String(manual).replace(',', '.'));
      if (Number.isFinite(value) && value > 0) return value;
    }

    return getRequestTariff(request);
  }

  function handleDeliveryFeeChange(requestId: number, value: string) {
    setDeliveryFeesByRequestId((current) => {
      const next = { ...current, [requestId]: value };
      window.localStorage.setItem('mig-client-reconciliation-delivery-fees', JSON.stringify(next));
      return next;
    });
  }

  function escapeHtml(value: unknown): string {
    const text = value == null ? '' : String(value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadExcel(filename: string, rows: ExcelCell[][]) {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    .total td { font-weight: 700; background: #f8fafc; }
  </style>
</head>
<body>
  <table>
    ${rows
      .map((row, rowIndex) => {
        const tag = rowIndex === 0 ? 'th' : 'td';
        const className = row.length > 0 && String(row[0]).startsWith('Итого') ? ' class="total"' : '';
        return `<tr${className}>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('')}</tr>`;
      })
      .join('')}
  </table>
</body>
</html>`;

    const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  function openActiveCounterpartyForm() {
    if (activeCounterpartyTab === 'partners') {
      openPartnerForm();
      return;
    }

    if (activeCounterpartyTab === 'transport') {
      openTransportCompanyForm();
      return;
    }

    openClientForm();
  }

  const addButtonTitle = activeCounterpartyTab === 'partners'
    ? 'Добавить партнёра'
    : activeCounterpartyTab === 'transport'
      ? 'Добавить ТК'
      : 'Добавить клиента';

  const filtered = useMemo(() => {
    const value = query.toLowerCase().trim();
    if (!value) return clients;

    return clients.filter((client) =>
      [client.name, client.address, client.phone, client.contactPerson, client.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(value)
    );
  }, [clients, query]);

  if (selected) {
    const selectedClientRequests = requests
      .filter((request) => request.status === 'completed')
      .filter((request) => requestBelongsToClient(request, selected))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

    const selectedClientPlaces = selectedClientRequests.reduce((sum, request) => sum + (request.placesCount || 0), 0);
    const selectedClientAmount = selectedClientRequests.reduce((sum, request) => sum + getDeliveryFeeForRequest(request), 0);

    const selectedClientReconciliationRows: ExcelCell[][] = [
      ['Дата', 'Клиент', 'Тип', 'Откуда', 'Куда', 'Мест', 'Стоимость доставки', 'Комментарий'],
      ...selectedClientRequests.map((request) => [
        formatDateTime(request.createdAt),
        selected.name,
        getRequestTypeLabel(request.requestType),
        getRequestFromAddress(request),
        getRequestToAddress(request),
        request.placesCount ?? '',
        getDeliveryFeeForRequest(request) || '',
        getRequestComment(request),
      ]),
      [],
      ['Итого доставок', selectedClientRequests.length],
      ['Всего мест', selectedClientPlaces],
      ['Итого к выставлению', selectedClientAmount],
    ];

    const isHemotestClient = selected.name.toLowerCase().includes('гемотест');

    const hemotestPointColumns = Array.from(
      new Map(hemotestReconciliation.map((item) => [item.pointId, item])).values()
    ).sort((a, b) => {
      const byName = a.pointName.localeCompare(b.pointName, 'ru');
      if (byName !== 0) return byName;
      return a.address.localeCompare(b.address, 'ru');
    });

    const hemotestDatesWithPickups = Array.from(new Set(hemotestReconciliation.map((item) => item.date)));
    const hemotestPeriodOptions = buildHemotestHalfMonthPeriods(hemotestDatesWithPickups);
    const selectedHemotestPeriod = hemotestPeriodOptions.find((period) => period.key === selectedHemotestPeriodKey) || hemotestPeriodOptions[hemotestPeriodOptions.length - 1];
    const hemotestDates = buildHemotestPeriodDates(selectedHemotestPeriod);

    const hemotestItemsByDate = new Map<string, HemotestReconciliationItem[]>();
    const hemotestItemByDateAndPoint = new Map<string, HemotestReconciliationItem>();

    for (const item of hemotestReconciliation) {
      const items = hemotestItemsByDate.get(item.date) || [];
      items.push(item);
      hemotestItemsByDate.set(item.date, items);
      hemotestItemByDateAndPoint.set(`${item.date}:${item.pointId}`, item);
    }

    function getHemotestCellPrice(date: string, pointId: number): number {
      const item = hemotestItemByDateAndPoint.get(`${date}:${pointId}`);
      if (!item) return 0;

      if (!isSundayPickupDate(date)) {
        return parseTariffAmount(clientTariffs.hemotest.pointPrice);
      }

      const sundayFirst = parseTariffAmount(clientTariffs.hemotest.sundayFirstPointPrice);
      const sundayNext = parseTariffAmount(clientTariffs.hemotest.sundayNextPointPrice);
      const orderedItems = [...(hemotestItemsByDate.get(date) || [])].sort((a, b) => {
        const aTime = a.pickedAt ? new Date(a.pickedAt).getTime() : 0;
        const bTime = b.pickedAt ? new Date(b.pickedAt).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.pointId - b.pointId;
      });
      const index = orderedItems.findIndex((row) => row.pointId === pointId);

      return index <= 0 ? sundayFirst : sundayNext;
    }

    const hemotestDateRows = hemotestDates.map((date) => {
      const cells = hemotestPointColumns.map((point) => ({
        pointId: point.pointId,
        price: getHemotestCellPrice(date, point.pointId),
      }));
      const total = cells.reduce((sum, cell) => sum + cell.price, 0);

      return {
        date,
        isSunday: isSundayPickupDate(date),
        cells,
        total,
      };
    });

    const hemotestPointRows = hemotestPointColumns.map((point) => {
      const cells = hemotestDates.map((date) => ({
        date,
        isSunday: isSundayPickupDate(date),
        price: getHemotestCellPrice(date, point.pointId),
      }));

      return { point, cells };
    });

    const hemotestDayTotals = hemotestDates.map((date) => ({
      date,
      isSunday: isSundayPickupDate(date),
      total: hemotestDateRows.find((row) => row.date === date)?.total || 0,
    }));

    const hemotestDayCounts = hemotestDates.map((date) => {
      const row = hemotestDateRows.find((item) => item.date === date);

      return {
        date,
        isSunday: isSundayPickupDate(date),
        count: row?.cells.filter((cell) => cell.price > 0).length || 0,
      };
    });

    const hemotestTotalAmount = hemotestDayTotals.reduce((sum, row) => sum + row.total, 0);
    const hemotestPickedCount = hemotestDayCounts.reduce((sum, row) => sum + row.count, 0);
    const hemotestGraphMax = Math.max(...hemotestDayCounts.map((row) => row.count), 1);
    const hemotestLineStep = 42;
    const hemotestLineWidth = Math.max(hemotestDates.length, 1) * hemotestLineStep;
    const hemotestLinePoints = hemotestDayCounts
      .map((row, index) => {
        const x = 150 + index * 42 + 21;
        const y = row.count > 0 ? 82 - Math.max(8, Math.round((row.count / hemotestGraphMax) * 72)) : 82;

        return `${x},${y}`;
      })
      .join(' ');

    const hemotestReconciliationRows: ExcelCell[][] = [
      ['Точка сбора', ...hemotestDates.map((date) => `${formatPickupDate(date)}${isSundayPickupDate(date) ? ' / воскресенье' : ''}`)],
      ...hemotestPointRows.map((row) => [
        `${row.point.pointName} • ${row.point.address}`,
        ...row.cells.map((cell) => cell.price ? '✓' : ''),
      ]),
      [],
      ['Итого за день', ...hemotestDayTotals.map((row) => row.total || '')],
      ['Итого к выставлению', hemotestTotalAmount || ''],
    ];

    const activeReconciliationRows = isHemotestClient ? hemotestReconciliationRows : selectedClientReconciliationRows;
    const activeReconciliationIsEmpty = isHemotestClient ? hemotestPointRows.length === 0 : selectedClientRequests.length === 0;

    const downloadSelectedClientReconciliation = () => {
      const fileClientName = selected.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'client';
      downloadExcel(`mig-client-sverka-${fileClientName}.xls`, activeReconciliationRows);
    };

    return (
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button onClick={() => setSelected(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{selected.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Магазины, точки и постоянные клиенты.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedClientSection('reconciliation')} className={buttonSecondary}>
              <FileSpreadsheet className="h-4 w-4" />
              Сверка
            </button>

            <button onClick={() => setShowTariffsModal(true)} className={buttonSecondary}>
              <FileSpreadsheet className="h-4 w-4" />
              Тарифы
            </button>

            <button onClick={downloadSelectedClientReconciliation} className={buttonSecondary} disabled={activeReconciliationIsEmpty}>
              <Download className="h-4 w-4" />
              Excel
            </button>

            <button onClick={() => openClientForm(selected)} className={buttonSecondary}>
              <Edit2 className="h-4 w-4" />
              Редактировать
            </button>

            <button onClick={() => deleteClient(selected)} className={buttonSecondary}>
              <Trash2 className="h-4 w-4" />
              Удалить
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedClientSection('details')}
              className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                selectedClientSection === 'details'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              Данные клиента
            </button>

            <button
              type="button"
              onClick={() => setSelectedClientSection('reconciliation')}
              className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                selectedClientSection === 'reconciliation'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              Сверка
            </button>
          </div>
        </div>

        {selectedClientSection === 'details' ? (
          <>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <UserRound className="h-4 w-4" />
                Руководитель / владелец
              </div>

              <button
                type="button"
                onClick={() => void openClientPortalAccess(selected)}
                className={buttonSecondary}
                title="Выдать личный кабинет руководителю"
              >
                <KeyRound className="h-4 w-4" />
                ЛК
              </button>
            </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Руководитель" value={selected.contactPerson || '—'} />
            <Info label="Телефон" value={selected.phone || '—'} />
            <Info label="Email" value={selected.email || '—'} />
            <Info label="Роль" value="Ответственный за клиента" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Точки и магазины</h2>
            <p className="mt-1 text-xs text-slate-500">Адреса, контакты и телефоны конкретных точек клиента.</p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {points.map((point) => (
              <PointCard
                key={point.id}
                point={point}
                onEdit={() => openPointForm(point)}
                onDelete={async () => {
                  if (point.isPrimary) return;
                  if (!selected) return;
                  if (confirm(`Удалить точку «${point.name}»?`)) {
                    await api.deleteClientPoint(point.id);
                    await loadClientDetails(selected);
                  }
                }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Постоянные клиенты</h2>
              <p className="mt-1 text-xs text-slate-500">Клиенты, которые относятся только к «{selected.name}».</p>
            </div>

            <button onClick={() => openRegularClientForm()} className={buttonSecondary}>
              <Plus className="h-4 w-4" />
              Добавить постоянного клиента
            </button>
          </div>

          {regularClients.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center">
              <UserRound className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-950">Постоянных клиентов пока нет</p>
              <p className="mt-1 text-xs text-slate-500">Добавь их здесь, потом подключим к созданию заявок.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Клиент</th>
                    <th className="px-5 py-3 font-semibold">Адрес</th>
                    <th className="px-5 py-3 font-semibold">Контакт</th>
                    <th className="px-5 py-3 font-semibold">Телефон</th>
                    <th className="w-[86px] px-2 py-2 text-right font-semibold">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {regularClients.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold text-slate-950">{item.name}</td>
                      <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.address}</td>
                      <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.contactPerson || '—'}</td>
                      <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.phone || '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openRegularClientForm(item)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            Изменить
                          </button>

                          <button
                            onClick={async () => {
                              if (!selected) return;
                              if (confirm(`Удалить постоянного клиента «${item.name}»?`)) {
                                await api.deleteClientRegularClient(item.id);
                                await loadClientDetails(selected);
                              }
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          >
                            Удалить
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

          </>
        ) : isHemotestClient ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Сверка Гемотест</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {hemotestPeriodOptions.map((period) => (
                    <button
                      key={period.key}
                      type="button"
                      onClick={() => setSelectedHemotestPeriodKey(period.key)}
                      className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-xs font-semibold transition ${
                        selectedHemotestPeriod?.key === period.key
                          ? 'bg-slate-950 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                      }`}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={downloadSelectedClientReconciliation}
                disabled={activeReconciliationIsEmpty}
                className={buttonSecondary}
              >
                <Download className="h-4 w-4" />
                Скачать Excel
              </button>
            </div>


            <div className="border-b border-slate-200 p-5">
              <div className="grid" style={{ gridTemplateColumns: `150px ${hemotestLineWidth}px`, minWidth: `${150 + hemotestLineWidth}px` }}>
                <div className="border-r border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Итого</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">{hemotestPickedCount} точек</p>
                  <p className="mt-1 text-sm text-slate-500">{formatMoney(hemotestTotalAmount)}</p>
                </div>

                <div className="bg-white py-4">
                  <div className="mb-3 flex items-center justify-between gap-3 px-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">График по дням</p>
                    </div>

                    {selectedHemotestPeriod ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                        {selectedHemotestPeriod.label}
                      </span>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <svg
                      width={hemotestLineWidth}
                      height="88"
                      viewBox={`0 0 ${hemotestLineWidth} 88`}
                      className="block"
                      role="img"
                      aria-label="График количества собранных точек по дням"
                    >
                      <line x1="0" y1="82" x2={hemotestLineWidth} y2="82" stroke="#e2e8f0" strokeWidth="1" />

                      {[25, 50, 75].map((offset) => (
                        <line
                          key={offset}
                          x1="0"
                          y1={82 - offset}
                          x2={hemotestLineWidth}
                          y2={82 - offset}
                          stroke="#f1f5f9"
                          strokeWidth="1"
                        />
                      ))}

                      <polyline
                        fill="none"
                        stroke="#020617"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={hemotestLinePoints}
                      />

                      {hemotestDayCounts.map((row, index) => {
                        const x = 150 + index * 42 + 21;
                        const y = row.count > 0 ? 82 - Math.max(8, Math.round((row.count / hemotestGraphMax) * 72)) : 82;

                        return (
                          <g key={row.date}>
                            <circle
                              cx={x}
                              cy={y}
                              r={row.count > 0 ? 3.5 : 2.5}
                              fill={row.isSunday ? '#f59e0b' : '#020617'}
                              opacity={row.count > 0 ? 1 : 0.25}
                            />

                            <text
                              x={x}
                              y="104"
                              textAnchor="middle"
                              className="fill-slate-600 text-[10px] font-semibold"
                            >
                              {Number(row.date.slice(8, 10))}
                            </text>

                            {row.count > 0 && (
                              <text
                                x={x}
                                y={Math.max(10, y - 8)}
                                textAnchor="middle"
                                className="fill-slate-500 text-[9px]"
                              >
                                {row.count}
                              </text>
                            )}

                            {row.isSunday && (
                              <text
                                x={x}
                                y="116"
                                textAnchor="middle"
                                className="fill-amber-600 text-[9px] font-semibold"
                              >
                                ВС
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
            </div>

            </div>
            {hemotestPointRows.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
                <FileSpreadsheet className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-950">Собранных точек Гемотест пока нет</p>
                <p className="mt-1 text-xs text-slate-500">Когда курьеры отметят точки как собранные, они появятся здесь.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-[11px]" style={{ minWidth: `${150 + hemotestLineWidth}px` }}>
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-[0.06em] text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-10 w-[150px] border-r border-b border-slate-200 bg-slate-50 px-2 py-2 font-semibold">Точка сбора</th>
                      {hemotestDates.map((date) => (
                        <th key={date} className="w-[42px] border-r border-b border-slate-200 px-1 py-2 text-center font-semibold">
                          <div className="whitespace-nowrap text-[10px] font-semibold leading-tight text-slate-700">{formatPickupDate(date).slice(0, 2)}</div>
                          {isSundayPickupDate(date) && <div className="mt-0.5 text-[9px] font-semibold text-amber-700">ВС</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {hemotestPointRows.map((row) => (
                      <tr key={row.point.pointId} className="hover:bg-slate-50/80">
                        <td className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-950">
                          <div className="truncate">{row.point.pointName}</div>
                          <div className="mt-0.5 truncate text-[9px] font-normal text-slate-400">{row.point.address}</div>
                        </td>
                        {row.cells.map((cell) => (
                          <td key={cell.date} className={cell.isSunday ? 'border-r border-b border-slate-200 bg-amber-50/60 px-1 py-1.5 text-center text-xs font-bold text-slate-700' : 'border-r border-b border-slate-200 px-1 py-1.5 text-center text-xs font-bold text-slate-700'}>
                            {cell.price > 0 ? '✓' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}

                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="sticky left-0 z-10 border-r border-t border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-bold text-slate-950">
                        Итого за день
                      </td>
                      {hemotestDayTotals.map((row) => (
                        <td key={row.date} className={row.isSunday ? 'border-r border-t border-slate-200 bg-amber-50 px-1 py-2 text-center text-[10px] font-bold text-slate-950' : 'border-r border-t border-slate-200 px-1 py-2 text-center text-[10px] font-bold text-slate-950'}>
                          {row.total > 0 ? formatMoney(row.total).replace(/\s?₽/, '') : ''}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Сверка клиента</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Только выполненные заявки клиента. Стоимость можно изменить вручную в строке.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadSelectedClientReconciliation}
                  disabled={activeReconciliationIsEmpty}
                  className={buttonSecondary}
                >
                  <Download className="h-4 w-4" />
                  Скачать Excel
                </button>
              </div>
            </div>

            <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Доставок</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{selectedClientRequests.length}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Мест</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{selectedClientPlaces}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Итого</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney(selectedClientAmount)}</p>
              </div>
            </div>

            {selectedClientRequests.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
                <FileSpreadsheet className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-950">Выполненных заявок для сверки пока нет</p>
                <p className="mt-1 text-xs text-slate-500">Заявки попадут сюда после выполнения и привязки к клиенту.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Дата</th>
                      <th className="px-5 py-3 font-semibold">Тип</th>
                      <th className="px-5 py-3 font-semibold">Откуда</th>
                      <th className="px-5 py-3 font-semibold">Куда</th>
                      <th className="w-[86px] px-2 py-2 text-right font-semibold">Мест</th>
                      <th className="w-[86px] px-2 py-2 text-right font-semibold">Стоимость</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {selectedClientRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDateTime(request.createdAt)}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{getRequestTypeLabel(request.requestType)}</td>
                        <td className="max-w-[320px] truncate px-5 py-4 text-slate-600">{getRequestFromAddress(request)}</td>
                        <td className="max-w-[360px] truncate px-5 py-4 text-slate-600">{getRequestToAddress(request)}</td>
                        <td className="px-5 py-4 text-right text-slate-600">{request.placesCount ?? '—'}</td>
                        <td className="px-5 py-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={deliveryFeesByRequestId[request.id] ?? (getRequestTariff(request) || '')}
                            onChange={(event) => handleDeliveryFeeChange(request.id, event.target.value)}
                            placeholder="0"
                            className="h-10 w-32 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedClientSection === 'details' && (
        <button
          type="button"
          onClick={() => openPointForm()}
          className="pointer-events-auto fixed bottom-6 right-6 z-[9998] xl:right-[400px] 2xl:right-[440px] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
          title="Добавить точку"
          aria-label="Добавить точку"
        >
          <Plus className="h-6 w-6" />
        </button>
        )}

        {showClientPortalModal && portalClient && (
          <ClientPortalAccessModal
            client={portalClient}
            form={portalForm}
            setForm={setPortalForm}
            createdAccess={createdPortalAccess}
            isSubmitting={isCreatingPortalAccess}
            onSubmit={submitClientPortalAccess}
            onCopy={copyCreatedPortalAccess}
            onGeneratePassword={generateClientPortalPassword}
            onClose={() => setShowClientPortalModal(false)}
          />
        )}
        {showClientModal && <ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={() => setShowClientModal(false)} />}
      {showPartnerModal && <PartnerModal form={partnerForm} setForm={setPartnerForm} editing={Boolean(editingPartnerId)} onSubmit={submitPartner} onClose={() => setShowPartnerModal(false)} />}
      {showTransportCompanyModal && <TransportCompanyModal form={transportCompanyForm} setForm={setTransportCompanyForm} editing={Boolean(editingTransportCompanyId)} onSubmit={submitTransportCompany} onClose={() => setShowTransportCompanyModal(false)} />}
        {showPointModal && <PointModal form={pointForm} setForm={setPointForm} editing={Boolean(editingPointId)} onSubmit={submitPoint} onClose={() => setShowPointModal(false)} />}
        {showRegularClientModal && <RegularClientModal form={regularClientForm} setForm={setRegularClientForm} editing={Boolean(editingRegularClientId)} onSubmit={submitRegularClient} onClose={() => setShowRegularClientModal(false)} />}
        {showTariffsModal && (
          <ClientTariffsModal
            client={selected}
            tariffs={clientTariffs}
            setTariffs={saveClientTariffs}
            onClose={() => setShowTariffsModal(false)}
          />
        )}

      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-7">
          {[
            ['clients', 'Клиенты'],
            ['partners', 'Партнёры'],
            ['transport', 'Транспортные компании'],
          ].map(([tabId, label]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveCounterpartyTab(tabId as CounterpartyTab)}
              className={`relative -mb-px inline-flex h-12 items-center justify-center text-sm font-semibold transition ${
                activeCounterpartyTab === tabId
                  ? 'text-slate-950'
                  : 'text-slate-500 hover:text-slate-950'
              }`}
            >
              {label}
              {activeCounterpartyTab === tabId && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-slate-950" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeCounterpartyTab === 'partners' && (
        <PartnersTable
          partners={partners}
          mails={mails}
          loading={counterpartiesLoading}
          onEdit={openPartnerForm}
          onDelete={(item) => void deletePartner(item)}
        />
      )}

      {activeCounterpartyTab === 'transport' && (
        <TransportCompaniesTable
          companies={transportCompanies}
          loading={counterpartiesLoading}
          onEdit={openTransportCompanyForm}
          onDelete={(item) => void deleteTransportCompany(item)}
        />
      )}

      <div className={activeCounterpartyTab === 'clients' ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'hidden'}>
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по клиенту, руководителю, телефону или адресу..." className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-slate-300 focus:bg-white" />
          </div>

          <div className="text-xs text-slate-400">{filtered.length} клиентов</div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-block h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Building2 className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-950">Клиенты не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Клиент</th>
                  <th className="px-5 py-3 font-semibold">Руководитель</th>
                  <th className="px-5 py-3 font-semibold">Телефон</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="w-[86px] px-2 py-2 text-right font-semibold">Открыть</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map((client) => (
                  <tr key={client.id} onClick={() => void openClient(client)} className="group cursor-pointer hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{client.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Вся строка кликабельна</p>
                    </td>
                    <td className="px-2 py-2 text-center text-[11px] text-slate-600">{client.contactPerson || '—'}</td>
                    <td className="px-2 py-2 text-center text-[11px] text-slate-600">{client.phone || '—'}</td>
                    <td className="px-2 py-2 text-center text-[11px] text-slate-600">{client.email || '—'}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition group-hover:bg-slate-950 group-hover:text-white">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openActiveCounterpartyForm}
        className="pointer-events-auto fixed bottom-6 right-6 z-[9998] xl:right-[400px] 2xl:right-[440px] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
        title={addButtonTitle}
        aria-label={addButtonTitle}
      >
        <Plus className="h-6 w-6" />
      </button>

      {showClientModal && <ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={() => setShowClientModal(false)} />}
      {showPartnerModal && <PartnerModal form={partnerForm} setForm={setPartnerForm} editing={Boolean(editingPartnerId)} onSubmit={submitPartner} onClose={() => setShowPartnerModal(false)} />}
      {showTransportCompanyModal && <TransportCompanyModal form={transportCompanyForm} setForm={setTransportCompanyForm} editing={Boolean(editingTransportCompanyId)} onSubmit={submitTransportCompany} onClose={() => setShowTransportCompanyModal(false)} />}
    </div>
  );
}

function PartnersTable({ partners, mails, loading, onEdit, onDelete }: { partners: Partner[]; mails: Mail[]; loading: boolean; onEdit: (item: Partner) => void; onDelete: (item: Partner) => void }) {
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [selectedPartnerSection, setSelectedPartnerSection] = useState<'details' | 'reconciliation'>('details');

  const getDeliveredPartnerMails = (partner: Partner) =>
    mails
      .filter((mail) => mail.status === 'delivered' && mail.partnerId === partner.id)
      .sort((a, b) => {
        const aTime = new Date(a.deliveredAt || a.createdAt).getTime();
        const bTime = new Date(b.deliveredAt || b.createdAt).getTime();
        return bTime - aTime;
      });

  const formatPartnerMailDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU');
  };

  const downloadPartnerExcel = (fileName: string, rows: ExcelCell[][]) => {
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (selectedPartner) {
    const selectedPartnerMails = getDeliveredPartnerMails(selectedPartner);

    const selectedPartnerReconciliationRows: ExcelCell[][] = [
      ['Дата доставки', 'Партнер', 'Накладная', 'Получатель', 'Телефон', 'Адрес'],
      ...selectedPartnerMails.map((mail) => [
        formatPartnerMailDate(mail.deliveredAt || mail.createdAt),
        selectedPartner.name,
        mail.waybillNumber,
        mail.recipientName || '',
        mail.recipientPhone || '',
        mail.deliveryAddress || '',
      ]),
      [],
      ['Итого доставленных писем', selectedPartnerMails.length],
    ];

    const downloadSelectedPartnerReconciliation = () => {
      const filePartnerName = selectedPartner.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'partner';
      downloadPartnerExcel(`mig-partner-sverka-${filePartnerName}.xls`, selectedPartnerReconciliationRows);
    };

    return (
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => {
                setSelectedPartner(null);
                setSelectedPartnerSection('details');
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedPartner.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Данные партнёра и сверка по доставленным письмам.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedPartnerSection('reconciliation')} className={buttonSecondary}>
              <FileSpreadsheet className="h-4 w-4" />
              Сверка
            </button>

            <button type="button" onClick={downloadSelectedPartnerReconciliation} className={buttonSecondary} disabled={selectedPartnerMails.length === 0}>
              <Download className="h-4 w-4" />
              Excel
            </button>

            <button type="button" onClick={() => onEdit(selectedPartner)} className={buttonSecondary}>
              <Edit2 className="h-4 w-4" />
              Редактировать
            </button>

            <button type="button" onClick={() => onDelete(selectedPartner)} className={buttonSecondary}>
              <Trash2 className="h-4 w-4" />
              Удалить
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPartnerSection('details')}
              className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                selectedPartnerSection === 'details'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              Данные партнёра
            </button>

            <button
              type="button"
              onClick={() => setSelectedPartnerSection('reconciliation')}
              className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                selectedPartnerSection === 'reconciliation'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              Сверка
            </button>
          </div>
        </div>

        {selectedPartnerSection === 'details' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <UserRound className="h-4 w-4" />
              Контактные данные
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Партнёр" value={selectedPartner.name} />
              <Info label="Контакт" value={selectedPartner.contactPerson || '—'} />
              <Info label="Телефон" value={selectedPartner.phone || '—'} />
              <Info label="Email" value={selectedPartner.email || '—'} />
            </div>
          </div>
        )}

        {(selectedPartnerSection === 'details' || selectedPartnerSection === 'reconciliation') && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Сверка партнёра</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Только доставленные письма, созданные с этим партнёром.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${selectedPartnerMails.length > 0 ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${selectedPartnerMails.length > 0 ? 'bg-emerald-500' : 'bg-transparent'}`} />
                  </span>
                  {selectedPartnerMails.length} доставлено
                </div>

                <button
                  type="button"
                  onClick={downloadSelectedPartnerReconciliation}
                  disabled={selectedPartnerMails.length === 0}
                  className={buttonSecondary}
                >
                  <Download className="h-4 w-4" />
                  Скачать Excel
                </button>
              </div>
            </div>


            {selectedPartnerMails.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
                <FileSpreadsheet className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-950">Доставленных писем для сверки пока нет</p>
                <p className="mt-1 text-xs text-slate-500">Письма попадут сюда после доставки и привязки к партнёру.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Дата доставки</th>
                      <th className="px-5 py-3 font-semibold">Накладная</th>
                      <th className="px-5 py-3 font-semibold">Получатель</th>
                      <th className="px-5 py-3 font-semibold">Телефон</th>
                      <th className="px-5 py-3 font-semibold">Адрес</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {selectedPartnerMails.map((mail) => (
                      <tr key={mail.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatPartnerMailDate(mail.deliveredAt)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-950">{mail.waybillNumber}</td>
                        <td className="px-2 py-2 text-center text-[11px] text-slate-600">{mail.recipientName || '—'}</td>
                        <td className="px-2 py-2 text-center text-[11px] text-slate-600">{mail.recipientPhone || '—'}</td>
                        <td className="max-w-[420px] truncate px-5 py-4 text-slate-600">{mail.deliveryAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const safePartners = Array.isArray(partners) ? partners : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-950">Партнёры</h2>
        <p className="text-xs text-slate-500">Организации и люди, которые присылают письма, накладные и файлы.</p>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-block h-16" />)}</div>
      ) : safePartners.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <Building2 className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-950">Партнёров пока нет</p>
          <p className="mt-1 text-xs text-slate-500">Нажми плюс справа снизу, чтобы добавить партнёра.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Партнёр</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Контакт</th>
                <th className="px-5 py-3 font-semibold">Телефон</th>
                <th className="px-5 py-3 font-semibold">Комментарий</th>
                <th className="w-[86px] px-2 py-2 text-right font-semibold">Открыть</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {safePartners.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedPartner(item);
                    setSelectedPartnerSection('details');
                  }}
                  className="group cursor-pointer hover:bg-slate-50/80"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">Вся строка кликабельна</p>
                  </td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.email || '—'}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.contactPerson || '—'}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.phone || '—'}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.comment || '—'}</td>
                  <td className="px-5 py-4 text-right">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition group-hover:bg-slate-950 group-hover:text-white">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransportCompaniesTable({ companies, loading, onEdit, onDelete }: { companies: TransportCompany[]; loading: boolean; onEdit: (item: TransportCompany) => void; onDelete: (item: TransportCompany) => void }) {
  const safeCompanies = Array.isArray(companies) ? companies : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-950">Транспортные компании</h2>
        <p className="text-xs text-slate-500">Справочник ТК для заявок типа “Транспортная компания”.</p>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-block h-16" />)}</div>
      ) : safeCompanies.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <Building2 className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-950">Транспортных компаний пока нет</p>
          <p className="mt-1 text-xs text-slate-500">Нажми плюс справа снизу, чтобы добавить ТК.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">ТК</th>
                <th className="px-5 py-3 font-semibold">Адрес</th>
                <th className="px-5 py-3 font-semibold">Контакт</th>
                <th className="px-5 py-3 font-semibold">Телефон</th>
                <th className="px-5 py-3 font-semibold">Комментарий</th>
                <th className="w-[86px] px-2 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {safeCompanies.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4 font-semibold text-slate-950">{item.name}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.address}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.contactPerson || '—'}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.phone || '—'}</td>
                  <td className="px-2 py-2 text-center text-[11px] text-slate-600">{item.comment || '—'}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => onEdit(item)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Изменить
                      </button>
                      <button onClick={() => onDelete(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100">
                        <Trash2 className="h-3.5 w-3.5" />
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
  );
}


function PointCard({ point, onEdit, onDelete }: { point: Point; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
            <Store className="h-4 w-4" />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">{point.name}</p>
            <p className="mt-1 text-xs text-slate-500">{point.isPrimary ? 'Основная точка' : 'Магазин / филиал'}</p>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2 text-sm text-slate-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>{point.address}</span>
        </div>

        {(point.contactPerson || point.phone) && (
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {point.contactPerson && <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{point.contactPerson}</div>}
            {point.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{point.phone}</div>}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onEdit} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Edit2 className="h-3.5 w-3.5" />
          Редактировать
        </button>

        {!point.isPrimary && (
          <button type="button" onClick={onDelete} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={full ? 'sm:col-span-2' : ''}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{value}</p></div>;
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  );
}

function ClientModal({ form, setForm, editing, onSubmit, onClose }: { form: ClientForm; setForm: Dispatch<SetStateAction<ClientForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать клиента' : 'Добавить клиента'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название клиента *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Основной адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className={inputClass} placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить клиента'}</button>
      </form>
    </ModalShell>
  );
}

function PointModal({ form, setForm, editing, onSubmit, onClose }: { form: PointForm; setForm: Dispatch<SetStateAction<PointForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать точку' : 'Добавить точку'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название точки *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить точку'}</button>
      </form>
    </ModalShell>
  );
}

function PartnerModal({ form, setForm, editing, onSubmit, onClose }: { form: PartnerForm; setForm: Dispatch<SetStateAction<PartnerForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать партнёра' : 'Добавить партнёра'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название партнёра *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Email отправителя" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <textarea className={`${inputClass} min-h-24 py-3`} placeholder="Комментарий" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить партнёра'}</button>
      </form>
    </ModalShell>
  );
}

function TransportCompanyModal({ form, setForm, editing, onSubmit, onClose }: { form: TransportCompanyForm; setForm: Dispatch<SetStateAction<TransportCompanyForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать ТК' : 'Добавить ТК'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название ТК *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Адрес ТК *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <textarea className={`${inputClass} min-h-24 py-3`} placeholder="Комментарий" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить ТК'}</button>
      </form>
    </ModalShell>
  );
}


function ClientTariffsModal({
  client,
  tariffs,
  setTariffs,
  onClose,
}: {
  client: Client;
  tariffs: ClientTariffs;
  setTariffs: (tariffs: ClientTariffs) => void | Promise<void>;
  onClose: () => void;
}) {
  const update = (category: StandardTariffCategory, field: keyof TariffRule, value: string) => {
    void setTariffs({
      ...tariffs,
      [category]: {
        ...tariffs[category],
        [field]: value,
      },
    });
  };

  const updateHemotest = (field: keyof ClientTariffs['hemotest'], value: string) => {
    void setTariffs({
      ...tariffs,
      hemotest: {
        ...tariffs.hemotest,
        [field]: value,
      },
    });
  };

  const renderTariffRow = (
    category: StandardTariffCategory,
    title: string,
    description: string,
  ) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Первое место
          </span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="50"
            value={tariffs[category].firstPlace}
            onChange={(event) => update(category, 'firstPlace', event.target.value)}
            placeholder="Например 500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Каждое следующее место
          </span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="50"
            value={tariffs[category].nextPlace}
            onChange={(event) => update(category, 'nextPlace', event.target.value)}
            placeholder="Например 150"
          />
        </label>
      </div>
    </div>
  );

  return (
    <ModalShell title={`Тарифы: ${client.name}`} onClose={onClose}>
      <div className="space-y-3">
        {renderTariffRow('delivery', 'Доставка до клиента', 'Обычная доставка до конкретного клиента.')}
        {renderTariffRow('transportCompany', 'Транспортная компания', 'Один тариф для доставки в ТК и забора из ТК.')}
        {renderTariffRow('movement', 'Перемещение', 'Перемещения между точками, складом, офисом и клиентскими адресами.')}
        {renderTariffRow('other', 'Другое', 'Запасной тариф для заявок без подходящего типа.')}

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-950">Гемотест / сбор точек</p>
            <p className="mt-1 text-xs text-slate-500">
              Обычный день — цена за каждую точку. В воскресенье сайт сам считает первую и последующие точки за день.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Цена за точку
              </span>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="50"
                value={tariffs.hemotest.pointPrice}
                onChange={(event) => updateHemotest('pointPrice', event.target.value)}
                placeholder="Например 250"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                ВС первая точка
              </span>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="50"
                value={tariffs.hemotest.sundayFirstPointPrice}
                onChange={(event) => updateHemotest('sundayFirstPointPrice', event.target.value)}
                placeholder="Например 400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                ВС последующие
              </span>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="50"
                value={tariffs.hemotest.sundayNextPointPrice}
                onChange={(event) => updateHemotest('sundayNextPointPrice', event.target.value)}
                placeholder="Например 200"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Формула: первое место + каждое следующее место × количество дополнительных мест. Тарифы сохраняются в базе данных.
        </div>

        <button type="button" onClick={onClose} className={`w-full ${buttonPrimary}`}>
          Готово
        </button>
      </div>
    </ModalShell>
  );
}


function RegularClientModal({ form, setForm, editing, onSubmit, onClose }: { form: PointForm; setForm: Dispatch<SetStateAction<PointForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать постоянного клиента' : 'Добавить постоянного клиента'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название / имя *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить'}</button>
      </form>
    </ModalShell>
  );
}

function ClientPortalAccessModal({
  client,
  form,
  setForm,
  createdAccess,
  isSubmitting,
  onSubmit,
  onCopy,
  onGeneratePassword,
  onClose,
}: {
  client: Client;
  form: { ownerName: string; login: string; password: string };
  setForm: Dispatch<SetStateAction<{ ownerName: string; login: string; password: string }>>;
  createdAccess: api.ClientPortalAccount | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent) => void;
  onCopy: () => void;
  onGeneratePassword: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Выдать ЛК клиенту" onClose={onClose}>
      <div className="space-y-5">
        <p className="-mt-2 text-sm leading-6 text-slate-500">
          Создайте логин и пароль для входа руководителя в личный кабинет клиента.
        </p>

        {createdAccess && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Доступ создан</p>
                <p className="mt-1 text-sm text-slate-500">Передайте эти данные руководителю клиента. Пароль показывается только сейчас.</p>
              </div>

              <button type="button" onClick={onCopy} className={buttonSecondary}>
                Скопировать доступ
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PortalAccessTile label="Логин" value={createdAccess.login} />
              <PortalAccessTile label="Пароль" value={createdAccess.temporaryPassword || 'пароль задан вручную'} />
              <PortalAccessTile label="Ссылка" value="couriermig.ru/?client=1" />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">ФИО руководителя / владельца *</label>
            <input
              value={form.ownerName}
              onChange={(event) => setForm((value) => ({ ...value, ownerName: event.target.value }))}
              placeholder="Например: Иванов Иван"
              className={inputClass}
              required
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Логин *</label>
              <input
                value={form.login}
                onChange={(event) => setForm((value) => ({ ...value, login: event.target.value }))}
                placeholder="director"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Пароль</label>
              <div className="flex gap-2">
                <input
                  value={form.password}
                  onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
                  placeholder="пусто = автоматически"
                  className={inputClass}
                />

                <button
                  type="button"
                  onClick={onGeneratePassword}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  title="Сгенерировать пароль"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            Клиент сможет войти только по выданному логину и паролю. Самостоятельной регистрации в личном кабинете нет.
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className={`flex-1 ${buttonPrimary}`}>
              {isSubmitting ? 'Создание...' : 'Создать доступ'}
            </button>

            <button type="button" onClick={onClose} className={`flex-1 ${buttonSecondary}`}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}


function PortalAccessTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

