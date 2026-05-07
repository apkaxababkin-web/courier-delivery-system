import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, ChevronRight, Download, Edit2, Loader2, MapPin, Plus, Search, Store, Trash2, UserRound, X } from 'lucide-react';
import * as api from '../lib/api';

interface Client {
  id: number;
  name: string;
  address: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

type ClientFormData = {
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
  email: string;
};

type ClientPoint = {
  id: string;
  name: string;
  address: string;
  contactPerson?: string;
  phone?: string;
  isPrimary?: boolean;
};

type PointFormData = {
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
};

type DirectorData = {
  name: string;
  phone: string;
  email: string;
  note: string;
};

const emptyClientForm: ClientFormData = { name: '', address: '', contactPerson: '', phone: '', email: '' };
const emptyPointForm: PointFormData = { name: '', address: '', contactPerson: '', phone: '' };
const emptyDirector: DirectorData = { name: '', phone: '', email: '', note: '' };

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white';
const primaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';
const smallButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100';

function getClientPointsKey(clientId: number) {
  return `client-points:${clientId}`;
}

function getClientDirectorKey(clientId: number) {
  return `client-director:${clientId}`;
}

function getPrimaryPoint(client: Client): ClientPoint {
  return {
    id: 'primary',
    name: 'Основная точка',
    address: client.address,
    contactPerson: client.contactPerson,
    phone: client.phone,
    isPrimary: true,
  };
}

export default function ClientsViewV2() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clientFormData, setClientFormData] = useState<ClientFormData>(emptyClientForm);
  const [clientPoints, setClientPoints] = useState<ClientPoint[]>([]);
  const [showPointForm, setShowPointForm] = useState(false);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [pointFormData, setPointFormData] = useState<PointFormData>(emptyPointForm);
  const [directorData, setDirectorData] = useState<DirectorData>(emptyDirector);
  const [isEditingDirector, setIsEditingDirector] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await api.getAllClients();
      setClients(data);
      setSelectedClient((current) => {
        if (!current) return current;
        return data.find((client) => client.id === current.id) || current;
      });
    } catch (error) {
      console.error('Error loading clients:', error);
      alert('Ошибка при загрузке клиентов');
    } finally {
      setLoading(false);
    }
  };

  const loadClientPoints = (client: Client) => {
    try {
      const saved = localStorage.getItem(getClientPointsKey(client.id));
      const additionalPoints = saved ? (JSON.parse(saved) as ClientPoint[]) : [];
      setClientPoints([getPrimaryPoint(client), ...additionalPoints.filter((point) => !point.isPrimary)]);
    } catch (error) {
      console.error('Error loading client points:', error);
      setClientPoints([getPrimaryPoint(client)]);
    }
  };

  const saveClientPoints = (clientId: number, points: ClientPoint[]) => {
    localStorage.setItem(getClientPointsKey(clientId), JSON.stringify(points.filter((point) => !point.isPrimary)));
  };

  const loadDirector = (clientId: number) => {
    try {
      const saved = localStorage.getItem(getClientDirectorKey(clientId));
      setDirectorData(saved ? { ...emptyDirector, ...JSON.parse(saved) } : emptyDirector);
    } catch {
      setDirectorData(emptyDirector);
    }
  };

  const saveDirector = () => {
    if (!selectedClient) return;
    localStorage.setItem(getClientDirectorKey(selectedClient.id), JSON.stringify(directorData));
    setIsEditingDirector(false);
  };

  const openClient = (client: Client) => {
    setSelectedClient(client);
    loadClientPoints(client);
    loadDirector(client.id);
    setIsEditingDirector(false);
  };

  const resetClientForm = () => {
    setClientFormData(emptyClientForm);
    setEditingClientId(null);
    setShowClientForm(false);
  };

  const openClientForm = (client?: Client) => {
    if (client) {
      setEditingClientId(client.id);
      setClientFormData({
        name: client.name,
        address: client.address,
        contactPerson: client.contactPerson || '',
        phone: client.phone || '',
        email: client.email || '',
      });
    } else {
      setEditingClientId(null);
      setClientFormData(emptyClientForm);
    }
    setShowClientForm(true);
  };

  const handleClientSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientFormData.name.trim() || !clientFormData.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    try {
      if (editingClientId) await api.updateClient(editingClientId, clientFormData);
      else await api.createClient(clientFormData);
      resetClientForm();
      await loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Ошибка при сохранении клиента');
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Удалить клиента «${client.name}»?`)) return;

    try {
      await api.deleteClient(client.id);
      localStorage.removeItem(getClientPointsKey(client.id));
      localStorage.removeItem(getClientDirectorKey(client.id));
      setSelectedClient(null);
      await loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Ошибка при удалении клиента');
    }
  };

  const openPointForm = (point?: ClientPoint) => {
    if (point) {
      setEditingPointId(point.id);
      setPointFormData({
        name: point.name,
        address: point.address,
        contactPerson: point.contactPerson || '',
        phone: point.phone || '',
      });
    } else {
      setEditingPointId(null);
      setPointFormData(emptyPointForm);
    }
    setShowPointForm(true);
  };

  const closePointForm = () => {
    setEditingPointId(null);
    setPointFormData(emptyPointForm);
    setShowPointForm(false);
  };

  const handlePointSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClient) return;
    if (!pointFormData.name.trim() || !pointFormData.address.trim()) {
      alert('Название точки и адрес обязательны');
      return;
    }

    const pointPayload = {
      name: pointFormData.name.trim(),
      address: pointFormData.address.trim(),
      contactPerson: pointFormData.contactPerson.trim() || undefined,
      phone: pointFormData.phone.trim() || undefined,
    };

    const nextPoints = editingPointId
      ? clientPoints.map((point) => point.id === editingPointId ? { ...point, ...pointPayload } : point)
      : [...clientPoints, { id: `${Date.now()}`, ...pointPayload }];

    setClientPoints(nextPoints);
    saveClientPoints(selectedClient.id, nextPoints);
    closePointForm();
  };

  const handleDeletePoint = (point: ClientPoint) => {
    if (!selectedClient || point.isPrimary) return;
    if (!confirm(`Удалить точку «${point.name}»?`)) return;
    const nextPoints = clientPoints.filter((item) => item.id !== point.id);
    setClientPoints(nextPoints);
    saveClientPoints(selectedClient.id, nextPoints);
  };

  const filteredClients = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return clients;
    return clients.filter((client) => [client.name, client.address, client.phone, client.contactPerson, client.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [clients, searchQuery]);

  if (selectedClient) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button onClick={() => setSelectedClient(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedClient.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Карточка клиента, точки, руководитель и будущие отчёты.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => openClientForm(selectedClient)} className={secondaryButtonClass}><Edit2 className="h-4 w-4" />Редактировать</button>
            <button onClick={() => handleDeleteClient(selectedClient)} className={secondaryButtonClass}><Trash2 className="h-4 w-4" />Удалить</button>
            <button onClick={() => alert('Отчёты руководителя будут добавлены отдельным этапом вместе с личными кабинетами.')} className={primaryButtonClass}><Download className="h-4 w-4" />Отчёт</button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Section title="Основная информация" subtitle="Базовая карточка клиента.">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem label="Основной адрес" value={selectedClient.address} icon={<MapPin className="h-4 w-4" />} className="sm:col-span-2" />
              <InfoItem label="Контактное лицо" value={selectedClient.contactPerson || '—'} />
              <InfoItem label="Телефон" value={selectedClient.phone || '—'} />
              <InfoItem label="Email" value={selectedClient.email || '—'} className="sm:col-span-2" />
            </div>
          </Section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard label="Точек" value={clientPoints.length} />
            <StatCard label="Магазинов" value={Math.max(clientPoints.length - 1, 0)} />
            <StatCard label="Доступ руководителя" value={directorData.email ? 1 : 0} />
          </div>
        </div>

        <Section title="Руководитель" subtitle="Подготовка под будущий личный кабинет директора/руководителя.">
          {!isEditingDirector ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <InfoItem label="ФИО" value={directorData.name || 'Не указан'} icon={<UserRound className="h-4 w-4" />} />
                <InfoItem label="Телефон" value={directorData.phone || '—'} />
                <InfoItem label="Email для будущего входа" value={directorData.email || '—'} />
                <InfoItem label="Комментарий" value={directorData.note || '—'} />
              </div>
              <button onClick={() => setIsEditingDirector(true)} className={smallButtonClass}><Edit2 className="h-4 w-4" />Редактировать руководителя</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ФИО руководителя" value={directorData.name} onChange={(value) => setDirectorData((prev) => ({ ...prev, name: value }))} placeholder="Иван Иванов" />
                <Field label="Телефон" value={directorData.phone} onChange={(value) => setDirectorData((prev) => ({ ...prev, phone: value }))} placeholder="+7..." />
                <Field label="Email для будущего входа" value={directorData.email} onChange={(value) => setDirectorData((prev) => ({ ...prev, email: value }))} placeholder="director@example.com" />
                <Field label="Комментарий" value={directorData.note} onChange={(value) => setDirectorData((prev) => ({ ...prev, note: value }))} placeholder="Доступ к отчётам по магазинам" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">Сейчас это карточка руководителя. Отдельный вход, роли, отчёты и кабинеты магазинов лучше делать отдельной backend-фазой.</div>
              <div className="flex gap-2"><button type="button" onClick={saveDirector} className={primaryButtonClass}>Сохранить</button><button type="button" onClick={() => { loadDirector(selectedClient.id); setIsEditingDirector(false); }} className={secondaryButtonClass}>Отмена</button></div>
            </div>
          )}
        </Section>

        <Section title="Точки и магазины клиента" subtitle="Магазины, склады и адреса забора/доставки внутри клиента.">
          <div className="mb-4 flex justify-end"><button onClick={() => openPointForm()} className={primaryButtonClass}><Plus className="h-4 w-4" />Добавить точку</button></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clientPoints.map((point) => (
              <div key={point.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm"><Store className="h-4 w-4" /></div>
                    <div><p className="text-sm font-semibold text-slate-950">{point.name}</p>{point.isPrimary && <p className="text-xs text-slate-500">Основная точка клиента</p>}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openPointForm(point)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50" title="Редактировать точку"><Edit2 className="h-4 w-4" /></button>
                    {!point.isPrimary && <button onClick={() => handleDeletePoint(point)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-950" title="Удалить точку"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                <p className="text-sm text-slate-700">{point.address}</p>
                {(point.contactPerson || point.phone) && <div className="mt-3 space-y-1 text-xs text-slate-500">{point.contactPerson && <p>Контакт: {point.contactPerson}</p>}{point.phone && <p>Телефон: {point.phone}</p>}</div>}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Заявки клиента" subtitle="Будущая история и статусы заявок по выбранному клиенту.">
          <div className="flex min-h-44 flex-col items-center justify-center p-8 text-center text-slate-500"><Building2 className="mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-950">История заявок будет подключена отдельным этапом</p><p className="mt-1 text-sm text-slate-500">Нужно связать заявки с конкретным клиентом/магазином в backend.</p></div>
        </Section>

        {showClientForm && <ClientModal editingClientId={editingClientId} formData={clientFormData} setFormData={setClientFormData} onSubmit={handleClientSubmit} onClose={resetClientForm} />}
        {showPointForm && <PointModal editingPointId={editingPointId} pointFormData={pointFormData} setPointFormData={setPointFormData} onSubmit={handlePointSubmit} onClose={closePointForm} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Клиенты</h1><p className="mt-1 text-sm text-slate-500">Клиенты как компании, внутри которых могут быть магазины, точки и руководители.</p></div>
        <button onClick={() => openClientForm()} className={primaryButtonClass}><Plus className="h-4 w-4" />Добавить клиента</button>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск по клиенту, адресу или телефону..." className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white" /></div>
          <div className="text-xs text-slate-400">{filteredClients.length} из {clients.length} клиентов</div>
        </div>

        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /><p className="text-sm text-slate-500">Загрузка клиентов...</p></div>
        ) : filteredClients.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Building2 className="mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-950">Клиенты не найдены</p><p className="mt-1 text-sm text-slate-500">Попробуйте изменить поиск или добавьте нового клиента.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Клиент</th><th className="px-5 py-3 font-semibold">Основной адрес</th><th className="px-5 py-3 font-semibold">Контактное лицо</th><th className="px-5 py-3 font-semibold">Телефон</th><th className="px-5 py-3 text-right font-semibold">Открыть</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr key={client.id} onClick={() => openClient(client)} className="group cursor-pointer hover:bg-slate-50/80 focus-within:bg-slate-50">
                    <td className="px-5 py-4"><p className="font-semibold text-slate-950">{client.name}</p><p className="mt-1 text-xs text-slate-500">Нажмите на строку, чтобы открыть магазины и точки</p></td>
                    <td className="px-5 py-4 text-slate-600">{client.address}</td><td className="px-5 py-4 text-slate-600">{client.contactPerson || '-'}</td><td className="px-5 py-4 text-slate-600">{client.phone || '-'}</td>
                    <td className="px-5 py-4 text-right"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition group-hover:bg-slate-950 group-hover:text-white"><ChevronRight size={16} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showClientForm && <ClientModal editingClientId={editingClientId} formData={clientFormData} setFormData={setClientFormData} onSubmit={handleClientSubmit} onClose={resetClientForm} />}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><div className="p-5">{children}</div></div>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p></div>;
}

function InfoItem({ label, value, icon, className = '' }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className}`}><div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">{icon}{label}</div><p className="break-words text-sm font-medium text-slate-900">{value}</p></div>;
}

