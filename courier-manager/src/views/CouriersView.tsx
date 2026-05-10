import { useEffect, useState } from 'react';

type Courier = {
  id: number;
  name: string;
  username: string;
  phone?: string | null;
  vehicleType?: string | null;
  isActive?: boolean;
};

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

async function getCouriers(): Promise<Courier[]> {
  const response = await fetch('/api/trpc/manager.couriers', { credentials: 'include', cache: 'no-store' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить курьеров');
  return unwrapTrpc<Courier[]>(payload, []);
}

async function createCourier(input: Record<string, unknown>) {
  const response = await fetch('/api/trpc/manager.createCourier', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось создать курьера');
  return unwrapTrpc(payload, { success: true });
}

export default function CouriersView() {
  const [items, setItems] = useState<Courier[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', accessCode: '', phone: '', vehicleType: 'car' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await getCouriers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async () => {
    const name = form.name.trim();
    const username = form.username.trim();
    const accessCode = form.accessCode.trim();
    if (!name || !username || !accessCode) {
      setError('Заполните имя, логин и код доступа');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createCourier({
        name,
        username,
        password: accessCode,
        phone: form.phone.trim() || null,
        vehicleType: form.vehicleType,
      });
      setForm({ name: '', username: '', accessCode: '', phone: '', vehicleType: 'car' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Курьеры</h2>
            <p className="text-sm text-slate-500 mt-1">Создание доступов для курьеров</p>
          </div>
          <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
            {loading ? 'Обновление...' : 'Обновить'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <input className="px-4 py-3 rounded-xl border border-slate-200" placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="px-4 py-3 rounded-xl border border-slate-200" placeholder="Логин" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="px-4 py-3 rounded-xl border border-slate-200" placeholder="Код доступа" value={form.accessCode} onChange={(e) => setForm({ ...form, accessCode: e.target.value })} />
          <input className="px-4 py-3 rounded-xl border border-slate-200" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className="px-4 py-3 rounded-xl border border-slate-200 bg-white" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
            <option value="car">Авто</option>
            <option value="bike">Вело</option>
            <option value="walk">Пеший</option>
          </select>
        </div>

        <button onClick={submit} disabled={saving} className="px-5 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Создание...' : 'Создать курьера'}
        </button>

        {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Список курьеров</h3>
          <span className="text-sm text-slate-500">{items.length} всего</span>
        </div>
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500">{loading ? 'Загрузка...' : 'Курьеры пока не созданы'}</div>
          ) : items.map((courier) => (
            <div key={courier.id} className="p-5 flex items-center justify-between gap-4 hover:bg-slate-50">
              <div>
                <div className="font-semibold text-slate-900">{courier.name}</div>
                <div className="text-sm text-slate-500">{courier.username}</div>
              </div>
              <div className="text-sm text-slate-600 text-right">
                <div>{courier.phone || 'Телефон не указан'}</div>
                <div>{courier.vehicleType || 'car'} · {courier.isActive === false ? 'Отключён' : 'Активен'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
