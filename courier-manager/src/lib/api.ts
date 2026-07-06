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
  createdAt?: string;
  updatedAt?: string;
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
  createdAt: string;
  updatedAt: string;
}

export async function getAllHemotestPoints(): Promise<HemotestPoint[]> {
  return asArray<HemotestPoint>(await trpcGet('hemotest.points', {}, []));
}

export async function createHemotestPoint(point: Omit<HemotestPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<HemotestPoint> {
  return await trpcPost('hemotest.create', point as unknown as JsonRecord, {} as HemotestPoint);
}

// ─── Sberbank API ───────────────────────────────────────────────────────────

export interface SberbankPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getAllSberbankPoints(): Promise<SberbankPoint[]> {
  return asArray<SberbankPoint>(await trpcGet('sberbank.points', {}, []));
}

export async function createSberbankPoint(point: Omit<SberbankPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<SberbankPoint> {
  return await trpcPost('sberbank.create', point as unknown as JsonRecord, {} as SberbankPoint);
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
  tcName?: string;
  tcAddress?: string;
  trackingNumber?: string;
  description?: string;
  specialInstructions?: string;
  comments?: string;
  paymentMethod?: 'paid' | 'transfer' | 'cash' | 'terminal' | 'qr';
  paymentAmount?: number;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  estimatedMinutes?: number;
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


// ─── Manager Chat API ───────────────────────────────────────────────────────

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
