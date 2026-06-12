import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Minus, Send, Trash2, X } from 'lucide-react';
import {
  deleteChatMessage,
  getChatMessages,
  sendChatMessage,
  type ChatMessage,
} from '../lib/api';

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

type ManagerChatProps = {
  managerName: string;
};

export default function ManagerChat({ managerName }: ManagerChatProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastRefreshAtRef = useRef(0);
  const isRefreshingRef = useRef(false);

  const refresh = useCallback(async (showLoader = false) => {
    const now = Date.now();
    if (!showLoader && now - lastRefreshAtRef.current < 500) return;
    if (isRefreshingRef.current) return;

    lastRefreshAtRef.current = now;
    isRefreshingRef.current = true;

    try {
      if (showLoader) setIsLoading(true);
      const nextMessages = await getChatMessages(140);
      setMessages(nextMessages);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ошибка загрузки чата');
    } finally {
      isRefreshingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);

    let closed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource('/api/live');

        eventSource.addEventListener('connected', () => {
          console.log('[ManagerChat] SSE connected');
        });

        eventSource.addEventListener('chat_changed', () => {
          refresh(false);
        });

        eventSource.onerror = () => {
          console.warn('[ManagerChat] SSE error, reconnecting');

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };
      } catch (caught) {
        console.warn('[ManagerChat] SSE connect failed', caught);

        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      }
    };

    connect();

    const onFocus = () => refresh(false);
    window.addEventListener('focus', onFocus);

    return () => {
      closed = true;

      try {
        eventSource?.close();
      } catch {}

      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, isOpen, isCollapsed]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      await sendChatMessage(text, managerName || 'Менеджер');
      setDraft('');
      await refresh(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ошибка отправки сообщения');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить сообщение из общего чата?')) return;

    try {
      await deleteChatMessage(id);
      await refresh(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ошибка удаления сообщения');
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[70] inline-flex h-14 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
      >
        <MessageCircle className="h-5 w-5" />
        Чат МИГ
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[70] w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-950 px-4 py-3 text-white">
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Чат МИГ</span>
            <span className="block truncate text-xs text-slate-300">Общий чат менеджеров и курьеров</span>
          </span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Свернуть чат"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Закрыть чат"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          <div ref={scrollRef} className="max-h-[420px] min-h-[300px] overflow-y-auto bg-slate-50 px-3 py-3">
            {isLoading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">Загружаем чат…</div>
            ) : messages.length === 0 ? (
              <div className="flex h-[260px] flex-col items-center justify-center text-center">
                <MessageCircle className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-950">Сообщений пока нет</p>
                <p className="mt-1 max-w-[240px] text-xs leading-5 text-slate-500">Напишите первое сообщение в общий чат МИГ.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((message) => {
                  const own = message.authorType === 'manager' && message.authorName === (managerName || 'Менеджер');

                  return (
                    <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <div className={`group max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${own ? 'rounded-br-md bg-slate-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`}>
                        {!own ? (
                          <div className="mb-1 truncate text-[11px] font-semibold text-blue-600">
                            {message.authorType === 'manager' ? 'Менеджер' : 'Курьер'} • {message.authorName}
                          </div>
                        ) : null}

                        <div className="whitespace-pre-wrap break-words text-[13px] leading-5">{message.text}</div>

                        <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${own ? 'text-slate-300' : 'text-slate-400'}`}>
                          <span>{formatMessageTime(message.createdAt)}</span>
                          {own ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(message.id)}
                              className="opacity-0 transition group-hover:opacity-100"
                              title="Удалить сообщение"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</div>
          ) : null}

          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Сообщение"
                className="max-h-24 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || isSending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Отправить сообщение"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
