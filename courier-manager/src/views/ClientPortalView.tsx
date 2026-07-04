import { useState } from 'react';
import { AppSelect } from '../components/AppSelect';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  LogOut,
  Package,
  Plus,
  Repeat2,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

type ClientPage = 'home' | 'create' | 'requests' | 'profile';
type RequestType = 'delivery' | 'move' | 'transportCompany';

type ClientRequest = {
  id: string;
  date: string;
  type: string;
  route: string;
  status: 'delivered' | 'notDelivered' | 'waiting';
  courier: string;
  completedAt?: string;
};

const currentRequests: ClientRequest[] = [
  {
    id: '10823',
    date: '17.06.2025 11:30',
    type: 'Доставка',
    route: 'Гемотест, Пролетарская → Клиент',
    status: 'notDelivered',
    courier: 'Сидоров А.',
  },
  {
    id: '10821',
    date: '16.06.2025 09:50',
    type: 'Перемещение',
    route: 'Офис 1 → Офис 2',
    status: 'waiting',
    courier: '—',
  },
  {
    id: '10819',
    date: '15.06.2025 14:10',
    type: 'Вызов ТК',
    route: 'Клиент → Деловые Линии',
    status: 'notDelivered',
    courier: '—',
  },
];

const archiveRequests: ClientRequest[] = [
  {
    id: '10825',
    date: '18.06.2025',
    type: 'Доставка',
    route: 'Гемотест, Тверь → Клиент',
    status: 'delivered',
    courier: 'Иванов И.',
    completedAt: '18.06.2025 14:35',
  },
  {
    id: '10824',
    date: '17.06.2025',
    type: 'Вызов ТК',
    route: 'Клиент → СДЭК',
    status: 'delivered',
    courier: 'Петров П.',
    completedAt: '17.06.2025 18:10',
  },
  {
    id: '10818',
    date: '14.06.2025',
    type: 'Перемещение',
    route: 'Склад → Офис',
    status: 'delivered',
    courier: 'Кузнецов В.',
    completedAt: '14.06.2025 13:25',
  },
];

function MigLogo({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center text-left"
      aria-label="На главную"
    >
      <div>
        <div className="text-[34px] font-black italic leading-none tracking-[-0.08em] text-blue-700 transition group-hover:text-blue-800 sm:text-[38px]">
          МИГ
        </div>
        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Курьерская служба
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ClientRequest['status'] }) {
  if (status === 'delivered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Доставлена
      </span>
    );
  }

  if (status === 'notDelivered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-100">
        <XCircle className="h-3.5 w-3.5" />
        Не доставлена
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
      Ожидает
    </span>
  );
}

