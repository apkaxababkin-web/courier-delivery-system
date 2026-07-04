import { useState, useEffect, useRef } from 'react';
import {
  Package,
  MapPin,
  Landmark,
  BarChart3,
  Users,
  LogOut,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MoreVertical,
  Search,
  Send,
} from 'lucide-react';
import TasksView from './views/TasksView';
import ClientsView from './views/ClientsViewV2';
import HemotestView from './views/HemotestView';
import SberbankView from './views/SberbankView';
import MailsView from './views/MailsView';
import ReportsView from './views/ReportsView';
import CouriersView from './views/CouriersView';
import LoginView from './views/LoginView';
import ClientPortalView from './views/ClientPortalView';
import { type ChatMessage, getChatMessages, sendChatMessage } from './lib/api';
import { formatLocalDateWithOptions, formatLocalTime, getLocalDateKey } from './lib/local-time';

type ViewType = 'tasks' | 'mails' | 'hemotest' | 'sberbank' | 'clients' | 'reports' | 'couriers';



const ARCHIVE_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const ARCHIVE_WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type ArchiveCalendarDay =
  | { key: string; day: null; date: null }
  | { key: string; day: number; date: Date };

function parseDateKey(date: string) {
  if (!date) return new Date();

  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return new Date();

  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildArchiveCalendarDays(monthDate: Date): ArchiveCalendarDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const mondayFirstOffset = firstDay === 0 ? 6 : firstDay - 1;

  return [
    ...Array.from({ length: mondayFirstOffset }, (_, index): ArchiveCalendarDay => ({
      key: `empty-${index}`,
      day: null,
      date: null,
    })),
    ...Array.from({ length: daysInMonth }, (_, index): ArchiveCalendarDay => {
      const day = index + 1;
      const date = new Date(year, month, day);

      return {
        key: toDateKey(date),
        day,
        date,
      };
    }),
  ];
}

function getTodayDate() {
  return getLocalDateKey();
}

function formatArchiveDate(date: string) {
  if (!date) return 'Сегодня';
  return formatLocalDateWithOptions(date, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }, date);
}



function formatChatTime(value: string) {
  return formatLocalTime(value, '');
}

