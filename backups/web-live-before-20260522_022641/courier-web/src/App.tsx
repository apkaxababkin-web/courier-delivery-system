import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskListScreen } from './pages/TaskListScreen';
import { TaskDetailScreen } from './pages/TaskDetailScreen';
import { ProfileScreen } from './pages/ProfileScreen';
import { PickupGemotestScreen } from './pages/PickupGemotestScreen';
import { PickupSberbankScreen } from './pages/PickupSberbankScreen';
import { MailsScreen } from './pages/MailsScreen';
import { useState } from 'react';
import './index.css';

type Screen = 'tasks' | 'task-detail' | 'pickup-gemotest' | 'pickup-sberbank' | 'mails' | 'profile';

function AppContent() {
  const { loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="app-loading">
        <div>Загрузка...</div>
      </div>
    );
  }

  const handleTaskSelect = (taskId: number) => {
    setSelectedTaskId(taskId);
    setCurrentScreen('task-detail');
  };

  const handleBack = () => {
    setCurrentScreen('tasks');
    setSelectedTaskId(null);
  };

  const handleNavigate = (screen: Screen) => {
    setSelectedTaskId(null);
    setCurrentScreen(screen);
  };

  return (
    <div className="app-shell">
      <div className="app-content">
        {currentScreen === 'tasks' && (
          <TaskListScreen onTaskSelect={handleTaskSelect} onNavigate={handleNavigate} />
        )}
        {currentScreen === 'task-detail' && selectedTaskId && (
          <TaskDetailScreen taskId={selectedTaskId} onBack={handleBack} />
        )}
        {currentScreen === 'pickup-gemotest' && (
          <PickupGemotestScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === 'pickup-sberbank' && (
          <PickupSberbankScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === 'mails' && <MailsScreen />}
        {currentScreen === 'profile' && (
          <ProfileScreen onNavigate={handleNavigate} />
        )}
      </div>

      {currentScreen !== 'task-detail' && (
        <BottomTabBar currentScreen={currentScreen} onNavigate={handleNavigate} />
      )}
    </div>
  );
}

interface BottomTabBarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

function BottomTabBar({ currentScreen, onNavigate }: BottomTabBarProps) {
  const tabs: Array<{ id: Screen; label: string; icon: string }> = [
    { id: 'tasks', label: 'Все заявки', icon: '📋' },
    { id: 'pickup-gemotest', label: 'Гемотест', icon: '📝' },
    { id: 'pickup-sberbank', label: 'Сбербанк', icon: '🏢' },
    { id: 'mails', label: 'Письма', icon: '📮' },
    { id: 'profile', label: 'Профиль', icon: '👤' },
  ];

  return (
    <div className="bottom-tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
          className={`bottom-tab ${currentScreen === tab.id ? 'bottom-tab-active' : ''}`}
        >
          <div className="bottom-tab-icon">{tab.icon}</div>
          <div className="bottom-tab-label">{tab.label}</div>
        </button>
      ))}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