function RequestCard({ request, archive = false }: { request: ClientRequest; archive?: boolean }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-950">№{request.id}</div>
          <div className="mt-1 text-xs font-semibold text-slate-400">{request.date}</div>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{request.type}</div>
        <div className="mt-1 text-sm font-bold leading-5 text-slate-800">{request.route}</div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <span className="text-slate-400">Курьер: </span>
          <span className="font-semibold text-slate-800">{request.courier}</span>
        </div>
        {archive ? (
          <div>
            <span className="text-slate-400">Выполнена: </span>
            <span className="font-semibold text-slate-800">{request.completedAt || '—'}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function LoginPanel({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState('director@client.ru');
  const [password, setPassword] = useState('12345678');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!login.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }

    localStorage.setItem('clientPortalToken', 'preview-client-token');
    localStorage.setItem('clientPortalName', 'Иванов И.И.');
    onLogin();
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 lg:flex lg:flex-col lg:justify-center lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,87,217,0.10),transparent_35%)]" />

          <div className="relative z-10 max-w-2xl">
            <MigLogo onClick={() => undefined} />

            <div className="mt-24">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
                Личный кабинет клиента
              </p>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-slate-950">
                Заявки, доставки и архив без лишних разделов.
              </h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-slate-500">
                Руководитель создаёт заявку, менеджер МИГ подтверждает её, после этого заявка уходит в работу курьеру.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-gradient-to-b from-white to-slate-50 p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <MigLogo onClick={() => undefined} />
              <p className="mt-4 text-sm text-slate-500">Личный кабинет клиента.</p>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Вход</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Введите логин и пароль клиента.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Логин</label>
                  <input
                    type="text"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    placeholder="client@example.ru"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Пароль</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    placeholder="Введите пароль"
                    autoComplete="current-password"
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95"
                >
                  <span>Войти</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Первый этап</p>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  Сейчас это frontend-заготовка кабинета. API авторизации клиента подключим следующим этапом.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ClientPortalView() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('clientPortalToken')));
  const [page, setPage] = useState<ClientPage>('home');
  const [requestType, setRequestType] = useState<RequestType>('delivery');
  const [transportCompany, setTransportCompany] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const clientName = localStorage.getItem('clientPortalName') || 'Иванов И.И.';

  const handleLogout = () => {
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalName');
    setIsAuthenticated(false);
    setPage('home');
  };

  const handleSubmitRequest = (event: React.FormEvent) => {
    event.preventDefault();
    setSent(true);
  };

  if (!isAuthenticated) {
    return <LoginPanel onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
          <MigLogo onClick={() => setPage('home')} />

          <button
            type="button"
            onClick={() => setPage('profile')}
            className="inline-flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
              {clientName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-slate-950">{clientName}</p>
              <p className="text-xs text-slate-500">Профиль</p>
            </div>
            <User className="h-4 w-4 text-slate-400 sm:hidden" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {page === 'home' ? (
          <section>
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Главная
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Два основных действия: создать заявку или посмотреть заявки.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setPage('create');
                }}
                className="group min-h-[220px] rounded-[28px] bg-blue-700 p-6 text-left text-white shadow-xl shadow-blue-900/10 transition hover:-translate-y-0.5 hover:bg-blue-800 sm:p-8"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15">
                  <Plus className="h-8 w-8" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight">Создать заявку</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-blue-50/85">
                  Доставка, перемещение или вызов транспортной компании. Заявка сначала уйдёт менеджеру на подтверждение.
                </p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold">
                  Перейти <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPage('requests')}
                className="group min-h-[220px] rounded-[28px] border border-slate-200 bg-white p-6 text-left shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70 sm:p-8"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
                  <FileText className="h-8 w-8" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
                  Посмотреть заявки
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                  Текущие заявки и архив: какие доставлены, какие не доставлены, когда были сделаны.
                </p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-blue-700">
                  Перейти <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </button>
            </div>
          </section>
        ) : null}

        {page === 'create' ? (
          <section>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Создать заявку</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Выберите тип заявки и заполните поля.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPage('home')}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                На главную
              </button>
            </div>

            <form
              onSubmit={handleSubmitRequest}
              className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-6"
            >
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setRequestType('delivery')}
                  className={[
                    'rounded-3xl border p-5 text-left transition',
                    requestType === 'delivery'
                      ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-100'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Package className="h-6 w-6 text-blue-700" />
                  <h3 className="mt-4 text-base font-bold text-slate-950">Доставка</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    Забрать в одной точке и доставить в другую.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestType('move')}
                  className={[
                    'rounded-3xl border p-5 text-left transition',
                    requestType === 'move'
                      ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-100'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Repeat2 className="h-6 w-6 text-blue-700" />
                  <h3 className="mt-4 text-base font-bold text-slate-950">Перемещение</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    Между филиалами, офисами или внутренними точками.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestType('transportCompany')}
                  className={[
                    'rounded-3xl border p-5 text-left transition',
                    requestType === 'transportCompany'
                      ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-100'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Truck className="h-6 w-6 text-blue-700" />
                  <h3 className="mt-4 text-base font-bold text-slate-950">Вызов транспортной компании</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    СДЭК, Деловые Линии, ПЭК и другие ТК.
                  </p>
                </button>
              </div>

              <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-950">
                {requestType === 'delivery'
                  ? 'Тип «Доставка»: стандартная заявка на забор и доставку между двумя точками.'
                  : null}
                {requestType === 'move'
                  ? 'Тип «Перемещение»: внутренняя перевозка между филиалами, офисами, складами или точками клиента.'
                  : null}
                {requestType === 'transportCompany'
                  ? 'Тип «Вызов транспортной компании»: заявка связана с отправкой или получением груза через ТК.'
                  : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Дата заявки</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" defaultValue="19.06.2025" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Желаемое время</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" defaultValue="10:00 — 14:00" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Откуда забрать</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="Адрес отправителя" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Куда доставить</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="Адрес получателя" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Контакт отправителя</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="+7 ..." />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Контакт получателя</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="+7 ..." />
                </div>

                {requestType === 'transportCompany' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Транспортная компания</label>
                      <AppSelect
                        value={transportCompany}
                        placeholder="Выберите ТК"
                        options={['СДЭК', 'Деловые Линии', 'ПЭК', 'Энергия'].map((name) => ({ value: name, label: name }))}
                        onChange={(value) => setTransportCompany(typeof value === 'string' ? value : null)}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Номер накладной / заявки ТК</label>
                      <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="Например: TK-245813" />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Что нужно сделать с ТК</label>
                      <textarea className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="Например: отвезти груз в ТК, оформить отправку, забрать груз из ТК, передать документы" />
                    </div>
                  </>
                ) : null}

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Комментарий</label>
                  <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white" placeholder="Состав груза / документов, важные детали, пропуск, этаж, контактные лица" />
                </div>
              </div>

              {sent ? (
                <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
                  Заявка отправлена менеджеру. После подтверждения она появится в списке заявок.
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-blue-700 px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 sm:w-auto"
                >
                  Отправить заявку
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {page === 'requests' ? (
          <section>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Посмотреть заявки</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Текущие заявки сверху, архив заявок ниже.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPage('home')}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                На главную
              </button>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {['Все', 'Доставлены', 'Не доставлены'].map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={[
                    'h-10 rounded-full border px-4 text-sm font-bold transition',
                    index === 0
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              <div>
                <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Текущие заявки</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {currentRequests.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Архив заявок</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {archiveRequests.map((request) => (
                    <RequestCard key={request.id} request={request} archive />
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {page === 'profile' ? (
          <section>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Профиль</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Данные клиента и руководителя.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPage('home')}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                На главную
              </button>
            </div>

            <div className="max-w-3xl rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-6">
              <div className="mb-6 flex items-center gap-4 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-xl font-bold text-white">
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-bold text-slate-950">{clientName}</p>
                  <p className="text-sm text-slate-500">Руководитель клиента</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Компания</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" defaultValue="ООО Клиент" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Роль</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" defaultValue="Руководитель" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" defaultValue="director@client.ru" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Телефон</label>
                  <input className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" defaultValue="+7 900 000-00-00" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-blue-700 px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800"
                >
                  Сохранить
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
