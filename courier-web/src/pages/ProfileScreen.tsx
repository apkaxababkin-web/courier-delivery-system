import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = localStorage.getItem('notificationSettings');
      if (saved) {
        setNotifications(JSON.parse(saved));
      }
      const isDark = localStorage.getItem('darkMode') === 'true';
      setDarkMode(isDark);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = (newNotifications: typeof notifications) => {
    localStorage.setItem('notificationSettings', JSON.stringify(newNotifications));
    setNotifications(newNotifications);
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));
    document.documentElement.style.colorScheme = newDarkMode ? 'dark' : 'light';
  };

  const handleLogout = () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      logout();
      onNavigate('tasks');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--foreground)' }}>
          Профиль
        </h2>
        <button
          onClick={() => onNavigate('tasks')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: 'var(--foreground)',
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* Courier info */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ИМЯ КУРЬЕРА
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--foreground)', marginBottom: '12px' }}>
            {courier?.name || 'Не указано'}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ТЕЛЕФОН
          </div>
          <div style={{ fontSize: '14px', color: 'var(--foreground)', marginBottom: '12px' }}>
            {courier?.phone || 'Не указано'}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            ВСЕГО ДОСТАВОК
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--foreground)' }}>
            {courier?.totalDeliveries || 0}
          </div>
        </div>

        {/* Settings */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', marginBottom: '12px' }}>
            ПАРАМЕТРЫ
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <label style={{ fontSize: '14px', color: 'var(--foreground)', fontWeight: '500' }}>
              Тёмный режим
            </label>
            <input
              type="checkbox"
              checked={darkMode}
              onChange={toggleDarkMode}
              style={{ cursor: 'pointer', width: '20px', height: '20px' }}
            />
          </div>
        </div>

        {/* Notifications */}
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', marginBottom: '12px' }}>
            УВЕДОМЛЕНИЯ
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <label style={{ fontSize: '14px', color: 'var(--foreground)', fontWeight: '500' }}>
              Включить уведомления
            </label>
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(e) => saveSettings({ ...notifications, enabled: e.target.checked })}
              style={{ cursor: 'pointer', width: '20px', height: '20px' }}
            />
          </div>

          {notifications.enabled && (
            <>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <label style={{ fontSize: '14px', color: 'var(--foreground)' }}>
                  Новые заявки
                </label>
                <input
                  type="checkbox"
                  checked={notifications.newTasks}
                  onChange={(e) => saveSettings({ ...notifications, newTasks: e.target.checked })}
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <label style={{ fontSize: '14px', color: 'var(--foreground)' }}>
                  Изменение статуса
                </label>
                <input
                  type="checkbox"
                  checked={notifications.statusChanges}
                  onChange={(e) => saveSettings({ ...notifications, statusChanges: e.target.checked })}
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
              }}>
                <label style={{ fontSize: '14px', color: 'var(--foreground)' }}>
                  Сообщения
                </label>
                <input
                  type="checkbox"
                  checked={notifications.messages}
                  onChange={(e) => saveSettings({ ...notifications, messages: e.target.checked })}
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Logout button */}
      <div style={{ padding: '12px', backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--error)',
            color: 'white',
            fontWeight: '600',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Выход
        </button>
      </div>
    </div>
  );
}
