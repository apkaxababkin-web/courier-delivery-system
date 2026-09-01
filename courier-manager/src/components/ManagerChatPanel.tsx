import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  SmilePlus,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  createChatV2DirectConversation,
  deleteChatV2Message,
  getChatV2Contacts,
  getChatV2Conversations,
  getChatV2Messages,
  markChatV2ConversationRead,
  sendChatV2Message,
  toggleChatV2MessageReaction,
  updateChatV2Message,
  type ChatV2Actor,
  type ChatV2Contacts,
  type ChatV2Conversation,
  type ChatV2Message,
} from '../lib/api';
import { formatLocalDateWithOptions, formatLocalTime, toLocalDateKey } from '../lib/local-time';

const CHAT_REACTIONS = ['🔥', '❤️', '😂', '👀', '🎉', '💯', '👏', '🤝', '🤯', '🫡'] as const;

function messageClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `manager:${crypto.randomUUID()}`;
  }

  return `manager:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

function formatConversationTime(value?: string | null) {
  if (!value) return '';
  const today = new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  if (date.toDateString() === today.toDateString()) return formatLocalTime(value, '');
  return formatLocalDateWithOptions(value, { day: '2-digit', month: '2-digit' }, '');
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toLocaleUpperCase('ru')}${value.slice(1)}` : value;
}

function formatMessageDayLabel(value: string) {
  const dateKey = toLocalDateKey(value);
  if (!dateKey) return '';

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const yesterdayKey = toLocalDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const formattedDate = formatLocalDateWithOptions(value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(dateKey.slice(0, 4) === todayKey.slice(0, 4) ? {} : { year: 'numeric' as const }),
  }, '');

  if (dateKey === todayKey) return `Сегодня, ${formattedDate}`;
  if (dateKey === yesterdayKey) return `Вчера, ${formattedDate}`;
  return capitalize(formattedDate);
}

function actorKey(actor: Pick<ChatV2Actor, 'type' | 'id'>) {
  return `${actor.type}:${actor.id}`;
}

function isMessageFromActor(message: ChatV2Message, actor: ChatV2Actor | null) {
  if (!actor || message.senderType !== actor.type) return false;
  if (message.senderId !== null && message.senderId !== undefined) {
    return Number(message.senderId) === Number(actor.id);
  }

  return message.senderName.trim().toLocaleLowerCase('ru') === actor.name.trim().toLocaleLowerCase('ru');
}

