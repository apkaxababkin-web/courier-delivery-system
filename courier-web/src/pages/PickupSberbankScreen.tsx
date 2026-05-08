import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface PickupPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
}

export function PickupSberbankScreen() {
  const { token } = useAuth();
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pickedPoints, setPickedPoints] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [lastTapTime, setLastTapTime] = useState<number | null>(null);
  const [lastTappedId, setLastTappedId] = useState<number | null>(null);

  useEffect(() => {
    loadPoints();
  }, [token]);

  const loadPoints = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/sberbank.points?input=${encodeURIComponent(JSON.stringify({}))}`,
        { withCredentials: true }
      );
      const pointsList = response.data?.result?.data?.json || response.data?.result?.data || [];
      setPoints(Array.isArray(pointsList) ? pointsList : []);
    } catch (error) {
      console.error('Failed to load sberbank points:', error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePointTap = (pointId: number) => {
    const now = Date.now();
    if (lastTappedId === pointId && lastTapTime && now - lastTapTime < 500) {
      setPickedPoints((prev) => {
        const next = new Set(prev);
        if (next.has(pointId)) next.delete(pointId);
        else next.add(pointId);
        return next;
      });
      setLastTapTime(null);
      setLastTappedId(null);
    } else {
      setLastTapTime(now);
      setLastTappedId(pointId);
    }
  };

  return (
    <section className="mobile-screen pickup-screen">
      <header className="pickup-header">
        <div>
          <div className="pickup-icon">🏦</div>
          <h1>Сбербанк</h1>
          <p>Забрано: {pickedPoints.size} из {points.length}</p>
        </div>
        <button onClick={loadPoints} disabled={loading}>↻</button>
      </header>

      <main className="pickup-content">
        {loading && points.length === 0 ? (
          <div className="empty-state">
            <div className="loader-dot" />
            <strong>Загрузка...</strong>
          </div>
        ) : null}

        {!loading && points.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏦</div>
            <strong>Нет пунктов Сбербанка</strong>
            <span>Обновите список или проверьте настройки в панели менеджера</span>
          </div>
        ) : null}

        <div className="pickup-list">
          {points.map((point) => {
            const isPicked = pickedPoints.has(point.id);
            return (
              <button
                key={point.id}
                className={`pickup-card ${isPicked ? 'picked' : ''}`}
                onClick={() => handlePointTap(point.id)}
              >
                <div>
                  <strong>{isPicked ? '✓ ' : ''}{point.name}</strong>
                  <p>📍 {point.address}</p>
                  {point.phone && (
                    <a href={`tel:${point.phone}`} onClick={(event) => event.stopPropagation()}>📞 {point.phone}</a>
                  )}
                </div>
                <span className="pickup-check">{isPicked ? '✓' : '○'}</span>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="pickup-footer">Дважды нажмите на пункт, чтобы отметить как забранный</footer>
    </section>
  );
}
