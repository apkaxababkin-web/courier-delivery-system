import { useState, useEffect } from 'react';
import { Package, MapPin, Landmark, Mail, BarChart3, Users, FileText, LogOut, UserRound } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TasksView from './views/TasksView';
import ClientsView from './views/ClientsView';
import HemotestView from './views/HemotestView';
import SberbankView from './views/SberbankView';
import MailsView from './views/MailsView';
import ReportsView from './views/ReportsView';
import CouriersView from './views/CouriersView';
import LoginView from './views/LoginView';
import ManagerProfileView from './views/ManagerProfileView';

type ViewType = 'tasks' | 'mails' | 'hemotest' | 'sberbank' | 'clients' | 'reports' | 'archive' | 'couriers' | 'profile';

const menuItems = [
  { id: 'tasks', label: 'Все заявки', icon: Package },
  { id: 'mails', label: 'Письма', icon: Mail },
  { id: 'hemotest', label: 'Гемотест', icon: MapPin },
  { id: 'sberbank', label: 'Сбербанк', icon: Landmark },
  { id: 'clients', label: 'Клиенты', icon: Users },
  { id: 'reports', label: 'Отчёты', icon: BarChart3 },
  { id: 'archive', label: 'Архив', icon: FileText },
  { id: 'couriers', label: 'Курьеры', icon: Users },
];

function App() {
  const [activeView, setActiveView] = useState<ViewType>('tasks');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [managerRole, setManagerRole] = useState('Менеджер');

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
    localStorage.removeItem('managerUsername');
    localStorage.removeItem('managerEmail');
    setIsAuthenticated(false);
    setManagerName('');
    setManagerRole('');
    setActiveView('tasks');
  };

  const handleManagerNameChange = (name: string) => {
    localStorage.setItem('managerName', name);
    setManagerName(name);
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
      case 'profile':
        return <ManagerProfileView managerName={managerName} managerRole={managerRole} onNameChange={handleManagerNameChange} />;
      case 'archive':
        return <TasksView />;
      case 'couriers':
        return <CouriersView />;
      default:
        return <TasksView />;
    }
  };

  const getPageTitle = () => {
    if (activeView === 'profile') return 'Личный кабинет';
    return menuItems.find((item) => item.id === activeView)?.label || 'Все заявки';
  };

  if (!isAuthenticated) {
    return <LoginView onLogin={() => {
      setIsAuthenticated(true);
      setManagerName(localStorage.getItem('managerName') || 'Менеджер');
      setManagerRole(localStorage.getItem('managerRole') || 'Менеджер');
    }} />;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        menuItems={menuItems as any}
        activeView={activeView}
        onViewChange={(view) => setActiveView(view as ViewType)}
        isOpen={true}
        onClose={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden ml-[280px]">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 fixed top-0 right-0 left-[280px] z-30">
          <h1 className="text-xl font-semibold text-gray-900">{getPageTitle()}</h1>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('profile')}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                activeView === 'profile' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-600">
                  {(managerName || 'М').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden text-left sm:flex sm:flex-col">
                <span className="text-sm font-semibold">{managerName || 'Личный кабинет'}</span>
                <span className="text-xs text-gray-500">Личный кабинет</span>
              </div>
              <UserRound className="h-4 w-4" />
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Выход
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto pt-16">
          <div className="p-8">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}

export default App;
