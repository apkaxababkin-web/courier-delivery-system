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
  Search,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import TasksView from './views/TasksView';
import ClientsView from './views/ClientsView';
import HemotestView from './views/HemotestView';
import SberbankView from './views/SberbankView';
import MailsView from './views/MailsView';
import ReportsView from './views/ReportsView';
import CouriersView from './views/CouriersView';
import LoginView from './views/LoginView';

type ViewType = 'tasks' | 'mails' | 'hemotest' | 'sberbank' | 'clients' | 'reports' | 'couriers';

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
        return <TasksView />;
      case 'mails':
        return <MailsView />;
      case 'hemotest':
        return <HemotestView />;
      case 'sberbank':
        return <SberbankView />;
      case 'clients':
        return <ClientsView />;
      case 'reports':
        return <ReportsView />;
      case 'couriers':
        return <CouriersView />;
      default:
        return <TasksView />;
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
        return 'Клиентская база, контакты и история заявок.';
      case 'reports':
        return 'Операционные показатели и выгрузки по доставкам.';
      case 'couriers':
        return 'Курьеры, статусы доступности и текущая загрузка.';
      default:
        return 'Система управления курьерскими заявками.';
    }
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
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
                aria-label="Открыть меню"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="hidden min-w-0 flex-col md:flex">
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                  {getPageTitle()}
                </h1>
                <p className="truncate text-xs text-slate-500">{getPageDescription()}</p>
              </div>
            </div>

            <div className="hidden flex-1 items-center justify-center xl:flex">
              <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <Search className="h-4 w-4" />
                <span className="truncate">Поиск по заявкам, клиентам, адресам...</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-950">{managerName}</p>
                <p className="text-xs text-slate-500">{managerRole}</p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                {(managerName || 'M').charAt(0).toUpperCase()}
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Выход</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1440px] space-y-5">
            <div className="md:hidden">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                {getPageTitle()}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{getPageDescription()}</p>
            </div>

            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
