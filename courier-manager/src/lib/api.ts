const API_BASE = '/api/trpc';

export async function managerFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('managerToken');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  });
}

export interface Client {
  id: number;
  name: string;
  address: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  legalAddress?: string;
  /** OGRN for organisations / OGRNIP for individual entrepreneurs */
  ogrn?: string;
  /** Postal address printed on documents */
  postalAddress?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  status: string;
  taskType: string;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  courierId?: number | null;
  courierName?: string | null;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  packageDescription?: string;
  specialInstructions?: string;
  comments?: string;
  placesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RealtimeSnapshot {
  ok: boolean;
  updatedAt: string;
  tasks: Task[];
  requests: Request[];
  mails: Mail[];
}

type JsonRecord = Record<string, unknown>;

function unwrapTrpc<T>(payload: any, fallback: T): T {
  const data = Array.isArray(payload) ? payload[0] : payload;
  return data?.result?.data?.json ?? data?.result?.data ?? data?.result ?? fallback;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function inputQuery(input?: JsonRecord) {
  if (!input || Object.keys(input).length === 0) return 'input={}';
  return `input=${encodeURIComponent(JSON.stringify(input))}`;
}

async function trpcGet<T>(procedure: string, input?: JsonRecord, fallback: T = [] as T): Promise<T> {
  const wrappedInput = input ? { json: input } : undefined;

  const response = await managerFetch(`${API_BASE}/${procedure}?${inputQuery(wrappedInput)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error?.message || `Failed to fetch ${procedure}`);
  return unwrapTrpc<T>(data, fallback);
}

async function trpcPost<T>(procedure: string, body: JsonRecord, fallback: T): Promise<T> {
  const response = await managerFetch(`${API_BASE}/${procedure}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: body }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error?.message || `Failed to call ${procedure}`);
  return unwrapTrpc<T>(data, fallback);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// ─── Clients API ─────────────────────────────────────────────────────────────

export async function getAllClients(): Promise<Client[]> {
  return asArray<Client>(await trpcGet('clients.all', {}, []));
}

export async function getClientById(id: number): Promise<Client | null> {
  return await trpcGet<Client | null>('clients.byId', { id }, null);
}

export async function createClient(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: number }> {
  return await trpcPost('clients.create', client as unknown as JsonRecord, { id: 0 });
}

export async function updateClient(id: number, updates: Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  await trpcPost('clients.update', { id, ...(updates as JsonRecord) }, { success: true });
}

export async function deleteClient(id: number): Promise<void> {
  await trpcPost('clients.delete', { id }, { success: true });
}


export interface ClientPortalProfile {
  account: {
    id: number;
    clientId: number;
    ownerName: string;
    login: string;
    role: string;
    lastLoginAt?: string | null;
  };
  client: {
    id: number;
    name: string;
    address: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

export interface ClientPortalLoginResult extends ClientPortalProfile {
  token: string;
}

async function clientPortalJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem('clientPortalToken');
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message
      || data?.error
      || 'Ошибка клиентского кабинета',
    );
  }

  return data as T;
}

export async function loginClientPortal(
  login: string,
  password: string,
): Promise<ClientPortalLoginResult> {
  return await clientPortalJson<ClientPortalLoginResult>(
    '/api/client-portal/login',
    {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    },
  );
}

export async function getClientPortalProfile():
Promise<ClientPortalProfile> {
  return await clientPortalJson<ClientPortalProfile>(
    '/api/client-portal/me',
  );
}

export async function getClientPortalRequests():
Promise<Request[]> {
  return await clientPortalJson<Request[]>(
    '/api/client-portal/requests',
  );
}

export interface ClientPortalHemotestReconciliation {
  items: HemotestReconciliationItem[];
  tariffs: {
    pointPrice: number;
    sundayFirstPointPrice: number;
    sundayNextPointPrice: number;
  };
}

export async function getClientPortalHemotestReconciliation():
Promise<ClientPortalHemotestReconciliation> {
  return await clientPortalJson<ClientPortalHemotestReconciliation>(
    '/api/client-portal/hemotest-reconciliation',
  );
}

export interface ClientPortalAccount {
  id: number;
  clientId: number;
  ownerName: string;
  login: string;
  temporaryPassword?: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getClientPortalAccounts(clientId: number): Promise<ClientPortalAccount[]> {
  return await restJson<ClientPortalAccount[]>(`/api/manager/clients/${clientId}/portal-accounts`);
}

export async function createClientPortalAccount(clientId: number, input: {
  ownerName: string;
  login: string;
  password?: string;
  role?: string;
}): Promise<ClientPortalAccount> {
  return await restJson<ClientPortalAccount>(`/api/manager/clients/${clientId}/portal-accounts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function resetClientPortalAccountPassword(id: number): Promise<ClientPortalAccount> {
  return await restJson<ClientPortalAccount>(`/api/manager/client-portal-accounts/${id}/reset-password`, {
    method: 'POST',
  });
}

export async function setClientPortalAccountActive(id: number, isActive: boolean): Promise<ClientPortalAccount> {
  return await restJson<ClientPortalAccount>(`/api/manager/client-portal-accounts/${id}/active`, {
    method: 'PUT',
    body: JSON.stringify({ isActive }),
  });
}



export interface ClientPoint {
  id: number;
  clientId: number;
  name: string;
  address: string;
  contactPerson?: string | null;
  phone?: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientRegularClient {
  id: number;
  clientId: number;
  name: string;
  address: string;
  contactPerson?: string | null;
  phone?: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientTariffsDto {
  id?: number;
  clientId?: number;
  deliveryFirstPlace: number;
  deliveryNextPlace: number;
  transportCompanyFirstPlace: number;
  transportCompanyNextPlace: number;
  movementFirstPlace: number;
  movementNextPlace: number;
  otherFirstPlace: number;
  otherNextPlace: number;
  hemotestPointPrice: number;
  hemotestSundayFirstPointPrice: number;
  hemotestSundayNextPointPrice: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Partner {
  id: number;
  name: string;
  email?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  comment?: string | null;
  isActive: boolean;
  /** System flag: our own organisation, never an external counterparty. */
  isOwnCompany?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Requester ("Кто заказал вызов") — a partner or a correspondence client.
 * Read-only union of the two directories; independent from sender/recipient.
 */
export interface Requester {
  type: 'partner' | 'correspondenceClient';
  id: number;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
}

export interface TransportCompany {
  id: number;
  name: string;
  address: string;
  contactPerson?: string | null;
  phone?: string | null;
  comment?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

async function restJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await managerFetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Request failed: ${url}`);
  }

