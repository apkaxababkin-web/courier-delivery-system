/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface MailItem {
  id: number;
  waybillNumber: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress: string;
  status: 'not_delivered' | 'delivered';
  recipientSignature?: string | null;
  deliveredAt?: string | null;
  createdAt?: string | null;
  courierName?: string | null;
}

function todayInIrkutsk() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Irkutsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shortTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function dateKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Irkutsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function MailsScreen() {
  const { token } = useAuth();
  const [mails, setMails] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [recipientSignature, setRecipientSignature] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadMails = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/trpc/mails.all?input=${encodeURIComponent(JSON.stringify({ token }))}`,
        { withCredentials: true },
      );
      const mailList = response.data?.result?.data?.json || response.data?.result || [];
      setMails(Array.isArray(mailList) ? mailList : []);
    } catch (error) {
      console.error('Failed to load mails:', error);
      setMails([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadMails();
  }, [loadMails]);

  useEffect(() => {
    if (!token) return;
    const eventSource = new EventSource('/api/live');
    const refresh = () => loadMails();

    eventSource.addEventListener('mails_changed', refresh);
    eventSource.addEventListener('data_changed', refresh);

    return () => eventSource.close();
  }, [loadMails, token]);

  const filteredMails = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = todayInIrkutsk();

    return mails.filter((mail) => {
      const visibleToday = mail.status !== 'delivered' || dateKey(mail.deliveredAt || mail.createdAt) === today;
      if (!visibleToday) return false;
      if (!query) return true;

      return [
        mail.waybillNumber,
        mail.recipientName || '',
        mail.recipientPhone || '',
        mail.deliveryAddress,
        mail.courierName || '',
        mail.recipientSignature || '',
      ].join(' ').toLowerCase().includes(query);
    });
  }, [mails, search]);

  const deliverMail = async () => {
    if (!token || !selectedMail || !recipientSignature.trim()) return;

    try {
      setUpdating(true);
      await axios.post(
        '/api/trpc/mails.deliver',
        { json: { token, mailId: selectedMail.id, waybillNumber: selectedMail.waybillNumber, recipientSignature: recipientSignature.trim() } },
        { withCredentials: true },
      );
      setSelectedMail(null);
      setRecipientSignature('');
      await loadMails();
    } catch (error) {
      console.error('Failed to deliver mail:', error);
    } finally {
      setUpdating(false);
    }
  };

  const deliveredCount = filteredMails.filter((mail) => mail.status === 'delivered').length;
  const activeCount = filteredMails.length - deliveredCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Письма</div>
            <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--muted)' }}>
              В работе: {activeCount} · Доставлено: {deliveredCount}
            </div>
          </div>
          <button
            onClick={loadMails}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Обновить
          </button>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по накладной, адресу, получателю"
          style={{
            marginTop: '12px',
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
          }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>Загрузка...</div>
        )}

        {!loading && filteredMails.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>Писем на сегодня нет</div>
        )}

        {filteredMails.map((mail) => {
          const delivered = mail.status === 'delivered';
          return (
            <div
              key={mail.id}
              onClick={() => !delivered && setSelectedMail(mail)}
              style={{
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: 'var(--surface)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                cursor: delivered ? 'default' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>
                    Письмо №{mail.waybillNumber}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--muted)' }}>
                    {mail.recipientName || 'Получатель не указан'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mail.deliveryAddress}
                  </div>
                  {mail.recipientPhone && (
                    <a href={`tel:${mail.recipientPhone}`} style={{ display: 'inline-block', marginTop: '6px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>
                      {mail.recipientPhone}
                    </a>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    backgroundColor: delivered ? 'rgba(34,197,94,0.14)' : 'rgba(59,130,246,0.14)',
                    color: delivered ? '#22c55e' : 'var(--primary)',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}>
                    {delivered ? 'Доставлено' : 'В работе'}
                  </div>
                  {delivered && (
                    <>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--foreground)', fontWeight: 700 }}>
                        {mail.courierName || 'Курьер не указан'}
                      </div>
                      <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--muted)' }}>
                        {shortTime(mail.deliveredAt)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedMail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: '420px', backgroundColor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Кто получил?</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--muted)' }}>Письмо №{selectedMail.waybillNumber}</div>
            <input
              autoFocus
              value={recipientSignature}
              onChange={(event) => setRecipientSignature(event.target.value)}
              placeholder="ФИО получателя"
              style={{
                marginTop: '14px',
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => { setSelectedMail(null); setRecipientSignature(''); }}
                style={{ padding: '11px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--foreground)' }}
              >
                Отмена
              </button>
              <button
                onClick={deliverMail}
                disabled={updating || !recipientSignature.trim()}
                style={{ padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', opacity: updating || !recipientSignature.trim() ? 0.6 : 1 }}
              >
                {updating ? 'Сохраняю...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
