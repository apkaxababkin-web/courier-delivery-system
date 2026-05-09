import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskListScreen } from './pages/TaskListScreen';
import { TaskDetailScreen } from './pages/TaskDetailScreen';
import { ProfileScreen } from './pages/ProfileScreen';
import { PickupGemotestScreen } from './pages/PickupGemotestScreen';
import { PickupSberbankScreen } from './pages/PickupSberbankScreen';
import { HistoryScreen } from './pages/HistoryScreen';
import './index.css';
import './exact-pickup.css';

export type Screen = 'tasks' | 'task-detail' | 'pickup-gemotest' | 'pickup-sberbank' | 'history' | 'profile';

function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim()) return setError('Введите логин');
    if (!password.trim()) return setError('Введите пароль');

    try {
      setSubmitting(true);
      setError(null);
      await login(username.trim(), password.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный логин или пароль');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-logo">📦</div>
        <h1>Курьер</h1>
        <p>Войдите в свой аккаунт</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Логин</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Введите логин" autoComplete="username" disabled={submitting} />
          </label>
          <label>
            <span>Пароль</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" type="password" autoComplete="current-password" disabled={submitting} />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" disabled={submitting}>{submitting ? 'Вход...' : 'Войти'}</button>
        </form>
      </section>
    </main>
  );
}

function AppContent() {
  const { loading, isAuthenticated } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  if (loading) return <div className="app-loader">Загрузка...</div>;
  if (!isAuthenticated) return <LoginScreen />;

  const handleTaskSelect = (taskId: number) => {
    setSelectedTaskId(taskId);
    setCurrentScreen('task-detail');
  };

  const handleBack = () => {
    setSelectedTaskId(null);
    setCurrentScreen('tasks');
  };

  const handleNavigate = (screen: Screen) => {
    setSelectedTaskId(null);
    setCurrentScreen(screen);
  };

  return (
    <div className="app-shell">
      <div className="app-content">
        {currentScreen === 'tasks' && <TaskListScreen onTaskSelect={handleTaskSelect} />}
        {currentScreen === 'task-detail' && selectedTaskId && <TaskDetailScreen taskId={selectedTaskId} onBack={handleBack} />}
        {currentScreen === 'pickup-gemotest' && <PickupGemotestScreen />}
        {currentScreen === 'pickup-sberbank' && <PickupSberbankScreen />}
        {currentScreen === 'history' && <HistoryScreen onTaskSelect={handleTaskSelect} />}
        {currentScreen === 'profile' && <ProfileScreen onNavigate={handleNavigate} />}
      </div>
      {currentScreen !== 'profile' && <BottomTabBar currentScreen={currentScreen} onNavigate={handleNavigate} />}
    </div>
  );
}

interface BottomTabBarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

function BottomTabBar({ currentScreen, onNavigate }: BottomTabBarProps) {
  const tabs: Array<{ id: Screen; label: string; icon: string }> = [
    { id: 'tasks', label: 'Все заявки', icon: '☷' },
    { id: 'pickup-gemotest', label: 'Гемотест', icon: '🏥' },
    { id: 'pickup-sberbank', label: 'Сбербанк', icon: '🏦' },
    { id: 'history', label: 'История', icon: '🕘' },
  ];

  return (
    <nav className="bottom-tabs safe-area-bottom">
      {tabs.map((tab) => {
        const isActive = currentScreen === tab.id || (currentScreen === 'task-detail' && tab.id === 'tasks');
        return (
          <button key={tab.id} onClick={() => onNavigate(tab.id)} className={isActive ? 'active' : ''}>
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
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
