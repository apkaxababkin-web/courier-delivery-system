import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { managerFetch } from '../lib/api';

export type OrganizationKind = 'client' | 'partner' | 'transport' | 'correspondenceClient';
export type LogoChange = File | 'delete' | null;
const base = '/api/manager/organization-logos';
let versions: Record<string, string> = {}, loadedToken: string | null = null;
let pending: Promise<void> | null = null;
let indexError = '';
const listeners = new Set<() => void>();
// Share decoded image URLs between components and page visits within the same login.
// Never share cached protected images across manager tokens.
const logoCache = new Map<string, string>();
const logoRequests = new Map<string, Promise<string>>();
let logoCacheToken: string | null = null;
function resetLogoCache() {
  for (const url of logoCache.values()) URL.revokeObjectURL(url);
  logoCache.clear();
  logoRequests.clear();
}
function ensureLogoCacheToken(token: string | null) {
  if (token !== logoCacheToken) { resetLogoCache(); logoCacheToken = token; }
}
function getLogoUrl(kind: OrganizationKind, id: number, revision: string, retry = 0): Promise<string> {
  const token = localStorage.getItem('managerToken');
  ensureLogoCacheToken(token);
  const key = `${kind}-${id}-${revision}`;
  if (retry) {
    const old = logoCache.get(key);
    if (old) URL.revokeObjectURL(old);
    logoCache.delete(key);
    logoRequests.delete(key);
  }
  const cached = logoCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = logoRequests.get(key);
  if (existing) return existing;
  const request = managerFetch(`${base}/${kind}/${id}?v=${revision}`, { cache: 'default' })
    .then(async response => {
      if (!response.ok) throw new Error('Не удалось загрузить логотип');
      const blob = await response.blob();
      if (localStorage.getItem('managerToken') !== token || logoCacheToken !== token) throw new Error('Сессия изменилась');
      const url = URL.createObjectURL(blob);
      logoCache.set(key, url);
      // Bound memory usage; revoked URLs are recreated when next needed.
      while (logoCache.size > 128) {
        const first = logoCache.keys().next().value;
        if (!first) break;
        const old = logoCache.get(first);
        logoCache.delete(first);
        logoRequests.delete(first);
        if (old) URL.revokeObjectURL(old);
      }
      return url;
    })
    .finally(() => { if (logoRequests.get(key) === request) logoRequests.delete(key); });
  logoRequests.set(key, request);
  return request;
}

function notify() { versions = { ...versions }; listeners.forEach(fn => fn()); }
async function loadIndex() {
  const token = localStorage.getItem('managerToken');
  if (token !== loadedToken) { ensureLogoCacheToken(token); loadedToken = token; versions = {}; pending = null; notify(); }
  if (!token || pending) return pending;
  const requestToken = token;
  pending = managerFetch(base, { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Не удалось загрузить логотипы');
    const data = await response.json();
    if (localStorage.getItem('managerToken') === requestToken) { versions = data.logos || {}; notify(); }
    indexError = '';
  }).catch(() => { pending = null; indexError = 'Не удалось загрузить логотипы. Повторите попытку.'; notify(); });
  return pending;
}
window.addEventListener('storage', event => { if (event.key === 'managerToken' || event.key === 'organizationLogosRevision' || event.key === null) { pending = null; void loadIndex(); } });
window.addEventListener('focus', () => { pending = null; void loadIndex(); });
export async function saveOrganizationLogo(kind: OrganizationKind, id: number, change: LogoChange) {
  if (!change) return;
  const response = await managerFetch(`${base}/${kind}/${id}`, change === 'delete'
    ? { method: 'DELETE' }
    : { method: 'PUT', headers: { 'Content-Type': change.type || (change.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream') }, body: change });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Не удалось сохранить логотип. Данные организации сохранены; повторите сохранение логотипа.');
  if (change === 'delete') delete versions[`${kind}-${id}`]; else versions[`${kind}-${id}`] = data.version;
  notify();
  try { localStorage.setItem('organizationLogosRevision', `${Date.now()}-${Math.random()}`); } catch { /* Cross-tab refresh is optional. */ }
}
function useLogo(kind: OrganizationKind, id: number | null) {
  const snapshot = useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => versions);
  const revision = id ? snapshot[`${kind}-${id}`] : undefined;
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { void loadIndex(); }, [kind, id]);
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('managerToken');
    ensureLogoCacheToken(token);
    const key = id && revision ? `${kind}-${id}-${revision}` : '';
    setSrc(key ? logoCache.get(key) || '' : ''); setError('');
    if (id && revision) void getLogoUrl(kind, id, revision, attempt)
      .then(url => { if (active && localStorage.getItem('managerToken') === token) setSrc(url); })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [kind, id, revision, attempt]);
  return { src, error: error || indexError, retry: () => { setAttempt(value => value + 1); pending = null; void loadIndex(); } };
}

