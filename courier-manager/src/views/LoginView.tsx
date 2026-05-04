import { useState } from 'react';
import { LogIn } from 'lucide-react';

interface LoginViewProps {
  onLogin: (token: string) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const apiUrl = '/api/trpc/managerAuth.login';
      const payload = {
        json: {
          username,
          password,
        },
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('API Error:', response.status, errorData);
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const data = await response.json();
      
      const token = data.result?.data?.json?.token || data.result?.data?.token;
      const manager = data.result?.data?.json?.manager || data.result?.data?.manager;
      
      if (token && manager) {
        localStorage.setItem('managerToken', token);
        localStorage.setItem('managerName', manager.name || username);
        onLogin(token);
      } else {
        throw new Error('Неверные учётные данные');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при входе';
      console.error('Login error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const apiUrl = '/api/trpc/managerAuth.getDemoToken';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const data = await response.json();
      const token = data.result?.data?.json?.token;
      const manager = data.result?.data?.json?.manager;
      
      if (token && manager) {
        localStorage.setItem('managerToken', token);
        localStorage.setItem('managerName', manager.name);
        onLogin(token);
      } else {
        throw new Error('Не удалось получить демо-токен');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка при входе';
      console.error('Demo login error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full">
            <LogIn className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          КурьерПро
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Система управления доставками
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Имя пользователя
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="manager"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="manager123"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? 'Загрузка...' : 'Войти как демо-менеджер'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 font-semibold mb-2">Тестовые учётные данные:</p>
          <p className="text-xs text-gray-600">
            <strong>Пользователь:</strong> manager<br />
            <strong>Пароль:</strong> manager123
          </p>
        </div>
      </div>
    </div>
  );
}