  return data as T;
}

export async function getClientPoints(clientId: number): Promise<ClientPoint[]> {
  return await restJson<ClientPoint[]>(`/api/manager/clients/${clientId}/points`);
}

export async function createClientPoint(clientId: number, point: Omit<ClientPoint, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>): Promise<ClientPoint> {
  return await restJson<ClientPoint>(`/api/manager/clients/${clientId}/points`, {
    method: 'POST',
    body: JSON.stringify(point),
  });
}

export async function updateClientPoint(id: number, point: Partial<ClientPoint>): Promise<ClientPoint> {
  return await restJson<ClientPoint>(`/api/manager/client-points/${id}`, {
    method: 'PUT',
    body: JSON.stringify(point),
  });
}

export async function deleteClientPoint(id: number): Promise<void> {
  await restJson<{ success: boolean }>(`/api/manager/client-points/${id}`, {
    method: 'DELETE',
  });
}

export async function getClientRegularClients(clientId: number): Promise<ClientRegularClient[]> {
  return await restJson<ClientRegularClient[]>(`/api/manager/clients/${clientId}/regular-clients`);
}

export async function createClientRegularClient(clientId: number, item: Omit<ClientRegularClient, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>): Promise<ClientRegularClient> {
  return await restJson<ClientRegularClient>(`/api/manager/clients/${clientId}/regular-clients`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function updateClientRegularClient(id: number, item: Partial<ClientRegularClient>): Promise<ClientRegularClient> {
  return await restJson<ClientRegularClient>(`/api/manager/regular-clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

export async function deleteClientRegularClient(id: number): Promise<void> {
  await restJson<{ success: boolean }>(`/api/manager/regular-clients/${id}`, {
    method: 'DELETE',
  });
}

export async function updateRequestDeliveryFee(
  requestId: number,
  deliveryFee: number | null,
): Promise<{ success: boolean; request: Request }> {
  return await restJson<{ success: boolean; request: Request }>(
    `/api/manager/requests/${requestId}/delivery-fee`,
    {
      method: 'PUT',
      body: JSON.stringify({ deliveryFee }),
    },
  );
}

export async function getClientTariffs(clientId: number): Promise<ClientTariffsDto> {
  return await restJson<ClientTariffsDto>(`/api/manager/clients/${clientId}/tariffs`);
}

export async function updateClientTariffs(clientId: number, tariffs: ClientTariffsDto): Promise<ClientTariffsDto> {
  return await restJson<ClientTariffsDto>(`/api/manager/clients/${clientId}/tariffs`, {
    method: 'PUT',
    body: JSON.stringify(tariffs),
  });
}

export interface HemotestReconciliationItem {
  date: string;
  pointId: number;
  pointName: string;
  address: string;
  courierId?: number | null;
  courierName?: string | null;
  pickedAt?: string | null;
}

export async function getHemotestReconciliation(): Promise<HemotestReconciliationItem[]> {
  return asArray<HemotestReconciliationItem>(
    await restJson<unknown>('/api/manager/hemotest/reconciliation')
  );
}

// ─── Partners API ───────────────────────────────────────────────────────────

export async function getPartners(): Promise<Partner[]> {
  return await restJson<Partner[]>('/api/manager/partners');
}

/**
 * Requester directory for "Кто заказал вызов": active external partners
 * (own organisation excluded server-side) + active correspondence clients.
 */
export async function getRequesters(): Promise<Requester[]> {
  const data = await restJson<{ items?: Requester[] }>('/api/manager/requesters');
  return Array.isArray(data?.items) ? data.items : [];
}

export async function createPartner(partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt'>): Promise<Partner> {
  return await restJson<Partner>('/api/manager/partners', {
    method: 'POST',
    body: JSON.stringify(partner),
  });
}

export async function updatePartner(id: number, partner: Partial<Partner>): Promise<Partner> {
  return await restJson<Partner>(`/api/manager/partners/${id}`, {
    method: 'PUT',
    body: JSON.stringify(partner),
  });
}

export async function deletePartner(id: number): Promise<void> {
  await restJson<{ success: boolean }>(`/api/manager/partners/${id}`, {
    method: 'DELETE',
  });
}

// ─── Transport Companies API ────────────────────────────────────────────────

export async function getTransportCompanies(): Promise<TransportCompany[]> {
  return await restJson<TransportCompany[]>('/api/manager/transport-companies');
}

export async function createTransportCompany(company: Omit<TransportCompany, 'id' | 'createdAt' | 'updatedAt'>): Promise<TransportCompany> {
  return await restJson<TransportCompany>('/api/manager/transport-companies', {
    method: 'POST',
    body: JSON.stringify(company),
  });
}

export async function updateTransportCompany(id: number, company: Partial<TransportCompany>): Promise<TransportCompany> {
  return await restJson<TransportCompany>(`/api/manager/transport-companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(company),
  });
}

export async function deleteTransportCompany(id: number): Promise<void> {
  await restJson<{ success: boolean }>(`/api/manager/transport-companies/${id}`, {
    method: 'DELETE',
  });
}

// ─── Tasks API ──────────────────────────────────────────────────────────────

export async function getAllTasks(): Promise<Task[]> {
  return asArray<Task>(await trpcGet('managerTasks.all', {}, []));
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: number; success?: boolean }> {
  return await trpcPost('managerTasks.create', task as unknown as JsonRecord, { id: 0, success: false });
}

export async function updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  await trpcPost('managerTasks.updateStatus', { id, ...(updates as JsonRecord) }, { success: true });
}

export async function updateTaskStatus(id: number, status: string): Promise<void> {
  await trpcPost('managerTasks.updateStatus', { id, status }, { success: true });
}

export async function assignTaskCourier(taskId: number, courierId: number | null): Promise<void> {
  await trpcPost('managerTasks.assignCourier', { taskId, courierId }, { success: true });
}

// ─── Hemotest API ───────────────────────────────────────────────────────────

export interface HemotestPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
  /** False for archived directory points (kept for history, hidden from selection). */
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getAllHemotestPoints(): Promise<HemotestPoint[]> {
  return asArray<HemotestPoint>(await trpcGet('hemotest.points', {}, []));
}

export async function createHemotestPoint(point: Omit<HemotestPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<HemotestPoint> {
  return await trpcPost('hemotest.create', point as unknown as JsonRecord, {} as HemotestPoint);
}

/** Archive a Hemotest directory point (history is preserved). */
export async function deleteHemotestPoint(id: number): Promise<void> {
  await trpcPost('hemotest.deletePoint', { id }, { success: true });
}

// ─── Sberbank API ───────────────────────────────────────────────────────────

export interface SberbankPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
  /** False for archived directory points (kept for history, hidden from selection). */
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getAllSberbankPoints(): Promise<SberbankPoint[]> {
  return asArray<SberbankPoint>(await trpcGet('sberbank.points', {}, []));
}

export async function createSberbankPoint(point: Omit<SberbankPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<SberbankPoint> {
  return await trpcPost('sberbank.create', point as unknown as JsonRecord, {} as SberbankPoint);
}

/** Archive a Sberbank directory point (history is preserved). */
export async function deleteSberbankPoint(id: number): Promise<void> {
  await trpcPost('sberbank.deletePoint', { id }, { success: true });
}

export async function getSberbankScheduleForDay(dayOfWeek: number): Promise<SberbankPoint[]> {
  return asArray<SberbankPoint>(await trpcGet('sberbank.scheduleForDay', { dayOfWeek }, []));
}

export async function setSberbankScheduleForDay(dayOfWeek: number, pointIds: number[]): Promise<void> {
  await trpcPost('sberbank.setScheduleForDay', { dayOfWeek, pointIds }, { success: true });
}

// ─── Hemotest List Management ───────────────────────────────────────────────

export interface HemotestPickupList {
  id: number;
  date: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HemotestListWithItems {
  list: HemotestPickupList;
  items: HemotestPoint[];
}

export async function createHemotestPickupList(date: string, name: string, pointIds: number[]): Promise<HemotestPickupList> {
  return await trpcPost('hemotest.createList', { date, name, pointIds }, {} as HemotestPickupList);
}

export async function getHemotestListsForDate(date: string): Promise<HemotestPickupList[]> {
  return asArray<HemotestPickupList>(await trpcGet('hemotest.listsForDate', { date }, []));
}

export async function getHemotestList(listId: number): Promise<HemotestListWithItems | null> {
  return await trpcGet<HemotestListWithItems | null>('hemotest.getList', { listId }, null);
}

export async function addPointToHemotestList(listId: number, pointId: number): Promise<void> {
  await trpcPost('hemotest.addPointToList', { listId, pointId }, { success: true });
}

export async function removePointFromHemotestList(listId: number, pointId: number): Promise<void> {
  await trpcPost('hemotest.removePointFromList', { listId, pointId }, { success: true });
}

export async function createOrAppendHemotestPickupList(date: string, name: string, pointIds: number[]): Promise<HemotestPickupList> {
  const existingLists = await getHemotestListsForDate(date);
  const existingList = existingLists[0];

  if (existingList) {
    const fullList = await getHemotestList(existingList.id);
    const existingPointIds = new Set((fullList?.items ?? []).map((point) => point.id));
    const missingPointIds = pointIds.filter((pointId) => !existingPointIds.has(pointId));

    for (const pointId of missingPointIds) {
      await addPointToHemotestList(existingList.id, pointId);
    }
    return existingList;
  }

  return await createHemotestPickupList(date, name, pointIds);
}

// ─── Sberbank List Management ───────────────────────────────────────────────

export interface SberbankPickupList {
  id: number;
  dayOfWeek: number;
  date: string | null;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SberbankListWithItems {
  list: SberbankPickupList;
  items: SberbankPoint[];
}

function getSberbankBusinessDay(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return 1;

  const jsDay = new Date(year, month - 1, day).getDay();
  if (jsDay === 0 || jsDay === 6) return 5;

  return jsDay;
}

export async function createSberbankPickupList(
  dayOfWeekOrDate: number | string,
  dateOrName: string,
  nameOrPointIds: string | number[],
  pointIdsArg?: number[],
): Promise<SberbankPickupList> {
  const isNewSignature = typeof dayOfWeekOrDate === 'number';

  const dayOfWeek = isNewSignature
    ? dayOfWeekOrDate
    : getSberbankBusinessDay(dayOfWeekOrDate);

  const date = isNewSignature
    ? dateOrName
    : dayOfWeekOrDate;

  const name = isNewSignature
    ? String(nameOrPointIds)
    : dateOrName;

  const pointIds = isNewSignature
    ? (pointIdsArg || [])
    : (Array.isArray(nameOrPointIds) ? nameOrPointIds : []);

  return await trpcPost('sberbank.createList', { dayOfWeek, date, name, pointIds }, {} as SberbankPickupList);
}

export async function getSberbankListsForDate(date: string): Promise<SberbankPickupList[]> {
  return asArray<SberbankPickupList>(await trpcGet('sberbank.listsForDate', { date }, []));
}

export async function getSberbankListsForDay(dayOfWeek: number): Promise<SberbankPickupList[]> {
  return asArray<SberbankPickupList>(await trpcGet('sberbank.listsForDay', { dayOfWeek }, []));
}

export async function getSberbankList(listId: number): Promise<SberbankListWithItems | null> {
  return await trpcGet<SberbankListWithItems | null>('sberbank.getList', { listId }, null);
}

export async function addPointToSberbankList(listId: number, pointId: number): Promise<void> {
  await trpcPost('sberbank.addPointToList', { listId, pointId }, { success: true });
}

export async function removePointFromSberbankList(listId: number, pointId: number): Promise<void> {
  await trpcPost('sberbank.removePointFromList', { listId, pointId }, { success: true });
}

export async function createOrAppendSberbankPickupList(
  dayOfWeek: number,
  date: string,
  name: string,
  pointIds: number[],
): Promise<SberbankPickupList> {
  const existingLists = await getSberbankListsForDate(date);
  const existingList = existingLists[0];

  if (existingList) {
    const fullList = await getSberbankList(existingList.id);
    const existingPointIds = new Set((fullList?.items ?? []).map((point) => point.id));
    const missingPointIds = pointIds.filter((pointId) => !existingPointIds.has(pointId));

    for (const pointId of missingPointIds) {
      await addPointToSberbankList(existingList.id, pointId);
    }
    return existingList;
  }

  return await createSberbankPickupList(dayOfWeek, date, name, pointIds);
}

// ─── Mails API ─────────────────────────────────────────────────────────────

export type MailStatus = 'not_delivered' | 'delivered';

export interface Mail {
  id: number;
  waybillNumber: string;
  recipientName: string | null;
  recipientPhone?: string;
  deliveryAddress: string;
  status: MailStatus;
  createdAt: string;
  updatedAt?: string;
  deliveredAt?: string | null;
  recipientSignature?: string | null;
  courierId?: number | null;
  courierName?: string | null;
  partnerId?: number | null;
  weight?: string | null;
  billingCheckedAt?: string | null;
  billingCheckedByManagerId?: number | null;
}

export async function getAllMails(filters?: {
  status?: 'all' | MailStatus;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Mail[]> {
  return asArray<Mail>(await trpcGet('managerMails.all', {
    status: filters?.status === 'all' ? undefined : filters?.status,
    dateFrom: filters?.dateFrom,
    dateTo: filters?.dateTo,
  }, []));
}

export async function createMail(mail: Omit<Mail, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'deliveredAt' | 'courierId' | 'courierName'>): Promise<Mail> {
  return await trpcPost('managerMails.create', mail as unknown as JsonRecord, {} as Mail);
}

export async function bulkCreateMails(mails: Array<Omit<Mail, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'deliveredAt' | 'courierId' | 'courierName'>>): Promise<{ created: number; skipped: number; errors: string[] }> {
  return await trpcPost('managerMails.bulkCreate', { mails }, { created: 0, skipped: 0, errors: [] });
}

export async function setMailBillingChecked(
  mailId: number,
  checked: boolean,
): Promise<void> {
  await trpcPost(
    'managerMails.setChecked',
    { mailId, checked },
    { success: true },
  );
}

export async function markMailDeliveredByManager(
  mailId: number,
  recipientSignature: string,
  deliveredAt: string,
): Promise<void> {
  await trpcPost(
    'managerMails.deliver',
    { mailId, recipientSignature, deliveredAt },
    { success: true },
  );
}

export async function undoMailDeliveryByManager(mailId: number): Promise<void> {
  await trpcPost(
    'managerMails.undoDelivery',
    { mailId },
    { success: true },
  );
}

// ─── Requests API (multi-type requests) ─────────────────────────────────────

export interface Request {
  id: number;
  requestType: 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  clientId?: number;
  courierId?: number;
  courierName?: string | null;
  recipientName: string;
  recipientPhone: string;
  recipientAddress?: string;
  recipientCompany?: string;
  recipientCity?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  packageDescription?: string;
  packageType?: string;
  placesCount?: number;
  senderName?: string;
  senderCompany?: string;
  senderCity?: string;
  senderAddress?: string;
  senderPhone?: string;
  items?: string;
  callReason?: string;
  /** Who ordered the courier call; null for legacy rows. */
  requesterType?: 'partner' | 'correspondenceClient' | null;
  requesterId?: number | null;
  requesterNameSnapshot?: string | null;
  tcName?: string;
  tcAddress?: string;
  trackingNumber?: string;
  description?: string;
  specialInstructions?: string;
  comments?: string;
  paymentMethod?: 'paid' | 'transfer' | 'cash' | 'terminal' | 'qr';
  paymentAmount?: number;
  deliveryFee?: string | number | null;
  /** When the amount was produced by the automatic server-side quote. */
  quoteCalculatedAt?: string | null;
  /** 'tariff' for an automatic amount, 'manual_fee' for a manager correction. */
  quoteSource?: 'tariff' | 'manual_fee' | null;
  billingCheckedAt?: string | null;
  billingCheckedByManagerId?: number | null;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  estimatedMinutes?: number;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function post(endpoint: string, data: any): Promise<any> {
  const response = await managerFetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Failed to POST ${endpoint}`);
  return payload;
}

export async function createRequest(request: Omit<Request, 'id' | 'updatedAt' | 'status'>): Promise<{ id: number; taskId?: number; success: boolean }> {
  return await trpcPost('requests.create', request as unknown as JsonRecord, { id: 0, success: false });
}

export async function getAllRequests(): Promise<Request[]> {
  return asArray<Request>(await trpcGet('requests.all', {}, []));
}

export async function getRequestById(id: number): Promise<Request | null> {
  const requests = await getAllRequests();
  return requests.find((request) => request.id === id) ?? null;
}

export async function updateRequestStatus(id: number, status: Request['status']): Promise<void> {
  await trpcPost('requests.updateStatus', { id, status }, { success: true });
}

export async function updateRequestClient(id: number, clientId: number | null): Promise<void> {
  await trpcPost('requests.updateClient', { id, clientId }, { success: true });
}

// ─── Billing API ─────────────────────────────────────────────────────────────

/** UI state of one request inside the billing review. */
export type BillingRequestState =
  | 'billed'
  | 'unpriced'
  | 'ready'
  | 'checked'
  | 'decision_needed'
  | 'decided_not_billable'
  | 'decided_completed'
  | 'clarification';

export type BillingReviewState =
  | 'cancelled_confirmed'
  | 'completed_confirmed'
  | 'requires_clarification'
  | 'not_billable';

export type BillingReviewAction =
  | 'confirm_cancelled'
  | 'mark_completed'
  | 'requires_clarification'
  | 'not_billable'
  | 'reset';

export interface BillingReviewRequest extends Request {
  /** Server-computed review state of the request. */
  billingState: BillingRequestState;
  billingIssue?: string | null;
  /** True when the period cannot be billed until this request is resolved. */
  billingBlocking?: boolean;
  reviewState?: BillingReviewState | null;
  reviewStateLabel?: string | null;
  reviewNote?: string | null;
  statusLabel?: string;
  tariffCategory?: string;
}

export interface BillingCounts {
  total: number;
  completed: number;
  unfinished: number;
  cancelled: number;
  checked: number;
  ready: number;
  unpriced: number;
  billed: number;
  decisionNeeded: number;
  clarification: number;
  notBillable: number;
}

export interface BillingReadiness {
  ready: boolean;
  blockers: string[];
  executorGaps: { field: string; label: string }[];
  clientGaps: { field: string; label: string }[];
  unresolved: { requestId: number; reason: string }[];
}

export interface BillingPaymentProof {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BillingDocumentRow {
  id: number;
  number: string;
  documentDate: string;
  documentDateText?: string | null;
  clientId: number;
  clientName: string;
  periodFrom: string;
  periodTo: string;
  requestsCount: number;
  totalAmount: number;
  status: 'issued' | 'paid' | 'cancelled';
  vatText?: string | null;
  invoiceFile?: string | null;
  actFile?: string | null;
  registryFile?: string | null;
  paidAt?: string | null;
  paidByManagerId?: number | null;
  paymentComment?: string | null;
  paymentProofs?: BillingPaymentProof[];
  voidedAt?: string | null;
  voidReason?: string | null;
  /** Annulled document this set replaced, if any. */
  replacesDocumentId?: number | null;
  /** True when an annulled document no longer holds its requests. */
  requestsReleased?: boolean;
  /** How many links still hold their requests. */
  activeRequestsCount?: number;
  createdAt: string;
}

export interface BillingOverview {
  requests: BillingReviewRequest[];
  counts: BillingCounts;
  /** Sum of verified requests: what the document set will contain. */
  checkedAmount: number;
  /** Sum of completed requests that already have a price. */
  readyAmount: number;
  billedAmount: number;
  readiness: BillingReadiness;
  documents: BillingDocumentRow[];
}

export interface DocumentPreview {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  number: string;
  documentDateIso: string;
  documentDateText: string;
  clientName: string;
  periodFrom: string;
  periodTo: string;
  periodText: string;
  requestsCount: number;
  totalPlaces: number;
  totalAmount: number;
  totalAmountText: string;
  amountInWords: string;
  vatRateText: string;
  lines: { name: string; quantity: number; price: number; amount: number }[];
  /** Requests that an active document still holds; must be released to re-issue. */
  blockedRequestIds?: number[];
  blockingDocuments?: { documentId: number; number: string; status: string; documentDate: string | null }[];
}

/** One lifecycle event of a document set (append-only audit trail). */
export interface BillingDocumentHistoryEntry {
  id: number;
  kind: 'issued' | 'reissued' | 'voided' | 'requests_released' | 'replaced_by' | 'payment_set' | 'payment_cleared';
  managerId: number | null;
  managerName: string | null;
  note: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReleaseDocumentResult {
  ok: boolean;
  reason?: string;
  documentId?: number;
  releasedRequestIds?: number[];
}

export interface IssueDocumentResult {
  ok: boolean;
  reason?: string;
  document?: {
    id: number;
    number: string;
    documentDateText: string;
    clientName: string;
    requestsCount: number;
    totalAmount: number;
    invoiceFile: string;
    actFile: string;
    registryFile: string;
  };
}

export interface DocumentSettingsDto {
  executorName: string | null;
  executorShortName: string | null;
  executorInn: string | null;
  executorKpp: string | null;
  executorOgrn: string | null;
  executorOgrnip: string | null;
  executorAddress: string | null;
  executorPostalAddress: string | null;
  executorPhone: string | null;
  executorEmail: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  bankCorrespondentAccount: string | null;
  vatMode: string;
  vatRate: number;
  vatText: string;
  vatExemptionBasis: string | null;
  directorName: string | null;
  directorPosition: string | null;
  accountantName: string | null;
  signatureFile: string | null;
  stampFile: string | null;
  documentNumberPrefix: string | null;
  nextDocumentNumber: number;
}

const EMPTY_BILLING_COUNTS: BillingCounts = {
  total: 0, completed: 0, unfinished: 0, cancelled: 0,
  checked: 0, ready: 0, unpriced: 0, billed: 0,
  decisionNeeded: 0, clarification: 0, notBillable: 0,
};

/**
 * Review workspace for one client and period. The server returns every request of
 * the period (completed, cancelled and unfinished), the manager decisions already
 * taken, and exactly why the period is not ready for documents.
 */
export async function getBillingOverview(
  clientId: number,
  dateFrom: string,
  dateTo: string,
): Promise<BillingOverview> {
  return await trpcGet<BillingOverview>(
    'billing.overview',
    { clientId, dateFrom, dateTo },
    {
      requests: [],
      counts: { ...EMPTY_BILLING_COUNTS },
      checkedAmount: 0,
      readyAmount: 0,
      billedAmount: 0,
      readiness: { ready: false, blockers: [], executorGaps: [], clientGaps: [], unresolved: [] },
      documents: [],
    },
  );
}

/** Recalculate the automatic prices of one client (and optionally one period). */
export async function recalcClientQuotes(
  clientId: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ calculated: number; unresolved: number; skipped: number }> {
  return await trpcPost(
    'billing.recalcClient',
    { clientId, dateFrom, dateTo },
    { calculated: 0, unresolved: 0, skipped: 0 },
  );
}

/** Recalculate one request with the current tariff. */
export async function recalcRequestQuote(requestId: number): Promise<{
  status: 'calculated' | 'skipped' | 'unresolved';
  amount?: number;
  reason?: string;
  preserved?: string;
}> {
  return await trpcPost('billing.recalcRequest', { requestId }, { status: 'skipped' });
}

/** Record the manager's decision about a cancelled or unfinished request. */
export async function setBillingReviewDecision(
  requestId: number,
  action: BillingReviewAction,
  note?: string,
): Promise<void> {
  await trpcPost('billing.reviewDecision', { requestId, action, note }, { success: true });
}

/** Preview of the document set: number, date, client, period, count, total, blockers. */
export async function getDocumentPreview(
  clientId: number,
  dateFrom: string,
  dateTo: string,
  documentDate?: string,
): Promise<DocumentPreview | null> {
  return await trpcGet<DocumentPreview | null>(
    'billing.previewSet',
    { clientId, dateFrom, dateTo, documentDate },
    null,
  );
}

/** Issue the document set (invoice + act + registry) for the period. */
export async function issueDocumentSet(
  clientId: number,
  dateFrom: string,
  dateTo: string,
  documentDate?: string,
  replacesDocumentId?: number,
): Promise<IssueDocumentResult> {
  return await trpcPost(
    'billing.issueSet',
    { clientId, dateFrom, dateTo, documentDate, replacesDocumentId },
    { ok: false, reason: 'Сервер не ответил' },
  );
}

/**
 * Release the requests of an annulled document so they can be re-issued.
 * The old document and its composition stay in history.
 */
export async function releaseBillingDocument(
  documentId: number,
  note?: string,
): Promise<ReleaseDocumentResult> {
  return await trpcPost(
    'billing.releaseDocument',
    { documentId, note },
    { ok: false, reason: 'Сервер не ответил' },
  );
}

/** Audit trail of one document. */
export async function getBillingDocumentHistory(
  documentId: number,
): Promise<BillingDocumentHistoryEntry[]> {
  return await trpcGet<BillingDocumentHistoryEntry[]>('billing.documentHistory', { documentId }, []);
}

/** Issued document sets, newest first. */
export async function getBillingDocuments(clientId?: number): Promise<BillingDocumentRow[]> {
  return await trpcGet<BillingDocumentRow[]>('billing.documents', clientId ? { clientId } : {}, []);
}

/** Mark a document as paid (or take the mark back). */
export async function setBillingDocumentPaid(
  documentId: number,
  paid: boolean,
  comment?: string,
): Promise<void> {
  await trpcPost('billing.setPaid', { documentId, paid, comment }, { success: true });
}

/** Annul a document with a reason (never a silent delete). */
export async function voidBillingDocument(documentId: number, reason: string): Promise<void> {
  await trpcPost('billing.voidDocument', { documentId, reason }, { success: true });
}

export async function removeBillingDocumentFile(fileId: number): Promise<void> {
  await trpcPost('billing.removeDocumentFile', { fileId }, { success: true });
}

// ─── Document settings (our own requisites) ──────────────────────────────────

export async function getDocumentSettings(): Promise<DocumentSettingsDto | null> {
  return await restJson<DocumentSettingsDto | null>('/api/manager/billing/settings');
}

export async function saveDocumentSettings(
  payload: Partial<DocumentSettingsDto>,
): Promise<DocumentSettingsDto> {
  return await restJson<DocumentSettingsDto>('/api/manager/billing/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** Upload the optional signature or stamp image used on the printed documents. */
export async function uploadDocumentSettingsImage(
  kind: 'signature' | 'stamp',
  file: File,
): Promise<DocumentSettingsDto> {
  const response = await managerFetch(`/api/manager/billing/settings/image/${kind}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить изображение');
  return payload as DocumentSettingsDto;
}

/** Attach a payment confirmation (PDF/JPG/PNG) to an issued document. */
export async function uploadPaymentProof(
  documentId: number,
  file: File,
): Promise<BillingPaymentProof> {
  const response = await managerFetch(`/api/manager/billing/documents/${documentId}/payment-proof`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить подтверждение оплаты');
  return payload as BillingPaymentProof;
}

/** URL of a generated set file, for opening or downloading it. */
export function billingDocumentFileUrl(documentId: number, kind: 'invoice' | 'act' | 'registry'): string {
  return `/api/manager/billing/documents/${documentId}/file/${kind}`;
}

/** URL of an on-the-fly preview, which never reserves a number. */
export function billingPreviewUrl(
  clientId: number,
  dateFrom: string,
  dateTo: string,
  kind: 'invoice' | 'act' | 'registry',
  documentDate?: string,
): string {
  const params = new URLSearchParams({ clientId: String(clientId), dateFrom, dateTo, kind });
  if (documentDate) params.set('documentDate', documentDate);
  return `/api/manager/billing/documents/preview?${params.toString()}`;
}

/** URL of an attached payment confirmation. */
export function billingDocumentProofUrl(file: BillingPaymentProof): string {
  return `/api/manager/billing-document-files/${file.id}/${encodeURIComponent((file as unknown as { storedName?: string }).storedName ?? '')}`;
}

export async function getBillingReviewRequests(
  clientId: number,
  dateFrom: string,
  dateTo: string,
): Promise<Request[]> {
  return await trpcGet<Request[]>(
    'billing.reviewList',
    { clientId, dateFrom, dateTo },
    [],
  );
}

export async function setBillingChecked(
  requestId: number,
  checked: boolean,
): Promise<void> {
  await trpcPost(
    'billing.setChecked',
    { requestId, checked },
    { success: true },
  );
}

export async function updateBillingReviewFields(
  requestId: number,
  fields: {
    deliveryFee?: number;
    comments?: string;
  },
): Promise<void> {
  await trpcPost(
    'billing.updateReviewFields',
    { requestId, ...fields },
    { success: true },
  );
}

export interface RequestAttachment {
  id: number;
  requestId: number;
  originalName: string;
  storedName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes: number;
  createdAt: string;
}

export async function getRequestAttachments(requestId: number): Promise<RequestAttachment[]> {
  return await restJson<RequestAttachment[]>(`/api/manager/requests/${requestId}/attachments`);
}

export async function uploadRequestAttachment(requestId: number, file: File): Promise<RequestAttachment> {
  const response = await managerFetch(`/api/manager/requests/${requestId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'file'),
      'X-File-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || 'Failed to upload request attachment');
  }

  return data as RequestAttachment;
}

export async function deleteRequestAttachment(id: number): Promise<void> {
  await restJson<{ success: boolean }>(`/api/manager/request-attachments/${id}`, {
    method: 'DELETE',
  });
}

export async function assignRequestCourier(id: number, courierId: number | null): Promise<void> {
  await trpcPost('requests.assignCourier', { id, courierId }, { success: true });
}

export async function getRealtimeSnapshot(): Promise<RealtimeSnapshot> {
  const response = await managerFetch('/api/realtime/manager', {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await readJson(response);
  if (!response.ok || data?.ok === false) throw new Error(data?.error || data?.error?.message || 'Failed to fetch realtime snapshot');
  return {
    ok: true,
    updatedAt: data.updatedAt || new Date().toISOString(),
    tasks: asArray<Task>(data.tasks),
    requests: asArray<Request>(data.requests),
    mails: asArray<Mail>(data.mails),
  };
}


// ─── Chat V2 API ────────────────────────────────────────────────────────────

export type ChatV2ActorType = 'manager' | 'courier';

export interface ChatV2Actor {
  type: ChatV2ActorType;
  id: number;
  name: string;
}

export interface ChatV2Contacts {
  me: ChatV2Actor;
  managers: ChatV2Actor[];
  couriers: ChatV2Actor[];
}

export interface ChatV2Conversation {
  id: number;
  kind: 'general' | 'direct';
  title: string;
  slug?: string | null;
  updatedAt: string;
  lastReadMessageId?: number | null;
  lastReadAt?: string | null;
  lastMessageId?: number | null;
  lastMessageSenderName?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
}

export interface ChatV2Message {
  id: number;
  conversationId: number;
  senderType: ChatV2ActorType;
  senderId: number | null;
  senderName: string;
  clientMessageId?: string | null;
  text: string;
  replyToMessageId?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredCount: number;
  readCount: number;
  reactions: ChatV2Reaction[];
}

export interface ChatV2Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatV2MessagePage {
  messages: ChatV2Message[];
  nextCursor: number | null;
}

export async function getChatV2Contacts(): Promise<ChatV2Contacts> {
  return await restJson<ChatV2Contacts>('/api/chat/v2/contacts');
}

export async function getChatV2Conversations(): Promise<ChatV2Conversation[]> {
  return await restJson<ChatV2Conversation[]>('/api/chat/v2/conversations');
}

export async function createChatV2DirectConversation(target: ChatV2Actor): Promise<{ id: number; created: boolean }> {
  return await restJson('/api/chat/v2/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ targetType: target.type, targetId: target.id }),
  });
}

export async function getChatV2Messages(
  conversationId: number,
  options: { before?: number | null; limit?: number } = {},
): Promise<ChatV2MessagePage> {
  const params = new URLSearchParams({ limit: String(options.limit || 50) });
  if (options.before) params.set('before', String(options.before));
  return await restJson<ChatV2MessagePage>(`/api/chat/v2/conversations/${conversationId}/messages?${params}`);
}

export async function sendChatV2Message(
  conversationId: number,
  input: { text: string; clientMessageId: string; replyToMessageId?: number | null },
): Promise<ChatV2Message> {
  return await restJson<ChatV2Message>(`/api/chat/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function markChatV2ConversationRead(conversationId: number): Promise<void> {
  await restJson(`/api/chat/v2/conversations/${conversationId}/read`, { method: 'POST' });
}

export async function updateChatV2Message(messageId: number, text: string): Promise<ChatV2Message> {
  return await restJson<ChatV2Message>(`/api/chat/v2/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  });
}

export async function deleteChatV2Message(messageId: number): Promise<void> {
  await restJson(`/api/chat/v2/messages/${messageId}`, { method: 'DELETE' });
}

export async function toggleChatV2MessageReaction(messageId: number, emoji: string): Promise<ChatV2Message> {
  return await restJson<ChatV2Message>(`/api/chat/v2/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// Legacy exports stay temporarily while the released manager bundle is being
// replaced by ManagerChatPanel V2. They can be removed after the rollout.
export interface ChatMessage {
  id: number;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: string;
}

export async function getChatMessages(limit = 80): Promise<ChatMessage[]> {
  return await restJson<ChatMessage[]>(`/api/manager/chat/messages?limit=${limit}`);
}

export async function sendChatMessage(input: {
  text: string;
  senderName: string;
  senderRole?: string;
}): Promise<ChatMessage> {
  return await restJson<ChatMessage>('/api/manager/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      text: input.text,
      senderName: input.senderName,
      senderRole: input.senderRole || 'manager',
    }),
  });
}

// ─── PDF Extraction ─────────────────────────────────────────────────────────

export interface ExtractedWaybillData {
  senderName: string;
  senderCompany: string;
  senderPhone: string;
  senderCity: string;
  senderAddress: string;
  recipientName: string;
  recipientCompany: string;
  recipientPhone: string;
  recipientCity: string;
  recipientAddress: string;
  deliveryAddress: string;
}

export async function extractFromPdf(pdfBase64: string, fileName: string): Promise<ExtractedWaybillData> {
  return await trpcPost('requests.extractFromPdf', { pdfBase64, fileName }, {} as ExtractedWaybillData);
}

// ─── AI Text Parsing ────────────────────────────────────────────────────────
export interface ParsedRequestData {
  requestType?: string | null;
  clientName?: string | null;
  courierName?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  recipientAddress?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  senderAddress?: string | null;
  packageDescription?: string | null;
  specialInstructions?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: string | number | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  comment?: string | null;
}

export async function parseRequestWithAI(text: string): Promise<{ success: boolean; data?: ParsedRequestData }> {
  const data = await trpcPost<ParsedRequestData>('ai.parseRequest', { text }, {} as ParsedRequestData);
  return { success: true, data };
}


export async function resetCourierPassword(courierId: number): Promise<{ success: boolean; password: string }> {
  return await restJson<{ success: boolean; password: string }>(`/api/manager/couriers/${courierId}/reset-password`, {
    method: 'POST',
  });
}

// ─── Request Activity API ────────────────────────────────────────────────────

export type RequestActivityAction =
  | 'created'
  | 'updated'
  | 'courier_assigned'
  | 'courier_unassigned'
  | 'status_changed'
  | 'started'
  | 'completed'
  | 'cancelled';

export interface RequestActivity {
  id: number;
  requestId: number;
  actorType: 'manager' | 'courier' | 'system';
  actorId?: number | null;
  actorName?: string | null;
  action: RequestActivityAction;
  note?: string | null;
  changes?: string | null;
  createdAt: string;
}

export async function getRequestActivity(
  requestId: number,
): Promise<RequestActivity[]> {
  return asArray<RequestActivity>(
    await trpcGet('requests.activity', { id: requestId }, []),
  );
}
