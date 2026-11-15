import { useEffect, useState } from 'react';
import * as api from '../lib/api';

type Courier = { id: number; name: string; isActive?: boolean };
type Route = api.HemotestDailyRoute;
const emptyRoutes = (): [Route, Route] => [
  { number: 1, courierId: null, isFrozen: false, pointIds: [] },
  { number: 2, courierId: null, isFrozen: false, pointIds: [] },
];

export default function HemotestRoutesEditor({ date, points, refreshKey }: {
  date: string;
  points: api.HemotestRoutePoint[];
  refreshKey: number;
}) {
  const [routes, setRoutes] = useState<[Route, Route]>(emptyRoutes);
  const [unassigned, setUnassigned] = useState<number[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setDirty(false);
    setError('');
    Promise.all([
      api.getHemotestDailyRoutes(date),
      api.managerFetch('/api/manager/couriers').then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить курьеров');
        return response.json() as Promise<Courier[]>;
      }),
    ]).then(([data, people]) => {
      if (!active) return;
      setRoutes(data.routes);
      setUnassigned(data.unassignedPointIds);
      setCouriers(people.filter((person) => person.isActive !== false));
      setLoaded(true);
    }).catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [date, refreshKey]);

  const pointById = new Map(points.map((point) => [point.id, point]));
  const change = (next: [Route, Route], pending = unassigned) => {
    setRoutes(next);
    setUnassigned(pending);
    setDirty(true);
    setMessage('');
  };
  const updateRoute = (index: 0 | 1, patch: Partial<Route>) => {
    const next: [Route, Route] = [{ ...routes[0] }, { ...routes[1] }];
    next[index] = { ...next[index], ...patch };
    change(next);
  };
  const move = (id: number, destination: 0 | 1 | 2, at?: number) => {
    const source = routes.find((route) => route.pointIds.includes(id));
    if (source?.isFrozen || (destination !== 2 && routes[destination].isFrozen)) return;
    const next: [Route, Route] = [
      { ...routes[0], pointIds: routes[0].pointIds.filter((value) => value !== id) },
      { ...routes[1], pointIds: routes[1].pointIds.filter((value) => value !== id) },
    ];
    const pending = unassigned.filter((value) => value !== id);
    if (destination === 2) pending.push(id);
    else next[destination].pointIds.splice(at ?? next[destination].pointIds.length, 0, id);
    change(next, pending);
  };
  const autoDistribute = () => {
    if (routes.some((route) => route.isFrozen)) return;
    const next: [Route, Route] = [
      { ...routes[0], pointIds: [...routes[0].pointIds] },
      { ...routes[1], pointIds: [...routes[1].pointIds] },
    ];
    unassigned.forEach((id) => {
      const index = next[0].pointIds.length <= next[1].pointIds.length ? 0 : 1;
      next[index].pointIds.push(id);
    });
    change(next, []);
  };
  const unfreeze = async (routeNumber: 1 | 2) => {
    if (!window.confirm(`Разморозить маршрут №${routeNumber}?`)) return;
    try {
      setBusy(true);
      setError('');
      await api.unfreezeHemotestDailyRoute(date, routeNumber);
      const data = await api.getHemotestDailyRoutes(date);
      setRoutes(data.routes);
      setUnassigned(data.unassignedPointIds);
      setDirty(false);
      setMessage(`Маршрут №${routeNumber} разморожен.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось разморозить маршрут');
    } finally { setBusy(false); }
  };
  const save = async () => {
    try {
      setBusy(true);
      setError('');
      await api.saveHemotestDailyRoutes(date, routes);
      const data = await api.getHemotestDailyRoutes(date);
      setRoutes(data.routes);
      setUnassigned(data.unassignedPointIds);
      setDirty(false);
      setMessage('Маршруты сохранены на сервере.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить маршруты');
    } finally { setBusy(false); }
  };

  const renderPoint = (id: number, source: 0 | 1 | 2, index: number) => {
    const point = pointById.get(id);
    if (!point) return null;
    const frozen = source !== 2 && routes[source].isFrozen;
    return (
      <div key={id} draggable={!frozen} onDragStart={() => setDragged(id)}
        onDragEnd={() => setDragged(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (dragged !== null && dragged !== id) move(dragged, source, index);
          setDragged(null);
        }}
        className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm">
        <span className="w-5 text-slate-400">{index + 1}.</span>
        <span className="min-w-0 flex-1" title={point.address}>
          <span className="block truncate font-medium">{point.name}</span>
          <span className="block truncate text-xs text-slate-500">{point.address}</span>
        </span>
        {source !== 2 && !frozen && <>
          <button type="button" title="Выше" disabled={index === 0}
            onClick={() => move(id, source, index - 1)}>↑</button>
          <button type="button" title="Ниже" disabled={index === routes[source].pointIds.length - 1}
            onClick={() => move(id, source, index + 1)}>↓</button>
        </>}
        <select aria-label={`Переместить ${point.name}`}
          disabled={frozen || (source === 2 && routes.every((route) => route.isFrozen))}
          value={source} onChange={(event) => move(id, Number(event.target.value) as 0 | 1 | 2)}
          className="max-w-24 rounded border border-slate-200 bg-white p-1 text-xs">
          <option value={2}>Без маршрута</option>
          <option value={0} disabled={routes[0].isFrozen && source !== 0}>Маршрут 1</option>
          <option value={1} disabled={routes[1].isFrozen && source !== 1}>Маршрут 2</option>
        </select>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Маршруты Гемотест · {date}</h3>
        <div className="flex gap-2">
          <button type="button" disabled={!loaded || busy || !unassigned.length || routes.some((route) => route.isFrozen)}
            onClick={autoDistribute} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">Распределить автоматически</button>
          <button type="button" disabled={!loaded || busy || !dirty} onClick={() => void save()}
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {busy ? 'Сохранение...' : 'Сохранить маршруты'}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-2 text-sm text-green-700">{message}</p>}
      {dirty && <p className="mb-2 text-xs text-amber-700">Есть несохранённые изменения.</p>}
      {!loaded ? <p className="text-sm text-slate-500">Загрузка маршрутов...</p> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          {([0, 1] as const).map((index) => (
            <div key={index} onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); if (dragged !== null) move(dragged, index); setDragged(null); }}
              className="min-h-32 rounded-xl border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <strong>Маршрут №{index + 1}</strong>
                {routes[index].isFrozen && <button type="button" disabled={busy || dirty}
                  onClick={() => void unfreeze((index + 1) as 1 | 2)}
                  className="text-xs text-amber-700 underline">Разморозить</button>}
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={routes[index].isFrozen}
                    disabled={routes[index].isFrozen}
                    onChange={(event) => updateRoute(index, { isFrozen: event.target.checked })} />
                  Заморозить
                </label>
              </div>
              <select aria-label={`Курьер маршрута ${index + 1}`} value={routes[index].courierId ?? ''}
                disabled={routes[index].isFrozen}
                onChange={(event) => updateRoute(index, { courierId: event.target.value ? Number(event.target.value) : null })}
                className="mb-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm">
                <option value="">Курьер не назначен</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}
                    disabled={routes[1 - index].courierId === courier.id}>{courier.name}</option>
                ))}
              </select>
              {routes[index].pointIds.map((id, position) => renderPoint(id, index, position))}
              {routes[index].pointIds.length === 0 && <p className="text-xs text-slate-400">Перетащите сюда точки</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); if (dragged !== null) move(dragged, 2); setDragged(null); }}>
          <strong className="text-sm">Без маршрута ({unassigned.length})</strong>
          {unassigned.map((id, index) => renderPoint(id, 2, index))}
        </div>
      </>}
    </section>
  );
}
