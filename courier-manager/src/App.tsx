import { useState, useEffect } from 'react';
import { Package, MapPin, Landmark, Mail, BarChart3, Users, FileText, LogOut } from 'lucide-react';
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

  useEffect(() => {
    const token = localStorage.getItem('managerToken');
    const name = localStorage.getItem('managerName');
    if (token) {
      setIsAuthenticated(true);
      setManagerName(name || 'Менеджер');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('managerToken');
    localStorage.removeItem('managerName');
    setIsAuthenticated(false);
    setManagerName('');
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

  if (!isAuthenticated) {
    return <LoginView onLogin={(token) => {
      setIsAuthenticated(true);
      setManagerName(localStorage.getItem('managerName') || 'Менеджер');
    }} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        menuItems={menuItems as any}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view as ViewType);
        }}
        isOpen={true}
        onClose={() => {}}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {menuItems.find((item) => item.id === activeView)?.label}
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">👤 {managerName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Выход
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {renderView()}
        </div>
      </div>
    </div>
  );
}

export default App;
