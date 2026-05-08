import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ProfileScreenProps {
  onNavigate: (screen: string) => void;
}

export function ProfileScreen({ onNavigate }: ProfileScreenProps) {
  const { courier, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState({
    enabled: true,
    newTasks: true,
    statusChanges: true,
    messages: true,
  });

  useEffect(() => {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) setNotifications(JSON.parse(saved));

    const isDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, []);

  const saveSettings = (next: typeof notifications) => {
    localStorage.setItem('notificationSettings', JSON.stringify(next));
    setNotifications(next);
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
  };

  const handleLogout = () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      logout();
      onNavigate('tasks');
    }
  };

  return (
    <section className="mobile-screen profile-screen">
      <header className="profile-hero">
        <div className="profile-avatar">👤</div>
        <div>
          <h1>{courier?.name || 'Курьер'}</h1>
          <p>{courier?.isActive ? 'Активный аккаунт' : 'Аккаунт курьера'}</p>
        </div>
      </header>

      <main className="profile-content">
        <div className="profile-stats">
          <section className="profile-stat-card">
            <span>Доставок</span>
            <strong>{courier?.totalDeliveries || 0}</strong>
          </section>
          <section className="profile-stat-card">
            <span>Транспорт</span>
            <strong>{courier?.vehicleType || '—'}</strong>
          </section>
        </div>

        <section className="detail-card profile-info-card">
          <span className="section-label">Данные курьера</span>
          <div className="profile-row">
            <span>Логин</span>
            <strong>{courier?.username || '—'}</strong>
          </div>
          <div className="profile-row">
            <span>Телефон</span>
            <strong>{courier?.phone || 'Не указано'}</strong>
          </div>
          <div className="profile-row">
            <span>Статус</span>
            <strong>{courier?.isActive ? 'Активен' : 'Неактивен'}</strong>
          </div>
        </section>

        <section className="detail-card profile-info-card">
          <span className="section-label">Параметры</span>
          <label className="profile-switch-row">
            <span>Тёмный режим</span>
            <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          </label>
        </section>

        <section className="detail-card profile-info-card">
          <span className="section-label">Уведомления</span>
          <label className="profile-switch-row">
            <span>Включить уведомления</span>
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(event) => saveSettings({ ...notifications, enabled: event.target.checked })}
            />
          </label>
          {notifications.enabled && (
            <>
              <label className="profile-switch-row">
                <span>Новые заявки</span>
                <input
                  type="checkbox"
                  checked={notifications.newTasks}
                  onChange={(event) => saveSettings({ ...notifications, newTasks: event.target.checked })}
                />
              </label>
              <label className="profile-switch-row">
                <span>Изменение статуса</span>
                <input
                  type="checkbox"
                  checked={notifications.statusChanges}
                  onChange={(event) => saveSettings({ ...notifications, statusChanges: event.target.checked })}
                />
              </label>
              <label className="profile-switch-row">
                <span>Сообщения</span>
                <input
                  type="checkbox"
                  checked={notifications.messages}
                  onChange={(event) => saveSettings({ ...notifications, messages: event.target.checked })}
                />
              </label>
            </>
          )}
        </section>

        <button className="logout-button" onClick={handleLogout}>Выйти</button>
      </main>
    </section>
  );
}
