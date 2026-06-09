/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface PickupPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
  isPicked?: boolean;
  pickedAt?: string | Date | null;
  courierName?: string;
}

type Screen = 'tasks' | 'task-detail' | 'pickup-gemotest' | 'pickup-sberbank' | 'mails' | 'profile';

interface PickupGemotestScreenProps {
  onNavigate: (screen: Screen) => void;
}

function getCourierDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Irkutsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatPickupMeta(point: PickupPoint) {
  if (!point.isPicked) return '';
  const time = point.pickedAt
    ? new Date(point.pickedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '';
  return [time, point.courierName].filter(Boolean).join(' • ');
}

function unwrapTrpcArray(data: unknown): PickupPoint[] {
  const envelope = data as { result?: { data?: { json?: unknown } | unknown } } | null;
  const result = envelope?.result;
  const resultData = typeof result === 'object' && result !== null && 'data' in result ? result.data : undefined;
  const value = typeof resultData === 'object' && resultData !== null && 'json' in resultData
    ? resultData.json
    : resultData ?? result ?? data;
  return Array.isArray(value) ? value : [];
}

export function PickupGemotestScreen({ onNavigate: _onNavigate }: PickupGemotestScreenProps) {
  void _onNavigate;
  const { token } = useAuth();
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedDate = getCourierDateKey();

  const loadPoints = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/hemotest.pickupPoints?input=${encodeURIComponent(JSON.stringify({ token, date: selectedDate }))}`,
        { withCredentials: true }
      );

      setPoints(unwrapTrpcArray(response.data));
    } catch (error) {
      console.error('Failed to load hemotest pickup points:', error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, token]);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

  useEffect(() => {
    if (!token) return;

    const eventSource = new EventSource('/api/live');
    const refresh = () => {
      loadPoints();
    };

    eventSource.addEventListener('hemotest_changed', refresh);
    eventSource.addEventListener('data_changed', refresh);

    return () => eventSource.close();
  }, [loadPoints, token]);

  const handlePointTap = async (pointId: number) => {
    if (!token) return;
    try {
      await axios.post(
        '/api/trpc/hemotest.togglePickup',
        { json: { token, pointId, date: selectedDate } },
        { withCredentials: true }
      );
      await loadPoints();
    } catch (error) {
      console.error('Failed to toggle hemotest pickup:', error);
    }
  };

  const pickedCount = points.filter((point) => point.isPicked).length;
  const totalCount = points.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--foreground)' }}>
            Гемотест
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            Забрано: {pickedCount} из {totalCount}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
            Загрузка...
          </div>
        )}

        {!loading && points.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏥</div>
            <div>Нет пунктов Гемотеста</div>
          </div>
        )}

        {points.map((point) => {
          const isPicked = !!point.isPicked;
          const pickupMeta = formatPickupMeta(point);
          return (
            <div
              key={point.id}
              onClick={() => handlePointTap(point.id)}
              style={{
                marginBottom: '8px',
                padding: '12px',
                backgroundColor: isPicked ? 'var(--success)' + '15' : 'var(--surface)',
                borderRadius: '8px',
                border: `1px solid ${isPicked ? 'var(--success)' : 'var(--border)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', color: 'var(--foreground)', marginBottom: '4px' }}>
                  <strong>{point.name}</strong>
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> • {point.address}</span>
                </div>
                {point.phone && (
                  <a
                    href={`tel:${point.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none' }}
                  >
                    {point.phone}
                  </a>
                )}
              </div>
              {isPicked && (
                <div style={{ fontSize: '12px', color: 'var(--success)', marginLeft: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  ✓ {pickupMeta}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
