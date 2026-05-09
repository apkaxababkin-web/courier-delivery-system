import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Screen } from '../App';

interface ProfileScreenProps {
  onNavigate: (screen: Screen) => void;
}

export function ProfileScreen({ onNavigate }: ProfileScreenProps) {
  const { courier, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTypes, setNotificationTypes] = useState({
    newTasks: true,
    statusChanges: true,
    messages: true,
  });

  useEffect(() => {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setNotificationsEnabled(parsed.enabled ?? true);
      setNotificationTypes(parsed.types ?? { newTasks: true, statusChanges: true, messages: true });
    }

    const isDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, []);

  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify({ enabled: notificationsEnabled, types: notificationTypes }));
  }, [notificationsEnabled, notificationTypes]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
  };

  const handleLogout = () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      localStorage.removeItem('notificationSettings');
      localStorage.removeItem('pushToken');
      logout();
      onNavigate('tasks');
    }
  };

  return (
    <section className="mobile-screen profile-modal-screen">
      <header className="profile-modal-header">
        <h1>Профиль</h1>
        <button onClick={() => onNavigate('tasks')}>✕</button>
      </header>

      <main className="profile-modal-content">
        <section className="profile-exact-card">
          <span>Имя курьера</span>
          <strong>{courier?.name || 'Не загружено'}</strong>
        </section>

        <section className="profile-exact-card">
          <span>Телефон</span>
          <strong>{courier?.phone || '—'}</strong>
        </section>

        <section className="profile-exact-card">
          <span>Всего доставок</span>
          <strong>{courier?.totalDeliveries || 0}</strong>
        </section>

        <div className="profile-section-title">ПАРАМЕТРЫ</div>
        <section className="profile-exact-card profile-switch-card">
          <div>
            <strong>Тёмный режим</strong>
            <small>{darkMode ? 'Включен' : 'Отключен'}</small>
          </div>
          <label className="ios-switch">
            <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
            <span />
          </label>
        </section>

        <div className="profile-section-title">УВЕДОМЛЕНИЯ</div>
        <section className="profile-exact-card profile-switch-card">
          <div>
            <strong>Включить уведомления</strong>
            <small>{notificationsEnabled ? 'Включены' : 'Отключены'}</small>
          </div>
          <label className="ios-switch">
            <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} />
            <span />
          </label>
        </section>

        {notificationsEnabled && (
          <>
            <section className="profile-exact-card profile-switch-card compact">
              <strong>Новые заявки</strong>
              <label className="ios-switch">
                <input type="checkbox" checked={notificationTypes.newTasks} onChange={(event) => setNotificationTypes({ ...notificationTypes, newTasks: event.target.checked })} />
                <span />
              </label>
            </section>
            <section className="profile-exact-card profile-switch-card compact">
              <strong>Изменение статуса</strong>
              <label className="ios-switch">
                <input type="checkbox" checked={notificationTypes.statusChanges} onChange={(event) => setNotificationTypes({ ...notificationTypes, statusChanges: event.target.checked })} />
                <span />
              </label>
            </section>
            <section className="profile-exact-card profile-switch-card compact">
              <strong>Сообщения</strong>
              <label className="ios-switch">
                <input type="checkbox" checked={notificationTypes.messages} onChange={(event) => setNotificationTypes({ ...notificationTypes, messages: event.target.checked })} />
                <span />
              </label>
            </section>
          </>
        )}

        <div className="profile-spacer" />
        <button className="profile-logout-exact" onClick={handleLogout}>Выход</button>
      </main>
    </section>
  );
}