export function OrganizationLogo({ kind, id, name }: { kind: OrganizationKind; id: number; name: string }) {
  const { src } = useLogo(kind, id);
  return src ? <img src={src} alt={`Логотип ${name}`} className="inline-block h-10 w-16 shrink-0 object-contain align-middle mr-2" /> : null;
}

/** Crop is rendered into a new PNG only after the user clicks Apply. */
function LogoCropEditor({ source, onApply, onCancel }: { source: string; onApply: (file: File) => void; onCancel: () => void }) {
  const [zoom, setZoom] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [boxWidth, setBoxWidth] = useState(160);
  const [boxHeight, setBoxHeight] = useState(100);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imageRef.current = img; setNatural({ width: img.naturalWidth, height: img.naturalHeight }); setOffset({ x: 0, y: 0 }); setZoom(100); };
    img.onerror = () => setError('Не удалось открыть изображение');
    img.src = source;
    return () => { imageRef.current = null; img.onload = null; img.onerror = null; };
  }, [source]);
  const contain = Math.min(boxWidth / natural.width, boxHeight / natural.height);
  const factor = contain * zoom / 100;
  const iw = natural.width * factor, ih = natural.height * factor;
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (working) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const d = drag.current;
    setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
  };
  const apply = async () => {
    const img = imageRef.current;
    if (!img) return;
    setWorking(true); setError('');
    try {
      // 2x output resolution for crisp cards; transparent padding is retained.
      const canvas = document.createElement('canvas');
      canvas.width = boxWidth * 2; canvas.height = boxHeight * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas недоступен');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, (boxWidth / 2 + offset.x - iw / 2) * 2, (boxHeight / 2 + offset.y - ih / 2) * 2, iw * 2, ih * 2);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось подготовить PNG')), 'image/png'));
      if (blob.size > 5 * 1024 * 1024) throw new Error('Результат превышает 5 МБ. Уменьшите область.');
      onApply(new File([blob], 'organization-logo-adjusted.png', { type: 'image/png' }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось применить настройки'); }
    finally { setWorking(false); }
  };
  const button = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50';
  return <div className="rounded-xl border border-sky-200 bg-slate-50 p-3 space-y-3">
    <div className="text-sm font-semibold text-slate-800">Подгонка логотипа</div>
    <p className="text-xs text-slate-500">Перетащите изображение. Измените масштаб и размер области. После применения сохраните организацию.</p>
    <div className="flex justify-center overflow-auto rounded-xl bg-slate-200 p-3">
      <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onWheel={e => { if (e.cancelable) e.preventDefault(); setZoom(v => Math.max(25, Math.min(400, v + (e.deltaY < 0 ? 10 : -10)))); }}
        role="img" aria-label="Область подгонки логотипа: перетаскивайте изображение мышью"
        className="relative overflow-hidden border-2 border-dashed border-sky-500 bg-white touch-none cursor-grab select-none"
        style={{ width: boxWidth, height: boxHeight, flexShrink: 0 }}>
        <img src={source} alt="Редактируемый логотип" draggable={false} className="absolute max-w-none pointer-events-none select-none"
          style={{ width: iw, height: ih, left: boxWidth / 2 + offset.x - iw / 2, top: boxHeight / 2 + offset.y - ih / 2 }} />
      </div>
    </div>
    <label className="block text-xs text-slate-700">Масштаб: {zoom}%
      <input type="range" min="25" max="400" step="5" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="mt-1 w-full" />
    </label>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-slate-700">Ширина области, px
        <input type="number" min="48" max="400" step="4" value={boxWidth} onChange={e => setBoxWidth(Math.max(48, Math.min(400, Number(e.target.value) || 48)))} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <label className="text-xs text-slate-700">Высота области, px
        <input type="number" min="32" max="300" step="4" value={boxHeight} onChange={e => setBoxHeight(Math.max(32, Math.min(300, Number(e.target.value) || 32)))} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => { setZoom(100); setOffset({ x: 0, y: 0 }); }}>Вписать</button>
      <button type="button" className={button} onClick={() => { setZoom(Math.min(400, Math.round(Math.max(boxWidth / natural.width, boxHeight / natural.height) / contain * 100))); setOffset({ x: 0, y: 0 }); }}>Заполнить</button>
      <button type="button" className={button} onClick={() => setOffset({ x: 0, y: 0 })}>По центру</button>
      <button type="button" className={button} onClick={() => { setZoom(100); setOffset({ x: 0, y: 0 }); setBoxWidth(160); setBoxHeight(100); }}>Сбросить</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex gap-2">
      <button type="button" disabled={working} className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => { void apply(); }}>{working ? 'Обработка…' : 'Применить подгонку'}</button>
      <button type="button" className={button} onClick={onCancel}>Отмена</button>
    </div>
  </div>;
}

