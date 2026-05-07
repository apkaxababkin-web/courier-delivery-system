import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bike, BellOff, Clock3, MapPin, Phone, Plus, Search, Trash2, X } from 'lucide-react';

type CourierStatus = 'Онлайн' | 'На заказе' | 'Перерыв' | 'Выходной';

type Courier = {
  id: number;
  name: string;
  phone: string;
  status: CourierStatus;
  deliveries: number;
  eta: string;
};

type CourierFormData = {
  name: string;
  phone: string;
  status: CourierStatus;
};

const COURIERS_STORAGE_KEY = 'courier-manager:couriers';

const statusStyles: Record<CourierStatus, string> = {
  Онлайн: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  'На заказе': 'border border-amber-200 bg-amber-50 text-amber-700',
  Перерыв: 'border border-slate-200 bg-slate-100 text-slate-600',
  Выходной: 'border border-slate-300 bg-white text-slate-500',
};

const statusHints: Record<CourierStatus, string> = {
  Онлайн: 'Доступен для заявок',
  'На заказе': 'Сейчас выполняет доставку',
  Перерыв: 'Временно не назначать',
  Выходной: 'Не назначать и не отправлять уведомления',
};

const emptyForm: CourierFormData = {
  name: '',
  phone: '',
  status: 'Онлайн',
};

function readStoredCouriers(): Courier[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(COURIERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((courier) => ({
          ...courier,
          status: courier.status === 'Выходной' ? 'Выходной' : courier.status || 'Онлайн',
        }))
      : [];
  } catch {
    return [];
  }
}

function saveStoredCouriers(couriers: Courier[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COURIERS_STORAGE_KEY, JSON.stringify(couriers));
}

export default function CouriersView() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CourierFormData>(emptyForm);

  useEffect(() => {
    setCouriers(readStoredCouriers());
  }, []);

  const filteredCouriers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return couriers;

    return couriers.filter((courier) =>
      [courier.name, courier.phone, courier.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [couriers, searchQuery]);

  const onlineCount = couriers.filter((courier) => courier.status === 'Онлайн').length;
  const offCount = couriers.filter((courier) => courier.status === 'Выходной').length;

  const handleAddCourier = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      alert('Укажите имя курьера');
      return;
    }

    const nextCouriers: Courier[] = [
      ...couriers,
      {
        id: Date.now(),
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        status: formData.status,
        deliveries: 0,
        eta: formData.status === 'Выходной' ? 'выходной' : '—',
      },
    ];

    setCouriers(nextCouriers);
    saveStoredCouriers(nextCouriers);
    setFormData(emptyForm);
    setShowForm(false);
  };

  const handleDeleteCourier = (id: number) => {
    if (!confirm('Удалить этого курьера из списка?')) return;

    const nextCouriers = couriers.filter((courier) => courier.id !== id);
    setCouriers(nextCouriers);
    saveStoredCouriers(nextCouriers);
  };

  const handleStatusChange = (id: number, status: CourierStatus) => {
    const nextCouriers = couriers.map((courier) =>
      courier.id === id
        ? {
            ...courier,
            status,
            eta: status === 'Выходной' ? 'выходной' : courier.eta === 'выходной' ? '—' : courier.eta,
          }
        : courier
    );

    setCouriers(nextCouriers);
    saveStoredCouriers(nextCouriers);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Курьеры
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Статусы доступности, текущая загрузка и управление исполнителями.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95"
        >
          <Plus className="h-4 w-4" />
          Добавить курьера
        </button>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по курьеру или телефону..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />{onlineCount} онлайн</span>
            <span className="inline-flex items-center gap-2"><BellOff className="h-3.5 w-3.5" />{offCount} выходной</span>
            <span>всего {couriers.length}</span>
          </div>
        </div>

        {filteredCouriers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-slate-500">
            <Bike className="mb-3 h-9 w-9 text-slate-300" />
            <p className="text-sm font-medium text-slate-950">
              {couriers.length === 0 ? 'Курьеры ещё не добавлены' : 'Курьеры не найдены'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {couriers.length === 0 ? 'Нажмите “Добавить курьера”, чтобы создать первого исполнителя.' : 'Попробуйте изменить поисковый запрос.'}
            </p>
            {couriers.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95"
              >
                <Plus className="h-4 w-4" />
                Добавить курьера
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-3">
            {filteredCouriers.map((courier) => (
              <div
                key={courier.id}
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                      <Bike className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="font-semibold text-slate-950">{courier.name}</h3>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                        <Phone className="h-3.5 w-3.5" />
                        {courier.phone || 'Телефон не указан'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteCourier(courier.id)}
                    className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50"
                    title="Удалить курьера"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />
                      Заказы
                    </div>

                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {courier.deliveries}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      ETA
                    </div>

                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {courier.eta}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[courier.status]}`}>
                        {courier.status}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{statusHints[courier.status]}</p>
                    </div>

                    <select
                      value={courier.status}
                      onChange={(event) => handleStatusChange(courier.id, event.target.value as CourierStatus)}
                      className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                    >
                      <option value="Онлайн">Онлайн</option>
                      <option value="На заказе">На заказе</option>
                      <option value="Перерыв">Перерыв</option>
                      <option value="Выходной">Выходной</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && createPortal(
        <div className="modal-overlay">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">Добавить курьера</h3>
                <p className="mt-1 text-sm text-slate-500">Создайте исполнителя для операционного списка.</p>
              </div>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCourier} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Имя курьера *</label>
                <input
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Например: Батор Цыренов"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Телефон</label>
                <input
                  value={formData.phone}
                  onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+7..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Статус</label>
                <select
                  value={formData.status}
                  onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.value as CourierStatus }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                >
                  <option value="Онлайн">Онлайн — доступен для заявок</option>
                  <option value="На заказе">На заказе — сейчас выполняет доставку</option>
                  <option value="Перерыв">Перерыв — временно не назначать</option>
                  <option value="Выходной">Выходной — не отправлять уведомления</option>
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                Статус “Выходной” фиксирует, что курьера не нужно назначать и не нужно отправлять ему уведомления. Сейчас это операционный статус в интерфейсе; backend-уведомления подключаются отдельным шагом.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white hover:opacity-95">
                  Добавить
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
