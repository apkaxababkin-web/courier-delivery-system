import { useEffect, useState } from 'react';
import * as api from '../lib/api';

type Chat = { id: number; inviteUrl: string; chatId: string | null; enabled: boolean; verifiedAt: string | null };
export function MaxClientChatsField({ clientId }: { clientId: number }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectCommands, setConnectCommands] = useState<Record<number,string>>({});
  const load = async () => { setChats(await api.getMaxClientChats(clientId)); };
  useEffect(() => { let active = true; api.getMaxClientChats(clientId).then(rows => { if (active) setChats(rows); }).catch(e => { if (active) setError(String(e.message || e)); }); return () => { active = false; }; }, [clientId]);
  const add = async () => {
    setBusy(true); setError('');
    try { await api.addMaxClientChat(clientId, link); setLink(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };
  const getCode = async (chat:Chat) => {
    setBusy(true); setError('');
    try {
      const result = await api.createMaxChatConnectCode(clientId,chat.id);
      setConnectCommands(prev => ({...prev,[chat.id]:result.command}));
    } catch(e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally {setBusy(false)}
  };
  const toggle = async (chat: Chat) => {
    setBusy(true); setError('');
    try { await api.setMaxClientChatEnabled(clientId, chat.id, !chat.enabled); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
    <div><p className="text-sm font-semibold text-slate-950">MAX · Чаты клиента</p><p className="text-xs text-slate-500">Добавьте ссылку на групповой чат. Доступ включается только после подтверждения чата ботом.</p></div>
    <div className="flex gap-2"><input aria-label="Ссылка на MAX-чат" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={link} onChange={e => setLink(e.target.value)} placeholder="https://max.ru/…" /><button type="button" disabled={busy || !link.trim()} onClick={add} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">Добавить</button></div>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {chats.map(chat => <div key={chat.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <p className="break-all text-xs text-slate-600">{chat.inviteUrl}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chat.enabled} disabled={busy || !chat.verifiedAt || !chat.chatId} onChange={() => toggle(chat)} /> Разрешить создание заявок</label>
      {!chat.verifiedAt && <div className="space-y-2">
        <button type="button" disabled={busy} onClick={()=>getCode(chat)} className="rounded-lg border border-sky-300 px-3 py-2 text-xs">Получить команду подтверждения</button>
        {connectCommands[chat.id] && <div className="rounded-lg bg-slate-100 p-2 text-xs"><p>Добавьте бота в группу MAX, затем отправьте в группу эту команду (действует 15 минут):</p><code className="block break-all my-2">{connectCommands[chat.id]}</code><button type="button" onClick={()=>navigator.clipboard.writeText(connectCommands[chat.id])}>Копировать команду</button></div>}
      </div>}
      <p className="text-xs text-slate-500">{chat.verifiedAt ? (chat.enabled ? 'Подключён' : 'Подтверждён, выключен') : 'Ожидает подтверждения ботом MAX'}</p>
    </div>)}
  </section>;
}
