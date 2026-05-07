import { Bike, Clock3, MapPin, Phone, Plus, Search } from 'lucide-react';

const couriers = [
  {
    id: 1,
    name: 'Алексей Смирнов',
    phone: '+7 (999) 123-45-67',
    status: 'Онлайн',
    deliveries: 12,
    eta: '12 мин',
  },
  {
    id: 2,
    name: 'Дмитрий Орлов',
    phone: '+7 (999) 234-56-78',
    status: 'На заказе',
    deliveries: 8,
    eta: '24 мин',
  },
  {
    id: 3,
    name: 'Анна Волкова',
    phone: '+7 (999) 345-67-89',
    status: 'Перерыв',
    deliveries: 5,
    eta: '—',
  },
];

const statusStyles: Record<string, string> = {
  Онлайн: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  'На заказе': 'border border-amber-200 bg-amber-50 text-amber-700',
  Перерыв: 'border border-slate-200 bg-slate-100 text-slate-600',
};

export default function CouriersView() {
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

        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95">
          <Plus className="h-4 w-4" />
          Добавить курьера
        </button>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              placeholder="Поиск по курьеру или телефону..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            14 курьеров онлайн
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-3">
          {couriers.map((courier) => (
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
                      {courier.phone}
                    </div>
                  </div>
                </div>

                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[courier.status]}`}
                >
                  {courier.status}
                </span>
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

              <div className="mt-5 flex gap-2">
                <button className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
                  Открыть
                </button>

                <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
                  Назначить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
