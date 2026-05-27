import { useState, useEffect } from 'react';
import {
  Package,
  MapPin,
  Landmark,
  Mail,
  BarChart3,
  Users,
  LogOut,
  Menu,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import TasksView from './views/TasksView';
import ClientsView from './views/ClientsViewV2';
import HemotestView from './views/HemotestView';
import SberbankView from './views/SberbankView';
import MailsView from './views/MailsView';
import ReportsView from './views/ReportsView';
import CouriersView from './views/CouriersView';
import LoginView from './views/LoginView';

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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatArchiveDate(date: string) {
  if (!date) return 'Сегодня';
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;

  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

const menuItems = [
  { id: 'tasks', label: 'Все заявки', icon: Package },
  { id: 'mails', label: 'Письма', icon: Mail },
  { id: 'hemotest', label: 'Гемотест', icon: MapPin },
  { id: 'sberbank', label: 'Сбербанк', icon: Landmark },
  { id: 'clients', label: 'Клиенты', icon: Users },
  { id: 'reports', label: 'Отчёты', icon: BarChart3 },
  { id: 'couriers', label: 'Курьеры', icon: Users },
];

function App() {
  const [activeView, setActiveView] = useState<ViewType>('tasks');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [managerRole, setManagerRole] = useState('Менеджер');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [archiveDate, setArchiveDate] = useState(getTodayDate());
  const [isArchiveCalendarOpen, setIsArchiveCalendarOpen] = useState(false);
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
        return 'Клиенты, магазины, точки и будущие кабинеты руководителей.';
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
      <Sidebar
        menuItems={menuItems as any}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view as ViewType);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-h-screen flex-col lg:pl-[280px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button type="button" onClick={() => setIsSidebarOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Открыть меню"><Menu className="h-5 w-5" /></button>
              <div className="hidden min-w-0 flex-col md:flex"><h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{getPageTitle()}</h1><p className="truncate text-xs text-slate-500">{getPageDescription()}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                {isArchiveCalendarOpen ? (
                  <button
                    type="button"
                    aria-label="Закрыть календарь архива"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    onClick={() => setIsArchiveCalendarOpen(false)}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    const selected = parseDateKey(archiveDate);
                    setVisibleArchiveMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
                    setIsArchiveCalendarOpen((value) => !value);
                  }}
                  className="relative z-50 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <span className="hidden whitespace-nowrap capitalize sm:inline">{formatArchiveDate(archiveDate)}</span>
                  <span className="whitespace-nowrap sm:hidden">Дата</span>
                </button>

                {isArchiveCalendarOpen ? (
                  <div className="absolute right-0 top-12 z-50 w-[304px] rounded-[24px] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15">
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
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1440px] space-y-5">
            <div className="md:hidden"><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{getPageTitle()}</h1><p className="mt-1 text-sm text-slate-500">{getPageDescription()}</p></div>
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
