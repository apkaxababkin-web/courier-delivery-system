export interface CourierSession {
  token: string;
  courier?: {
    id: number;
    name: string;
    username?: string;
  } | null;
}

export interface CourierRealtimeSnapshot {
  ok: boolean;
  updatedAt: string;
  courier: unknown;
  tasks: unknown[];
  mails: unknown[];
}

export type CourierTaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

function unwrapTrpc<T>(payload: any, fallback: T): T {
  return payload?.result?.data?.json ?? payload?.result?.data ?? payload?.result ?? fallback;
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

export class CourierMobileClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async login(username: string, password: string): Promise<CourierSession> {
    const response = await fetch(`${this.baseUrl}/api/trpc/courierAuth.login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ json: { username, password } }),
    });

    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || 'Ошибка входа');

    const session = unwrapTrpc<CourierSession>(payload, { token: '' });
    if (!session?.token) throw new Error('Сервер не вернул courier token');
    return session;
  }

  async realtime(token: string): Promise<CourierRealtimeSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/realtime/courier?token=${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const payload = await readJson(response);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || payload?.error || 'Ошибка realtime sync');

    return {
      ok: true,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      courier: payload.courier ?? null,
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      mails: Array.isArray(payload.mails) ? payload.mails : [],
    };
  }

  async tasksAll(token: string, date?: string): Promise<unknown[]> {
    const input = encodeURIComponent(JSON.stringify({ token, ...(date ? { date } : {}) }));
    const response = await fetch(`${this.baseUrl}/api/trpc/tasks.all?input=${input}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const payload = await readJson(response);
    if (!response.ok || payload?.error) throw new Error(payload?.error?.message || 'Ошибка загрузки задач');

    const tasks = unwrapTrpc<unknown[]>(payload, []);
    return Array.isArray(tasks) ? tasks : [];
  }

  async setTaskStatus(token: string, taskId: number, status: CourierTaskStatus): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/trpc/tasks.setStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ json: { token, taskId, status } }),
    });

    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || 'Ошибка обновления статуса');
  }
}

export function createCourierMobileClient(baseUrl: string) {
  return new CourierMobileClient(baseUrl);
}