export default function ManagerChatPanel() {
  const [contacts, setContacts] = useState<ChatV2Contacts | null>(null);
  const [conversations, setConversations] = useState<ChatV2Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatV2Message[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isCompactPanelOpen, setIsCompactPanelOpen] = useState(false);
  const [isWideScreen, setIsWideScreen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [openingContactKey, setOpeningContactKey] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [busyMessageId, setBusyMessageId] = useState<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unreadRef = useRef<Map<number, number>>(new Map());
  const conversationsInitializedRef = useRef(false);
  const messageRequestRef = useRef(0);
  const shouldScrollToEndRef = useRef(false);
  const nearBottomRef = useRef(true);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const totalUnreadCount = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );
  const isActiveConversationVisible = !isConversationListOpen && (isWideScreen || isCompactPanelOpen);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.lastMessageSenderName || ''} ${conversation.lastMessageText || ''}`
        .toLocaleLowerCase('ru')
        .includes(query),
    );
  }, [conversations, search]);

  const directContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    const people = contacts?.couriers || [];
    if (!query) return people;
    return people.filter((contact) => contact.name.toLocaleLowerCase('ru').includes(query));
  }, [contacts, search]);

  const playIncomingSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsWideScreen(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const audio = new Audio('/sounds/chat-message.wav');
    audio.preload = 'auto';
    audio.volume = 0.75;
    audioRef.current = audio;

    const unlock = () => {
      audio.volume = 0;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 0.75;
        })
        .catch(() => {
          audio.volume = 0.75;
        });
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const loadConversations = useCallback(async (notifyAboutUnread = false) => {
    const data = await getChatV2Conversations();
    const normalized = data.map((conversation) => ({
      ...conversation,
      unreadCount: Number(conversation.unreadCount || 0),
    }));

    if (notifyAboutUnread && conversationsInitializedRef.current) {
      const hasNewUnread = normalized.some(
        (conversation) => conversation.unreadCount > (unreadRef.current.get(conversation.id) || 0),
      );
      if (hasNewUnread) playIncomingSound();
    }

    unreadRef.current = new Map(normalized.map((conversation) => [conversation.id, conversation.unreadCount]));
    conversationsInitializedRef.current = true;
    setConversations(normalized);
    setSelectedConversationId((current) => {
      if (current && normalized.some((conversation) => conversation.id === current)) return current;
      return normalized.find((conversation) => conversation.kind === 'general')?.id || normalized[0]?.id || null;
    });
    return normalized;
  }, [playIncomingSound]);

  const loadMessages = useCallback(async (conversationId: number, showLoader = false) => {
    const requestId = ++messageRequestRef.current;
    if (showLoader) setIsMessagesLoading(true);

    try {
      const page = await getChatV2Messages(conversationId, { limit: 60 });
      if (requestId !== messageRequestRef.current) return;
      setMessages(page.messages);
      setNextCursor(page.nextCursor);
      shouldScrollToEndRef.current = showLoader || nearBottomRef.current;
      if (showLoader) {
        nearBottomRef.current = true;
        setIsNearBottom(true);
      }

      void markChatV2ConversationRead(conversationId).then(() => {
        unreadRef.current.set(conversationId, 0);
        setConversations((current) => current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ));
      }).catch(() => undefined);
    } finally {
      if (showLoader && requestId === messageRequestRef.current) setIsMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    let closed = false;

    const initialize = async () => {
      try {
        setError('');
        const [contactData] = await Promise.all([
          getChatV2Contacts(),
          loadConversations(false),
        ]);
        if (!closed) setContacts(contactData);
      } catch (loadError) {
        if (!closed) setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть чат');
      } finally {
        if (!closed) setIsInitialLoading(false);
      }
    };

    void initialize();
    return () => {
      closed = true;
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId || !isActiveConversationVisible) return;
    setEditingMessageId(null);
    setDeletingMessageId(null);
    void loadMessages(selectedConversationId, true).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить сообщения');
    });
  }, [isActiveConversationVisible, loadMessages, selectedConversationId]);

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const refreshConversations = () => {
      void loadConversations(true).catch(() => undefined);
    };
    const refreshMessages = () => {
      refreshConversations();
      if (selectedConversationId && isActiveConversationVisible) {
        void loadMessages(selectedConversationId).catch(() => undefined);
      }
    };
    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/live');
      source.addEventListener('chat_v2_changed', refreshMessages);
      source.addEventListener('chat_v2_read', refreshConversations);
      source.onerror = () => {
        source?.close();
        if (!closed && !reconnectTimer) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };
    };

    connect();
    window.addEventListener('focus', refreshMessages);
    return () => {
      closed = true;
      source?.close();
      window.removeEventListener('focus', refreshMessages);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [isActiveConversationVisible, loadConversations, loadMessages, selectedConversationId]);

  useEffect(() => {
    if (isMessagesLoading || !shouldScrollToEndRef.current) return;
    shouldScrollToEndRef.current = false;
    const scroll = () => messagesEndRef.current?.scrollIntoView({ block: 'end' });
    window.requestAnimationFrame(scroll);
    const retryTimer = window.setTimeout(scroll, 120);
    return () => window.clearTimeout(retryTimer);
  }, [isMessagesLoading, messages]);

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    nearBottomRef.current = true;
    setIsNearBottom(true);
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
  };

  const handleMessagesScroll = () => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (nearBottom === nearBottomRef.current) return;
    nearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  };

  const openConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setIsConversationListOpen(false);
    setIsContactPickerOpen(false);
    setSearch('');
  };

  const handleCreateDirect = async (contact: ChatV2Actor) => {
    const key = actorKey(contact);
    try {
      setError('');
      setOpeningContactKey(key);
      const result = await createChatV2DirectConversation(contact);
      await loadConversations(false);
      openConversation(result.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось открыть личный чат');
    } finally {
      setOpeningContactKey(null);
    }
  };

  const handleLoadOlder = async () => {
    if (!selectedConversationId || !nextCursor || isLoadingOlder) return;
    try {
      setIsLoadingOlder(true);
      const page = await getChatV2Messages(selectedConversationId, { before: nextCursor, limit: 60 });
      setMessages((current) => {
        const knownIds = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !knownIds.has(message.id)), ...current];
      });
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить старые сообщения');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !selectedConversationId || isSending) return;
    try {
      setError('');
      setIsSending(true);
      const message = await sendChatV2Message(selectedConversationId, {
        text,
        clientMessageId: messageClientId(),
      });
      shouldScrollToEndRef.current = true;
      nearBottomRef.current = true;
      setIsNearBottom(true);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setDraft('');
      void loadConversations(false).catch(() => undefined);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveEdit = async (messageId: number) => {
    const text = editingText.trim();
    if (!text || busyMessageId) return;
    try {
      setBusyMessageId(messageId);
      const updated = await updateChatV2Message(messageId, text);
      setMessages((current) => current.map((message) => message.id === messageId ? updated : message));
      setEditingMessageId(null);
      setEditingText('');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Не удалось изменить сообщение');
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleDelete = async (messageId: number) => {
    if (busyMessageId) return;
    try {
      setBusyMessageId(messageId);
      await deleteChatV2Message(messageId);
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, text: '', deletedAt: new Date().toISOString() }
        : message));
      setDeletingMessageId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить сообщение');
    } finally {
      setBusyMessageId(null);
    }
  };

  const handleToggleReaction = async (messageId: number, emoji: string) => {
    if (busyMessageId) return;
    try {
      setBusyMessageId(messageId);
      const updated = await toggleChatV2MessageReaction(messageId, emoji);
      setMessages((current) => current.map((message) => message.id === messageId ? updated : message));
      setReactionPickerMessageId(null);
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : 'Не удалось поставить реакцию');
    } finally {
      setBusyMessageId(null);
    }
  };

  const me = contacts?.me;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsCompactPanelOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl shadow-slate-950/20 transition hover:bg-slate-800 xl:hidden"
        aria-label="Открыть чат"
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnreadCount > 0 ? <span className="absolute -right-1 -top-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 px-1 text-[11px] font-bold text-white">{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</span> : null}
      </button>

      {isCompactPanelOpen ? <button type="button" aria-label="Закрыть чат" onClick={() => setIsCompactPanelOpen(false)} className="fixed inset-0 z-[80] bg-slate-950/30 backdrop-blur-[1px] xl:hidden" /> : null}

      <aside className={`${isCompactPanelOpen ? 'fixed inset-y-0 right-0 z-[90] flex w-full max-w-[430px]' : 'hidden'} h-screen flex-col border-l border-slate-200 bg-white xl:static xl:z-auto xl:flex xl:w-[390px] xl:max-w-none xl:shrink-0 2xl:w-[430px]`}>
      {isConversationListOpen || !selectedConversation ? (
        <>
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
            <div className="flex items-center gap-3">
              {selectedConversation ? (
                <button type="button" onClick={() => setIsConversationListOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950" aria-label="Вернуться в чат">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : <MessageCircle className="h-5 w-5 text-slate-900" />}
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Чаты</h2>
                <p className="text-xs text-slate-500">Общий и личные диалоги</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsContactPickerOpen((current) => !current);
                  setSearch('');
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800"
                aria-label="Новый личный чат"
              >
                {isContactPickerOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setIsCompactPanelOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 xl:hidden" aria-label="Закрыть чат"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="border-b border-slate-100 p-4">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isContactPickerOpen ? 'Найти курьера' : 'Поиск по чатам'} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            </label>
          </div>

          {error ? <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          <div className="flex-1 overflow-y-auto py-2">
            {isInitialLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем чаты...</div>
            ) : isContactPickerOpen ? (
              <div>
                <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Новый личный чат</p>
                {directContacts.length ? directContacts.map((contact) => (
                  <button key={actorKey(contact)} type="button" onClick={() => void handleCreateDirect(contact)} disabled={openingContactKey === actorKey(contact)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50 disabled:opacity-60">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">{contact.name.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-950">{contact.name}</span><span className="text-xs text-slate-500">Курьер</span></span>
                    {openingContactKey === actorKey(contact) ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <MessageCircle className="h-4 w-4 text-slate-300" />}
                  </button>
                )) : <p className="px-5 py-8 text-center text-sm text-slate-400">Курьеры не найдены</p>}
              </div>
            ) : filteredConversations.length ? filteredConversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)} className={`flex w-full gap-3 px-5 py-3 text-left transition hover:bg-slate-50 ${conversation.id === selectedConversationId ? 'bg-slate-50' : ''}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${conversation.kind === 'general' ? 'bg-slate-950 text-white' : 'bg-blue-100 text-blue-700'}`}>
                  {conversation.kind === 'general' ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1 border-b border-slate-100 pb-3">
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-950">{conversation.title}</span><span className="shrink-0 text-[11px] text-slate-400">{formatConversationTime(conversation.lastMessageAt || conversation.updatedAt)}</span></span>
                  <span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-slate-500">{conversation.lastMessageText ? `${conversation.lastMessageSenderName || ''}: ${conversation.lastMessageText}` : 'Сообщений пока нет'}</span>{conversation.unreadCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span> : null}</span>
                </span>
              </button>
            )) : <p className="px-5 py-10 text-center text-sm text-slate-400">Чаты не найдены</p>}
          </div>
        </>
      ) : (
        <>
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4">
            <button type="button" onClick={() => setIsConversationListOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950" aria-label="Все чаты">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selectedConversation.kind === 'general' ? 'bg-slate-950 text-white' : 'bg-blue-100 text-blue-700'}`}>
              {selectedConversation.kind === 'general' ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-slate-950">{selectedConversation.title}</h2><p className="text-xs text-slate-500">{selectedConversation.kind === 'general' ? 'Общий рабочий чат' : 'Личный диалог'}</p></div>
            <button type="button" onClick={() => setIsCompactPanelOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 xl:hidden" aria-label="Закрыть чат"><X className="h-5 w-5" /></button>
          </div>

          {error ? <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError('')}><X className="h-4 w-4" /></button></div> : null}

          <div className="relative min-h-0 flex-1">
          <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto bg-slate-50/60 px-4 py-4">
            {nextCursor ? (
              <div className="mb-4 text-center"><button type="button" onClick={() => void handleLoadOlder()} disabled={isLoadingOlder} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60">{isLoadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Показать предыдущие</button></div>
            ) : null}

            {isMessagesLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем сообщения...</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center"><div><MessageCircle className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-900">Сообщений пока нет</p><p className="mt-1 text-xs text-slate-500">Начните разговор первым.</p></div></div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => {
                  const isMine = isMessageFromActor(message, me);
                  const isEditing = editingMessageId === message.id;
                  const isDeleting = deletingMessageId === message.id;
                  const isBusy = busyMessageId === message.id;
                  const messageDateKey = toLocalDateKey(message.createdAt);
                  const previousDateKey = index > 0 ? toLocalDateKey(messages[index - 1]?.createdAt) : '';
                  const showDateSeparator = index === 0 || messageDateKey !== previousDateKey;
                  return (
                    <Fragment key={message.id}>
                    {showDateSeparator ? (
                      <div className="flex items-center gap-3 py-1" role="separator" aria-label={formatMessageDayLabel(message.createdAt)}>
                        <span className="h-px flex-1 bg-slate-200" />
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                          {formatMessageDayLabel(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-slate-200" />
                      </div>
                    ) : null}
                    <div className={`group flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">{message.senderName.charAt(0).toUpperCase()}</span> : null}
                      <div className={`min-w-0 max-w-[82%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMine ? <span className="mb-1 px-1 text-[11px] font-semibold text-slate-500">{message.senderName} · {message.senderType === 'manager' ? 'Менеджер' : 'Курьер'}</span> : null}
                        <div className={`relative rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${isMine ? 'rounded-br-md bg-slate-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                          {message.deletedAt ? <span className={isMine ? 'italic text-slate-400' : 'italic text-slate-400'}>Сообщение удалено</span> : isEditing ? (
                            <div className="space-y-2">
                              <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={2} maxLength={4000} autoFocus className="w-full resize-none rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-white/20" />
                              <div className="flex justify-end gap-1"><button type="button" onClick={() => setEditingMessageId(null)} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">Отмена</button><button type="button" onClick={() => void handleSaveEdit(message.id)} disabled={!editingText.trim() || isBusy} className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-950 disabled:opacity-50">Сохранить</button></div>
                            </div>
                          ) : isDeleting ? (
                            <div><p>Удалить сообщение?</p><div className="mt-2 flex justify-end gap-1"><button type="button" onClick={() => setDeletingMessageId(null)} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">Нет</button><button type="button" onClick={() => void handleDelete(message.id)} disabled={isBusy} className="rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Удалить</button></div></div>
                          ) : <p className="whitespace-pre-wrap break-words leading-5">{message.text}</p>}

                          {!message.deletedAt && !isEditing && !isDeleting ? (
                            <div className={`absolute top-1/2 z-10 hidden -translate-y-1/2 items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm group-hover:flex ${isMine ? '-left-[5.5rem]' : '-right-10'}`}>
                              <button type="button" onClick={() => setReactionPickerMessageId((current) => current === message.id ? null : message.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Поставить реакцию"><SmilePlus className="h-3.5 w-3.5" /></button>
                              {isMine && message.senderId !== null ? <button type="button" onClick={() => { setEditingMessageId(message.id); setEditingText(message.text); setDeletingMessageId(null); setReactionPickerMessageId(null); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Редактировать"><Pencil className="h-3.5 w-3.5" /></button> : null}
                              {isMine && message.senderId !== null ? <button type="button" onClick={() => { setDeletingMessageId(message.id); setEditingMessageId(null); setReactionPickerMessageId(null); }} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                            </div>
                          ) : null}
                          {reactionPickerMessageId === message.id ? <div className={`absolute top-full z-20 mt-1 grid w-52 grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>{CHAT_REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => void handleToggleReaction(message.id, emoji)} className="rounded-lg py-1.5 text-lg hover:bg-slate-100">{emoji}</button>)}</div> : null}
                        </div>
                        {!message.deletedAt && message.reactions?.length ? <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>{message.reactions.map((reaction) => <button key={reaction.emoji} type="button" onClick={() => void handleToggleReaction(message.id, reaction.emoji)} className={`rounded-full border px-2 py-0.5 text-xs shadow-sm ${reaction.reactedByMe ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>{reaction.emoji} {Number(reaction.count)}</button>)}</div> : null}
                        <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400">{formatLocalTime(message.createdAt, '')}{message.editedAt ? ' · изменено' : ''}{isMine && !message.deletedAt ? (Number(message.readCount) > 0 ? <CheckCheck className="h-3.5 w-3.5 text-blue-500" /> : Number(message.deliveredCount) > 0 ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />) : null}</span>
                      </div>
                    </div>
                    </Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          {!isNearBottom && !isMessagesLoading ? <button type="button" onClick={() => scrollToLatest()} className="absolute bottom-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50" aria-label="К последнему сообщению"><ChevronDown className="h-5 w-5" /></button> : null}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm focus-within:border-slate-400 focus-within:bg-white">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Написать сообщение..." rows={1} maxLength={4000} className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
              <button type="button" onClick={() => void handleSend()} disabled={!draft.trim() || isSending} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:bg-slate-300" aria-label="Отправить сообщение">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Enter — отправить, Shift + Enter — новая строка</p>
          </div>
        </>
      )}
      </aside>
    </>
  );
}
