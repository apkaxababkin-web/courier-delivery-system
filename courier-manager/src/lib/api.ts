const API_BASE = 'http://localhost:3001/api/trpc';

interface Client {
  id: number;
  name: string;
  address: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: number;
  status: string;
  taskType: string;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  senderName?: string;
  senderAddress?: string;
  senderPhone?: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  packageDescription?: string;
  specialInstructions?: string;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Clients API ─────────────────────────────────────────────────────────────

export async function getAllClients(): Promise<Client[]> {
  const response = await fetch(`${API_BASE}/clients.all?input={}`);
  if (!response.ok) throw new Error('Failed to fetch clients');
  const data = await response.json();
  return data.result?.data?.json || [];
}

export async function getClientById(id: number): Promise<Client | null> {
  const response = await fetch(`${API_BASE}/clients.byId?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  if (!response.ok) throw new Error('Failed to fetch client');
  const data = await response.json();
  return data.result?.data?.json || null;
}

export async function createClient(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: number }> {
  const response = await fetch(`${API_BASE}/clients.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: client }),
  });
  if (!response.ok) throw new Error('Failed to create client');
  const data = await response.json();
  return data.result?.data || { id: 0 };
}

export async function updateClient(id: number, updates: Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const response = await fetch(`${API_BASE}/clients.update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { id, ...updates } }),
  });
  if (!response.ok) throw new Error('Failed to update client');
}

export async function deleteClient(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/clients.delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { id } }),
  });
  if (!response.ok) throw new Error('Failed to delete client');
}

// ─── Tasks API ──────────────────────────────────────────────────────────────

export async function getAllTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE}/tasks.all`);
  if (!response.ok) throw new Error('Failed to fetch tasks');
  const data = await response.json();
  return data.result || [];
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: number }> {
  const response = await fetch(`${API_BASE}/tasks.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  if (!response.ok) throw new Error('Failed to create task');
  const data = await response.json();
  return data.result;
}

export async function updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks.update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!response.ok) throw new Error('Failed to update task');
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
  const response = await fetch(`${API_BASE}/hemotest.points?input={}`);
  if (!response.ok) throw new Error('Failed to fetch hemotest points');
  const data = await response.json();
  const points = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(points) ? points : [];
}

export async function createHemotestPoint(point: Omit<HemotestPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<HemotestPoint> {
  const response = await fetch(`${API_BASE}/hemotest.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: point }),
  });
  if (!response.ok) throw new Error('Failed to create hemotest point');
  const data = await response.json();
  return data.result?.data;
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
  const response = await fetch(`${API_BASE}/sberbank.points?input={}`);
  if (!response.ok) throw new Error('Failed to fetch sberbank points');
  const data = await response.json();
  const points = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(points) ? points : [];
}

export async function createSberbankPoint(point: Omit<SberbankPoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<SberbankPoint> {
  const response = await fetch(`${API_BASE}/sberbank.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: point }),
  });
  if (!response.ok) throw new Error('Failed to create sberbank point');
  const data = await response.json();
  return data.result?.data;
}

export async function getSberbankScheduleForDay(dayOfWeek: number): Promise<SberbankPoint[]> {
  const response = await fetch(`${API_BASE}/sberbank.scheduleForDay?input=${encodeURIComponent(JSON.stringify({ dayOfWeek }))}`);
  if (!response.ok) throw new Error('Failed to fetch sberbank schedule');
  const data = await response.json();
  const points = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(points) ? points : [];
}

export async function setSberbankScheduleForDay(dayOfWeek: number, pointIds: number[]): Promise<void> {
  const response = await fetch(`${API_BASE}/sberbank.setScheduleForDay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { dayOfWeek, pointIds } }),
  });
  if (!response.ok) throw new Error('Failed to set sberbank schedule');
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
  const response = await fetch(`${API_BASE}/hemotest.createList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { date, name, pointIds } }),
  });
  if (!response.ok) throw new Error('Failed to create hemotest list');
  const data = await response.json();
  return data.result?.data;
}

export async function getHemotestListsForDate(date: string): Promise<HemotestPickupList[]> {
  const response = await fetch(`${API_BASE}/hemotest.listsForDate?input=${encodeURIComponent(JSON.stringify({ date }))}`);
  if (!response.ok) throw new Error('Failed to fetch hemotest lists');
  const data = await response.json();
  const lists = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(lists) ? lists : [];
}

export async function getHemotestList(listId: number): Promise<HemotestListWithItems | null> {
  const response = await fetch(`${API_BASE}/hemotest.getList?input=${encodeURIComponent(JSON.stringify({ listId }))}`);
  if (!response.ok) throw new Error('Failed to fetch hemotest list');
  const data = await response.json();
  return data.result?.data || null;
}

export async function addPointToHemotestList(listId: number, pointId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/hemotest.addPointToList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { listId, pointId } }),
  });
  if (!response.ok) throw new Error('Failed to add point to hemotest list');
}

// ─── Sberbank List Management ───────────────────────────────────────────────

export interface SberbankPickupList {
  id: number;
  dayOfWeek: number;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SberbankListWithItems {
  list: SberbankPickupList;
  items: SberbankPoint[];
}

export async function createSberbankPickupList(dayOfWeek: number, name: string, pointIds: number[]): Promise<SberbankPickupList> {
  const response = await fetch(`${API_BASE}/sberbank.createList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { dayOfWeek, name, pointIds } }),
  });
  if (!response.ok) throw new Error('Failed to create sberbank list');
  const data = await response.json();
  return data.result?.data;
}