export function OrganizationLogoField({ kind, id, change, onChange, disabled = false }: { kind: OrganizationKind; id: number | null; change: LogoChange; onChange: (change: LogoChange) => void; disabled?: boolean }) {
  const { src, error: loadError, retry } = useLogo(kind, id);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!(change instanceof File)) { setPreview(''); return; }
    const url = URL.createObjectURL(change); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [change]);
  const displayed = change === 'delete' ? '' : preview || src;
  useEffect(() => { setEditing(false); }, [kind, id]);
  return <fieldset disabled={disabled} className="rounded-2xl border border-slate-200 p-3 space-y-2">
    <legend className="text-sm font-medium">Логотип организации</legend>
    {displayed && <img src={displayed} alt="Предпросмотр логотипа" className="h-20 w-full object-contain" onError={() => setError('Не удалось показать изображение. Выберите другой файл.')} />}
    {displayed && !editing && <button type="button" className="rounded-lg border border-sky-300 px-3 py-2 text-sm text-sky-700" onClick={() => setEditing(true)}>Подогнать размер и положение</button>}
    {displayed && editing && <LogoCropEditor source={displayed} onCancel={() => setEditing(false)} onApply={file => { onChange(file); setEditing(false); setError(''); }} />}
    <label className="block text-xs text-slate-600">PNG, JPG, WebP или SVG · до 5 МБ
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full mt-2" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        if (!file.size || file.size > 5 * 1024 * 1024 || (!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type) && !(file.type === '' && /\.svg$/i.test(file.name)))) { setError('Выберите PNG, JPG, WebP или SVG до 5 МБ'); return; }
        setError(''); setConfirmDelete(false); setEditing(true); onChange(file);
      }} />
    </label>
    {displayed && !confirmDelete && <button type="button" className="text-sm text-red-600" onClick={() => setConfirmDelete(true)}>Удалить логотип</button>}
    {confirmDelete && <div className="text-sm">Удалить логотип при сохранении? <button type="button" onClick={() => { onChange('delete'); setConfirmDelete(false); setEditing(false); setError(''); }}>Да, удалить</button> · <button type="button" onClick={() => setConfirmDelete(false)}>Отмена</button></div>}
    {change && <div className="text-xs text-slate-500">Изменение применится при сохранении организации. <button type="button" onClick={() => { onChange(null); setEditing(false); setError(''); }}>Отменить изменение</button></div>}
    {(error || loadError) && <p role="alert" className="text-sm text-red-600">{error || loadError}</p>}
    {loadError && <button type="button" onClick={retry}>Повторить загрузку</button>}
  </fieldset>;
}
