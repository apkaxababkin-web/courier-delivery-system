import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskListScreen } from './pages/TaskListScreen';
import { TaskDetailScreen } from './pages/TaskDetailScreen';
import { ProfileScreen } from './pages/ProfileScreen';
import { PickupGemotestScreen } from './pages/PickupGemotestScreen';
import { PickupSberbankScreen } from './pages/PickupSberbankScreen';
import { useState } from 'react';
import './index.css';

type Screen = 'tasks' | 'task-detail' | 'pickup-gemotest' | 'pickup-sberbank' | 'profile';

function AppContent() {
  const { loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}>
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
    setCurrentScreen(screen);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
    }}>
      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: '60px' }}>
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
        {currentScreen === 'profile' && (
          <ProfileScreen onNavigate={handleNavigate} />
        )}
      </div>

      {/* Bottom tab bar */}
      <BottomTabBar currentScreen={currentScreen} onNavigate={handleNavigate} />
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
    { id: 'pickup-gemotest', label: 'Гемотест', icon: '🏥' },
    { id: 'pickup-sberbank', label: 'Сбербанк', icon: '🏦' },
    { id: 'profile', label: 'Профиль', icon: '👤' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxWidth: '480px',
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      height: '60px',
      backgroundColor: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
      zIndex: 100,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: currentScreen === tab.id ? 'var(--primary)' : 'var(--muted)',
            fontSize: '12px',
            fontWeight: currentScreen === tab.id ? '600' : '500',
            transition: 'color 0.2s',
          }}
        >
          <div style={{ fontSize: '24px' }}>{tab.icon}</div>
          <div>{tab.label}</div>
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
