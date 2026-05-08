import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface PickupPoint {
  id: number;
  name: string;
  address: string;
  isPicked: boolean;
  pickedAt: string | Date | null;
  courierName?: string;
}

function unwrapTrpc<T>(data: any): T {
  return data?.result?.data?.json || data?.result?.data || data?.result || data;
}

function formatTime(date: string | Date | null) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function PickupSberbankScreen() {
  const { token } = useAuth();
  const [selectedDate] = useState(new Date());
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pickedCount, setPickedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [lastTapTime, setLastTapTime] = useState(0);

  useEffect(() => {
    loadPoints();
  }, [token]);

  const loadPoints = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const input = { token, date: selectedDate.toISOString() };
      const [pointsResponse, countResponse] = await Promise.all([
        axios.get(`/api/trpc/sberbank.pickupPoints?input=${encodeURIComponent(JSON.stringify(input))}`, { withCredentials: true }),
        axios.get(`/api/trpc/sberbank.pickedCount?input=${encodeURIComponent(JSON.stringify(input))}`, { withCredentials: true }),
      ]);
      const pointsList = unwrapTrpc<PickupPoint[]>(pointsResponse.data);
      const count = unwrapTrpc<number>(countResponse.data);
      setPoints(Array.isArray(pointsList) ? pointsList : []);
      setPickedCount(typeof count === 'number' ? count : 0);
    } catch (error) {
      console.error('Failed to load sberbank pickup points:', error);
      setPoints([]);
      setPickedCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePickup = async (pointId: number) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;

    if (selectedPointId !== pointId || timeSinceLastTap > 500) {
      setSelectedPointId(pointId);
      setLastTapTime(now);
      return;
    }

    if (!token) return;
    try {
      await axios.post('/api/trpc/sberbank.togglePickup', { json: { token, pointId, date: selectedDate.toISOString() } }, { withCredentials: true });
      setSelectedPointId(null);
      await loadPoints();
    } catch (error) {
      console.error('Failed to toggle sberbank pickup:', error);
    }
  };

  return (
    <section className="mobile-screen pickup-exact-screen">
      <header className="pickup-exact-header">
        <h1>Сбербанк</h1>
        <p>Забрано: {pickedCount} из {points.length}</p>
      </header>

      {points.length > 0 ? (
        <main className="pickup-exact-list">
          {points.map((point) => {
            const selected = selectedPointId === point.id;
            return (
              <button
                key={point.id}
                className={`pickup-exact-row ${point.isPicked ? 'picked' : ''} ${selected ? 'selected' : ''}`}
                onClick={() => handleTogglePickup(point.id)}
              >
                <div className="pickup-row-left">
                  <span className="telegram-checkbox">{point.isPicked ? '✓' : ''}</span>
                  <div className="pickup-row-info">
                    <strong>{point.name}</strong>
                    <p>{point.address}</p>
                  </div>
                </div>
                {point.isPicked && point.courierName ? (
                  <div className="pickup-row-meta">
                    <span>{formatTime(point.pickedAt)}</span>
                    <span>{point.courierName}</span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </main>
      ) : loading ? (
        <div className="pickup-exact-empty">Загрузка...</div>
      ) : (
        <div className="pickup-exact-empty">Нет точек сбора</div>
      )}
    </section>
  );
}