function ManagerChatPanel() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const managerName = localStorage.getItem('managerName') || 'Менеджер';

  const loadChatMessages = async () => {
    try {
      setChatError('');
      const data = await getChatMessages(120);
      setMessages(data);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Не удалось загрузить чат');
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    loadChatMessages();
    const timer = window.setInterval(loadChatMessages, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
  }, [messages]);

  const handleSendMessage = async () => {
    const text = draft.trim();
    if (!text || isSendingMessage) return;

    setIsSendingMessage(true);
    setChatError('');

    try {
      const message = await sendChatMessage({
        text,
        senderName: managerName,
        senderRole: 'manager',
      });

      setMessages((current) => [...current, message]);
      setDraft('');
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Не удалось отправить сообщение');
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <aside className="hidden h-screen w-[380px] shrink-0 border-l border-slate-200 bg-white xl:flex xl:flex-col 2xl:w-[420px]">
      <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 px-5">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-slate-900" />
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Чат МИГ</h2>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Общий рабочий чат
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={loadChatMessages} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950">
            <Search className="h-4 w-4" />
          </button>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {chatError ? (
        <div className="mx-5 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {chatError}
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {isChatLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Загружаем чат...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7">
              <MessageCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-900">Сообщений пока нет</p>
              <p className="mt-1 text-xs text-slate-500">Напиши первое сообщение в общий чат.</p>
            </div>
          </div>
        ) : (
          (Array.isArray(messages) ? messages : []).map((message) => {
            const rawMessage = message as any;
            const senderName = rawMessage.senderName || rawMessage.authorName || 'Пользователь';
            const senderRole = rawMessage.senderRole || rawMessage.authorType || 'courier';
            const messageText = rawMessage.text || '';
            const messageCreatedAt = rawMessage.createdAt || rawMessage.created_at || new Date().toISOString();
            const isMine = senderName === managerName && senderRole === 'manager';

            return (
              <div key={message.id} className="flex gap-3">
                <div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isMine ? 'bg-violet-500 text-white' : 'bg-blue-500 text-white'}`}>
                  {senderName.slice(0, 1)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-950">{senderName}</span>
                      <span className="ml-2 text-xs text-slate-400">{senderRole === 'manager' ? 'Менеджер' : 'Курьер'}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatChatTime(messageCreatedAt)}</span>
                  </div>

                  <div className="whitespace-pre-wrap break-words rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 shadow-sm ring-1 ring-slate-100">
                    {messageText}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-100 bg-white p-5">
        <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Написать сообщение..."
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleSendMessage}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-300"
            disabled={!draft.trim() || isSendingMessage}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Enter — отправить, Shift + Enter — новая строка.</p>
      </div>
    </aside>
  );
}


const menuItems = [
  { id: 'tasks', label: 'Все заявки', icon: Package },
  { id: 'hemotest', label: 'Гемотест', icon: MapPin },
  { id: 'sberbank', label: 'Сбербанк', icon: Landmark },
  { id: 'clients', label: 'Контрагенты', icon: Users },
  { id: 'reports', label: 'Отчёты', icon: BarChart3 },
  { id: 'couriers', label: 'Курьеры', icon: Users },
];

function App() {
  const isClientPortal =
    window.location.pathname.startsWith('/client') ||
    new URLSearchParams(window.location.search).has('client');

  if (isClientPortal) {
    return <ClientPortalView />;
  }

  const [activeView, setActiveView] = useState<ViewType>('tasks');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [managerRole, setManagerRole] = useState('Менеджер');
  const [archiveDate, setArchiveDate] = useState(getTodayDate());
  const [isArchiveCalendarOpen, setIsArchiveCalendarOpen] = useState(false);

  useEffect(() => {
    const closeArchiveCalendar = () => setIsArchiveCalendarOpen(false);
    const openPickupListManager = (event: Event) => {
      const view = (event as CustomEvent<{ view?: ViewType }>).detail?.view;
      if (view === 'hemotest' || view === 'sberbank') {
        setActiveView(view);
      }
    };

    window.addEventListener('mig-close-archive-calendar', closeArchiveCalendar);
    window.addEventListener('mig-open-pickup-list-manager', openPickupListManager);

    return () => {
      window.removeEventListener('mig-close-archive-calendar', closeArchiveCalendar);
      window.removeEventListener('mig-open-pickup-list-manager', openPickupListManager);
    };
  }, []);

  const [visibleArchiveMonth, setVisibleArchiveMonth] = useState(() => {
    const today = parseDateKey(getTodayDate());
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    const token = localStorage.getItem('managerToken');
    const name = localStorage.getItem('managerName');
    const role = localStorage.getItem('managerRole');
    if (token) {
      setIsAuthenticated(true);
      setManagerName(name || 'Менеджер');
      setManagerRole(role || 'Менеджер');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('managerToken');
    localStorage.removeItem('managerName');
    localStorage.removeItem('managerRole');
    setIsAuthenticated(false);
    setManagerName('');
    setManagerRole('');
    setActiveView('tasks');
  };

  const renderView = () => {
    switch (activeView) {
      case 'tasks':
        return <TasksView archiveDate={archiveDate} />;
      case 'mails':
        return <MailsView archiveDate={archiveDate} />;
      case 'hemotest':
        return <HemotestView archiveDate={archiveDate} />;
      case 'sberbank':
        return <SberbankView archiveDate={archiveDate} />;
      case 'clients':
        return <ClientsView />;
      case 'reports':
        return <ReportsView />;
      case 'couriers':
        return <CouriersView />;
      default:
        return <TasksView archiveDate={archiveDate} />;
    }
  };

  const getPageTitle = () => {
    return menuItems.find((item) => item.id === activeView)?.label || 'Все заявки';
  };

  const getPageDescription = () => {
    switch (activeView) {
      case 'tasks':
        return 'Рабочая область для обработки заявок, фильтров, статусов и назначений.';
      case 'mails':
        return 'Входящие письма и заявки, которые требуют обработки менеджером.';
      case 'hemotest':
        return 'Заявки и маршруты по направлению Гемотест.';
      case 'sberbank':
        return 'Заявки и маршруты по направлению Сбербанк.';
      case 'clients':
        return 'Контрагенты, магазины, точки и будущие кабинеты руководителей.';
      case 'reports':
        return 'Операционные показатели и выгрузки по доставкам.';
      case 'couriers':
        return 'Курьеры, статусы доступности и текущая загрузка.';
      default:
        return 'Система управления курьерскими заявками.';
    }
  };


  const archiveSelectedDate = parseDateKey(archiveDate);
  const archiveSelectedKey = toDateKey(archiveSelectedDate);
  const archiveTodayKey = getTodayDate();
  const archiveCalendarDays = buildArchiveCalendarDays(visibleArchiveMonth);

  const handleArchiveDatePick = (date: Date) => {
    setArchiveDate(toDateKey(date));
    setVisibleArchiveMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsArchiveCalendarOpen(false);
  };

  if (!isAuthenticated) {
    return (
      <LoginView
        onLogin={() => {
          setIsAuthenticated(true);
          setManagerName(localStorage.getItem('managerName') || 'Менеджер');
          setManagerRole(localStorage.getItem('managerRole') || 'Менеджер');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex h-screen min-h-0 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="relative z-[9000] shrink-0 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <img src="/mig-icon-original.png?v=7" alt="МИГ" className="h-10 w-10 shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-5 text-slate-950">Курьерская служба МИГ</p>
                <p className="hidden truncate text-xs text-slate-500 md:block">{getPageTitle()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                {isArchiveCalendarOpen ? (
                  <button
                    type="button"
                    aria-label="Закрыть календарь архива"
                    className="fixed inset-0 z-[70] cursor-default bg-transparent"
                    onClick={() => setIsArchiveCalendarOpen(false)}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event('mig-close-floating-ui'));
                    window.dispatchEvent(new Event('mig-close-create-action-menu'));

                    const selected = parseDateKey(archiveDate);
                    setVisibleArchiveMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
                    setIsArchiveCalendarOpen((value) => !value);
                  }}
                  className="relative z-[80] inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <span className="hidden whitespace-nowrap capitalize sm:inline">{formatArchiveDate(archiveDate)}</span>
                  <span className="whitespace-nowrap sm:hidden">Дата</span>
                </button>

                {isArchiveCalendarOpen ? (
                  <div className="absolute right-0 top-12 z-[80] w-[304px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15">
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => setVisibleArchiveMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Предыдущий месяц"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <div className="text-center">
                        <div className="text-sm font-semibold text-slate-900">
                          {ARCHIVE_MONTHS[visibleArchiveMonth.getMonth()]}
                        </div>
                        <div className="text-xs text-slate-400">
                          {visibleArchiveMonth.getFullYear()}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setVisibleArchiveMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Следующий месяц"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {ARCHIVE_WEEK_DAYS.map((day) => (
                        <div key={day} className="py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {archiveCalendarDays.map((item) => {
                        if (!item.date) {
                          return <div key={item.key} className="h-9" />;
                        }

                        const dateKey = toDateKey(item.date);
                        const isSelected = dateKey === archiveSelectedKey;
                        const isToday = dateKey === archiveTodayKey;

                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleArchiveDatePick(item.date)}
                            className={[
                              'inline-flex h-9 items-center justify-center rounded-xl text-sm font-medium transition',
                              isSelected
                                ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                              isToday && !isSelected ? 'ring-1 ring-inset ring-slate-300' : '',
                            ].join(' ')}
                          >
                            {item.day}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleArchiveDatePick(new Date())}
                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                      >
                        Сегодня
                      </button>

                      <p className="text-xs font-medium text-slate-400">
                        Архив
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hidden text-right sm:block"><p className="text-sm font-medium text-slate-950">{managerName}</p><p className="text-xs text-slate-500">{managerRole}</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">{(managerName || 'M').charAt(0).toUpperCase()}</div>
              <button onClick={handleLogout} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Выход</span></button>
            </div>
          </div>

          <nav className="overflow-x-auto border-t border-slate-100 px-3 sm:px-5 lg:px-7" aria-label="Разделы менеджера">
            <div className="flex h-14 min-w-max items-center gap-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id as ViewType)}
                    className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </header>

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 lg:px-7">
            <div className="mx-auto max-w-[1180px] space-y-5">
              <div className="md:hidden"><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{getPageTitle()}</h1><p className="mt-1 text-sm text-slate-500">{getPageDescription()}</p></div>
              {renderView()}
            </div>
          </main>
        </section>

        <ManagerChatPanel />
      </div>
    </div>
  );
}

export default App;
