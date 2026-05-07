import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bike, BellOff, Copy, KeyRound, MapPin, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react';

type Courier = {
  id: number;
  name: string;
  username: string;
  phone?: string | null;
  vehicleType?: string;
  isActive: boolean;
  totalDeliveries: number;
};

type CourierFormData = {
  name: string;
  username: string;
  password: string;
  phone: string;
  vehicleType: string;
};

const API_URL = import.meta.env.VITE_API_URL || '';

const emptyForm: CourierFormData = {
  name: '',
  username: '',
  password: '',
  phone: '',
  vehicleType: 'car',
};

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white';
const primaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

const makeUsername = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[а-я]/g, (char) => {
      const map: Record<string, string> = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      };
      return map[char] || '';
    })
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);

const makePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i += 1) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return password;
};

export default function CouriersView() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CourierFormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; username: string; password: string } | null>(null);

  useEffect(() => {
    loadCouriers();
  }, []);

  const loadCouriers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/manager/couriers`);
      if (!response.ok) throw new Error('Failed to load couriers');
      const data = await response.json();
      setCouriers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading couriers:', error);
      setCouriers([]);
    } finally {
      setLoading(false);
    }
  };

  const activeCouriers = couriers.filter((courier) => courier.isActive !== false);

  const filteredCouriers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeCouriers;

    return activeCouriers.filter((courier) =>
      [courier.name, courier.username, courier.phone || '', courier.vehicleType || '']
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [activeCouriers, searchQuery]);

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      username: prev.username || makeUsername(name),
    }));
  };

  const handleAddCourier = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      alert('Укажите имя, логин и пароль курьера');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formData.name.trim(),
        username: formData.username.trim(),
        password: formData.password,
        phone: formData.phone.trim(),
        vehicleType: formData.vehicleType,
      };

      const response = await fetch(`${API_URL}/api/manager/couriers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка при создании курьера');
      }

      setCreatedCredentials({ name: payload.name, username: payload.username, password: payload.password });
      setFormData(emptyForm);
      setShowForm(false);
      await loadCouriers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Ошибка при создании курьера');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateCourier = async (courier: Courier) => {
    if (!confirm(`Отключить доступ курьера «${courier.name}»? Он больше не сможет войти в приложение.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/manager/couriers/${courier.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Ошибка при отключении курьера');
      await loadCouriers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Ошибка при отключении курьера');
    }
  };

  const copyCredentials = async (credentials: { name: string; username: string; password: string }) => {
    const text = `Доступ для курьера ${credentials.name}\nЛогин: ${credentials.username}\nПароль: ${credentials.password}\nАдрес входа: https://courier.couriermig.ru`;
    await navigator.clipboard.writeText(text);
    alert('Логин и пароль скопированы');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Курьеры</h1>
          <p className="mt-1 text-sm text-slate-500">
            Менеджер создаёт курьеру логин и пароль. Самостоятельной регистрации у курьеров нет.
          </p>
        </div>

        <button onClick={() => setShowForm(true)} className={primaryButtonClass}>
          <Plus className="h-4 w-4" />
          Выдать доступ курьеру
        </button>
      </div>

      {createdCredentials && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Доступ создан</p>
              <p className="mt-1 text-sm text-slate-500">Передайте эти данные курьеру. Пароль показывается только сейчас.</p>
            </div>
            <button onClick={() => copyCredentials(createdCredentials)} className={secondaryButtonClass}>
              <Copy className="h-4 w-4" />
              Скопировать доступ
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CredentialBox label="Курьер" value={createdCredentials.name} />
            <CredentialBox label="Логин" value={createdCredentials.username} />
            <CredentialBox label="Пароль" value={createdCredentials.password} />
          </div>
        </div>
      )}

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по имени, логину или телефону..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-950" />{activeCouriers.length} активных</span>
            <span className="inline-flex items-center gap-2"><BellOff className="h-3.5 w-3.5" />{couriers.length - activeCouriers.length} отключено</span>
            <span>всего {couriers.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center p-8 text-sm text-slate-500">Загрузка курьеров...</div>
        ) : filteredCouriers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-slate-500">
            <Bike className="mb-3 h-9 w-9 text-slate-300" />
            <p className="text-sm font-medium text-slate-950">{activeCouriers.length === 0 ? 'Аккаунты курьеров ещё не созданы' : 'Курьеры не найдены'}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {activeCouriers.length === 0 ? 'Создайте логин и пароль для первого курьера.' : 'Попробуйте изменить поисковый запрос.'}
            </p>
            {activeCouriers.length === 0 && (
              <button onClick={() => setShowForm(true)} className={`mt-5 ${primaryButtonClass}`}>
                <Plus className="h-4 w-4" />
                Выдать доступ курьеру
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-3">
            {filteredCouriers.map((courier) => (
              <div key={courier.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                      <Bike className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">{courier.name}</h3>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                        <UserRound className="h-3.5 w-3.5" />
                        <span className="truncate">{courier.username}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeactivateCourier(courier)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-950"
                    title="Отключить доступ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Phone className="h-3.5 w-3.5" />
                      Телефон
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{courier.phone || 'Не указан'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />
                      Доставки
                    </div>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{courier.totalDeliveries || 0}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {courier.isActive ? 'Доступ активен' : 'Доступ отключён'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Логин выдаётся менеджером. Пароль хранится в зашифрованном виде и повторно не отображается.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && createPortal(
        <div className="modal-overlay">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">Выдать доступ курьеру</h3>
                <p className="mt-1 text-sm text-slate-500">Создайте логин и пароль для входа в курьерское приложение.</p>
              </div>

              <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCourier} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Имя курьера *</label>
                <input value={formData.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="Например: Батор Цыренов" className={inputClass} required />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Логин *</label>
                  <input value={formData.username} onChange={(event) => setFormData((prev) => ({ ...prev, username: event.target.value.trim().toLowerCase() }))} placeholder="bator" className={inputClass} required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Пароль *</label>
                  <div className="flex gap-2">
                    <input value={formData.password} onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))} placeholder="минимум 6 символов" className={inputClass} required />
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, password: makePassword() }))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Сгенерировать пароль">
                      <KeyRound className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Телефон</label>
                  <input value={formData.phone} onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))} placeholder="+7..." className={inputClass} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Транспорт</label>
                  <select value={formData.vehicleType} onChange={(event) => setFormData((prev) => ({ ...prev, vehicleType: event.target.value }))} className={inputClass}>
                    <option value="car">Авто</option>
                    <option value="scooter">Скутер</option>
                    <option value="bicycle">Велосипед</option>
                    <option value="foot">Пеший</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                Курьер сможет войти только по выданному логину и паролю. Самостоятельной регистрации в курьерском приложении нет.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className={`flex-1 ${primaryButtonClass}`}>
                  {saving ? 'Создание...' : 'Создать доступ'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className={`flex-1 ${secondaryButtonClass}`}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function CredentialBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
