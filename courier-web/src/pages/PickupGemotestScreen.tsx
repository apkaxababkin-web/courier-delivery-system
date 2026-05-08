import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface PickupPoint {
  id: number;
  name: string;
  address: string;
  phone?: string;
}

interface PickupGemotestScreenProps {
  onNavigate: (screen: string) => void;
}

export function PickupGemotestScreen({ onNavigate }: PickupGemotestScreenProps) {
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
        `/api/trpc/hemotest.points?input=${encodeURIComponent(JSON.stringify({}))}`,
        { withCredentials: true }
      );
      
      const pointsList = response.data?.result?.data?.json || response.data?.result?.data || [];
      setPoints(Array.isArray(pointsList) ? pointsList : []);
    } catch (error) {
      console.error('Failed to load hemotest points:', error);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePointTap = (pointId: number) => {
    const now = Date.now();
    
    // Check if this is a double tap (same point within 500ms)
    if (lastTappedId === pointId && lastTapTime && now - lastTapTime < 500) {
      // Double tap - toggle the point
      setPickedPoints((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(pointId)) {
          newSet.delete(pointId);
        } else {
          newSet.add(pointId);
        }
        return newSet;
      });
      setLastTapTime(null);
      setLastTappedId(null);
    } else {
      // Single tap - highlight it
      setLastTapTime(now);
      setLastTappedId(pointId);
    }
  };

  const pickedCount = pickedPoints.size;
  const totalCount = points.length;

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
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--foreground)' }}>
            Гемотест
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            Забрано: {pickedCount} из {totalCount}
          </div>
        </div>
      </div>

      {/* Points list */}
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
          const isPicked = pickedPoints.has(point.id);
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
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                  marginBottom: '4px',
                }}>
                  {isPicked && '✓ '} {point.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                  {point.address}
                </div>
                {point.phone && (
                  <a
                    href={`tel:${point.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '12px',
                      color: 'var(--primary)',
                      textDecoration: 'none',
                    }}
                  >
                    {point.phone}
                  </a>
                )}
              </div>
              {isPicked && (
                <div style={{
                  fontSize: '20px',
                  color: 'var(--success)',
                  marginLeft: '8px',
                }}>
                  ✓
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div style={{
        padding: '12px',
        backgroundColor: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--muted)',
        textAlign: 'center',
      }}>
        Дважды нажмите на пункт, чтобы отметить как забранный
      </div>
    </div>
  );
}