function Field({ label, value, onChange, placeholder, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return <div><label className="mb-2 block text-sm font-medium text-slate-700">{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className={inputClass} /></div>;
}

function ClientModal({ editingClientId, formData, setFormData, onSubmit, onClose }: { editingClientId: number | null; formData: ClientFormData; setFormData: React.Dispatch<React.SetStateAction<ClientFormData>>; onSubmit: (event: React.FormEvent) => void; onClose: () => void }) {
  return createPortal(<div className="modal-overlay"><div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20"><div className="mb-5 flex items-center justify-between gap-4"><div><h3 className="text-lg font-semibold tracking-tight text-slate-950">{editingClientId ? 'Редактировать клиента' : 'Добавить клиента'}</h3><p className="mt-1 text-sm text-slate-500">Это основная карточка клиента.</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"><X size={18} /></button></div><form onSubmit={onSubmit} className="space-y-4"><Field label="Название клиента *" value={formData.name} onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))} placeholder="Основа движения" required /><Field label="Основной адрес *" value={formData.address} onChange={(value) => setFormData((prev) => ({ ...prev, address: value }))} placeholder="ул. Калашникова, 17" required /><Field label="Контактное лицо" value={formData.contactPerson} onChange={(value) => setFormData((prev) => ({ ...prev, contactPerson: value }))} placeholder="Иван Петров" /><Field label="Телефон" value={formData.phone} onChange={(value) => setFormData((prev) => ({ ...prev, phone: value }))} placeholder="+7..." type="tel" /><Field label="Email" value={formData.email} onChange={(value) => setFormData((prev) => ({ ...prev, email: value }))} placeholder="info@example.com" type="email" /><div className="flex gap-3 pt-2"><button type="submit" className={`flex-1 ${primaryButtonClass}`}>{editingClientId ? 'Сохранить' : 'Добавить'}</button><button type="button" onClick={onClose} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button></div></form></div></div>, document.body);
}

