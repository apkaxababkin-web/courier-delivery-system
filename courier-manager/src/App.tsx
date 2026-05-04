import { useState, useEffect } from 'react';
import { Package, MapPin, Landmark, Mail, BarChart3, Users, FileText, LogOut, Home, Settings } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TasksView from './views/TasksView';
import ClientsView from './views/ClientsView';
import HemotestView from './views/HemotestView';
import SberbankView from './views/SberbankView';
import MailsView from './views/MailsView';
import ReportsView from './views/ReportsView';
import CouriersView from './views/CouriersView';
import LoginView from './views/LoginView';

type ViewType = 'tasks' | 'mails' | 'hemotest' | 'sberbank' | 'clients' | 'reports' | 'archive' | 'couriers';

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
    setIsAuthenticated(false);
    setManagerName('');
    setManagerRole('');
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
      case 'archive':
        return <TasksView />; // TODO: Create ArchiveView
      case 'couriers':
        return <CouriersView />;
      default:
        return <TasksView />;
    }
  };

  const getPageTitle = () => {
    return menuItems.find((item) => item.id === activeView)?.label || 'Все заявки';
  };

  if (!isAuthenticated) {
    return <LoginView onLogin={(token) => {
      setIsAuthenticated(true);
      setManagerName(localStorage.getItem('managerName') || 'Менеджер');
      setManagerRole(localStorage.getItem('managerRole') || 'Менеджер');
    }} />;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <Sidebar
        menuItems={menuItems as any}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view as ViewType);
        }}
        isOpen={true}
        onClose={() => {}}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden ml-[280px]">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 fixed top-0 right-0 left-[280px] z-30">
          <h1 className="text-xl font-semibold text-gray-900">
            {getPageTitle()}
          </h1>
          
          <div className="flex items-center gap-6">
            {/* User info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-600">
                  {managerName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">{managerName}</span>
                <span className="text-xs text-gray-500">{managerRole}</span>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Выход
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-auto pt-16">
          <div className="p-8">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