export async function getSberbankListsForDay(dayOfWeek: number): Promise<SberbankPickupList[]> {
  const response = await fetch(`${API_BASE}/sberbank.listsForDay?input=${encodeURIComponent(JSON.stringify({ dayOfWeek }))}`);
  if (!response.ok) throw new Error('Failed to fetch sberbank lists');
  const data = await response.json();
  const lists = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(lists) ? lists : [];
}

export async function getSberbankList(listId: number): Promise<SberbankListWithItems | null> {
  const response = await fetch(`${API_BASE}/sberbank.getList?input=${encodeURIComponent(JSON.stringify({ listId }))}`);
  if (!response.ok) throw new Error('Failed to fetch sberbank list');
  const data = await response.json();
  return data.result?.data || null;
}

export async function addPointToSberbankList(listId: number, pointId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/sberbank.addPointToList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { listId, pointId } }),
  });
  if (!response.ok) throw new Error('Failed to add point to sberbank list');
}

// ─── Mails API ─────────────────────────────────────────────────────────────

export interface Mail {
  id: number;
  waybillNumber: string;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  status: 'not_delivered' | 'delivered' | 'failed';
  createdAt: string;
  deliveredAt?: string;
  recipientSignature?: string;
  courierId?: number;
}

export async function getAllMails(filters?: {
  status?: 'all' | 'not_delivered' | 'delivered' | 'failed';
  dateFrom?: string;
  dateTo?: string;
}): Promise<Mail[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') {
    params.append('status', filters.status);
  }
  if (filters?.dateFrom) {
    params.append('dateFrom', filters.dateFrom);
  }
  if (filters?.dateTo) {
    params.append('dateTo', filters.dateTo);
  }
  
  const response = await fetch(`${API_BASE}/managerMails.all?input=${encodeURIComponent(JSON.stringify({
    status: filters?.status === 'all' ? undefined : filters?.status,
    dateFrom: filters?.dateFrom,
    dateTo: filters?.dateTo,
  }))}`);
  if (!response.ok) throw new Error('Failed to fetch mails');
  const data = await response.json();
  const mails = data.result?.data?.json || data.result?.data || [];
  return Array.isArray(mails) ? mails : [];
}

export async function createMail(mail: Omit<Mail, 'id' | 'createdAt' | 'status' | 'deliveredAt' | 'courierId'>): Promise<Mail> {
  const response = await fetch(`${API_BASE}/managerMails.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: mail }),
  });
  if (!response.ok) throw new Error('Failed to create mail');
  const data = await response.json();
  return data.result?.data;
}


// ─── Requests API (multi-type requests) ─────────────────────────────────────

export interface Request {
  id: number;
  requestType: 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  clientId?: number;
  courierId?: number;
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
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to POST ${endpoint}`);
  return response.json();
}

export async function createRequest(request: Omit<Request, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<{ id: number; success: boolean }> {
  const response = await fetch(`${API_BASE}/requests.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: request }),
  });
  if (!response.ok) throw new Error('Failed to create request');
  const data = await response.json();
  return data.result?.data || { id: 0, success: false };
}

export async function getAllRequests(): Promise<Request[]> {
  const response = await fetch(`${API_BASE}/requests.all?input={}`);
  if (!response.ok) throw new Error('Failed to fetch requests');
  const data = await response.json();
  return data.result?.data?.json || data.result?.data || [];
}

export async function getRequestById(id: number): Promise<Request | null> {
  const response = await fetch(`${API_BASE}/requests.getById?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  if (!response.ok) throw new Error('Failed to fetch request');
  const data = await response.json();
  return data.result?.data?.json || data.result?.data || null;
}

export async function updateRequestStatus(id: number, status: string): Promise<void> {
  const response = await fetch(`${API_BASE}/requests.updateStatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { id, status } }),
  });
  if (!response.ok) throw new Error('Failed to update request status');
}

export async function assignRequestCourier(id: number, courierId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/requests.assignCourier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { id, courierId } }),
  });
  if (!response.ok) throw new Error('Failed to assign courier to request');
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
  try {
    const response = await fetch(`${API_BASE}/requests.extractFromPdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { pdfBase64, fileName } }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to extract waybill data from PDF');
    }
    const data = await response.json();
    // TRPC returns { result: { data: { json: {...} } } }
    return data.result?.data?.json || data.result?.data || {};
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
}


// ─── AI Text Parsing ────────────────────────────────────────────────────────
export interface ParsedRequestData {
  requestType: string;
  clientName: string;
  courierName: string;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  paymentMethod: string;
  comment: string;
}

export async function parseRequestWithAI(text: string): Promise<{ success: boolean; data?: ParsedRequestData }> {
  try {
    const response = await fetch(`${API_BASE}/ai.parseRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { text } }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to parse request with AI');
    }
    const data = await response.json();
    // TRPC returns { result: { data: { json: {...} } } }
    return {
      success: true,
      data: data.result?.data?.json || data.result?.data || {},
    };
  } catch (error) {
    console.error('AI parsing error:', error);
    throw error;
  }
}