function PointModal({ editingPointId, pointFormData, setPointFormData, onSubmit, onClose }: { editingPointId: string | null; pointFormData: PointFormData; setPointFormData: React.Dispatch<React.SetStateAction<PointFormData>>; onSubmit: (event: React.FormEvent) => void; onClose: () => void }) {
  return createPortal(<div className="modal-overlay"><div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20"><div className="mb-5 flex items-center justify-between gap-4"><div><h3 className="text-lg font-semibold tracking-tight text-slate-950">{editingPointId ? 'Редактировать точку' : 'Добавить точку'}</h3><p className="mt-1 text-sm text-slate-500">Магазин, склад или адрес забора клиента.</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950"><X size={18} /></button></div><form onSubmit={onSubmit} className="space-y-4"><Field label="Название точки *" value={pointFormData.name} onChange={(value) => setPointFormData((prev) => ({ ...prev, name: value }))} placeholder="Магазин на Ленина" required /><Field label="Адрес *" value={pointFormData.address} onChange={(value) => setPointFormData((prev) => ({ ...prev, address: value }))} placeholder="ул. Ленина, 10" required /><Field label="Контактное лицо" value={pointFormData.contactPerson} onChange={(value) => setPointFormData((prev) => ({ ...prev, contactPerson: value }))} placeholder="Анна" /><Field label="Телефон" value={pointFormData.phone} onChange={(value) => setPointFormData((prev) => ({ ...prev, phone: value }))} placeholder="+7..." type="tel" /><div className="flex gap-3 pt-2"><button type="submit" className={`flex-1 ${primaryButtonClass}`}>{editingPointId ? 'Сохранить' : 'Добавить'}</button><button type="button" onClick={onClose} className={`flex-1 ${secondaryButtonClass}`}>Отмена</button></div></form></div></div>, document.body);
}
