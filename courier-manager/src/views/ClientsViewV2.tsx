import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, ChevronRight, Edit2, MapPin, Phone, Plus, Search, Store, Trash2, UserRound, X } from 'lucide-react';
import * as api from '../lib/api';

type Client = api.Client;
type Point = api.ClientPoint & { isPrimary?: boolean };
type RegularClient = api.ClientRegularClient;

type ClientForm = { name: string; address: string; contactPerson: string; phone: string; email: string };
type PointForm = { name: string; address: string; contactPerson: string; phone: string };

const emptyClient: ClientForm = { name: '', address: '', contactPerson: '', phone: '', email: '' };
const emptyPoint: PointForm = { name: '', address: '', contactPerson: '', phone: '' };

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white';
const buttonPrimary = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:opacity-50';
const buttonSecondary = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50';

function primaryPoint(client: Client): Point {
  return {
    id: 0,
    clientId: client.id,
    name: 'Основная точка',
    address: client.address,
    contactPerson: client.contactPerson,
    phone: client.phone,
    sortOrder: -1,
    isPrimary: true,
  };
}

export default function ClientsViewV2() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);

  const [points, setPoints] = useState<Point[]>([]);
  const [regularClients, setRegularClients] = useState<RegularClient[]>([]);

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient);

  const [showPointModal, setShowPointModal] = useState(false);
  const [editingPointId, setEditingPointId] = useState<number | null>(null);
  const [pointForm, setPointForm] = useState<PointForm>(emptyPoint);

  const [showRegularClientModal, setShowRegularClientModal] = useState(false);
  const [editingRegularClientId, setEditingRegularClientId] = useState<number | null>(null);
  const [regularClientForm, setRegularClientForm] = useState<PointForm>(emptyPoint);

  useEffect(() => {
    void loadClients();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      const data = await api.getAllClients();
      setClients(data || []);

      if (selected) {
        const fresh = (data || []).find((client) => client.id === selected.id);
        if (fresh) {
          setSelected(fresh);
          await loadClientDetails(fresh);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Ошибка при загрузке клиентов');
    } finally {
      setLoading(false);
    }
  }

  async function loadClientDetails(client: Client) {
    const [dbPoints, dbRegularClients] = await Promise.all([
      api.getClientPoints(client.id),
      api.getClientRegularClients(client.id),
    ]);

    setPoints([primaryPoint(client), ...dbPoints]);
    setRegularClients(dbRegularClients);
  }

  async function openClient(client: Client) {
    setSelected(client);
    await loadClientDetails(client);
  }

  function openClientForm(client?: Client) {
    if (client) {
      setEditingClientId(client.id);
      setClientForm({
        name: client.name,
        address: client.address,
        contactPerson: client.contactPerson || '',
        phone: client.phone || '',
        email: client.email || '',
      });
    } else {
      setEditingClientId(null);
      setClientForm(emptyClient);
    }

    setShowClientModal(true);
  }

  async function submitClient(event: FormEvent) {
    event.preventDefault();

    if (!clientForm.name.trim() || !clientForm.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    try {
      if (editingClientId) {
        await api.updateClient(editingClientId, clientForm);
      } else {
        await api.createClient(clientForm);
      }

      setShowClientModal(false);
      setEditingClientId(null);
      setClientForm(emptyClient);
      await loadClients();
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении клиента');
    }
  }

  async function deleteClient(client: Client) {
    if (!confirm(`Удалить клиента «${client.name}»?`)) return;

    try {
      await api.deleteClient(client.id);
      setSelected(null);
      await loadClients();
    } catch (error) {
      console.error(error);
      alert('Ошибка при удалении клиента');
    }
  }

  function openPointForm(point?: Point) {
    if (point) {
      setEditingPointId(point.id);
      setPointForm({
        name: point.name,
        address: point.address,
        contactPerson: point.contactPerson || '',
        phone: point.phone || '',
      });
    } else {
      setEditingPointId(null);
      setPointForm(emptyPoint);
    }

    setShowPointModal(true);
  }

  async function submitPoint(event: FormEvent) {
    event.preventDefault();

    if (!selected) return;

    if (!pointForm.name.trim() || !pointForm.address.trim()) {
      alert('Название точки и адрес обязательны');
      return;
    }

    const payload = {
      name: pointForm.name.trim(),
      address: pointForm.address.trim(),
      contactPerson: pointForm.contactPerson.trim() || undefined,
      phone: pointForm.phone.trim() || undefined,
      sortOrder: points.length,
    };

    try {
      if (editingPointId) {
        await api.updateClientPoint(editingPointId, payload);
      } else {
        await api.createClientPoint(selected.id, payload);
      }

      setShowPointModal(false);
      setEditingPointId(null);
      setPointForm(emptyPoint);
      await loadClientDetails(selected);
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении точки');
    }
  }

  function openRegularClientForm(item?: RegularClient) {
    if (item) {
      setEditingRegularClientId(item.id);
      setRegularClientForm({
        name: item.name,
        address: item.address,
        contactPerson: item.contactPerson || '',
        phone: item.phone || '',
      });
    } else {
      setEditingRegularClientId(null);
      setRegularClientForm(emptyPoint);
    }

    setShowRegularClientModal(true);
  }

  async function submitRegularClient(event: FormEvent) {
    event.preventDefault();

    if (!selected) return;

    if (!regularClientForm.name.trim() || !regularClientForm.address.trim()) {
      alert('Название и адрес обязательны');
      return;
    }

    const payload = {
      name: regularClientForm.name.trim(),
      address: regularClientForm.address.trim(),
      contactPerson: regularClientForm.contactPerson.trim() || undefined,
      phone: regularClientForm.phone.trim() || undefined,
      sortOrder: regularClients.length,
    };

    try {
      if (editingRegularClientId) {
        await api.updateClientRegularClient(editingRegularClientId, payload);
      } else {
        await api.createClientRegularClient(selected.id, payload);
      }

      setShowRegularClientModal(false);
      setEditingRegularClientId(null);
      setRegularClientForm(emptyPoint);
      await loadClientDetails(selected);
    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении постоянного клиента');
    }
  }

  const filtered = useMemo(() => {
    const value = query.toLowerCase().trim();
    if (!value) return clients;

    return clients.filter((client) =>
      [client.name, client.address, client.phone, client.contactPerson, client.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(value)
    );
  }, [clients, query]);

  if (selected) {
    return (
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button onClick={() => setSelected(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{selected.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Магазины, точки и постоянные клиенты.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => openClientForm(selected)} className={buttonSecondary}>
              <Edit2 className="h-4 w-4" />
              Редактировать
            </button>

            <button onClick={() => deleteClient(selected)} className={buttonSecondary}>
              <Trash2 className="h-4 w-4" />
              Удалить
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <UserRound className="h-4 w-4" />
            Руководитель / владелец
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Руководитель" value={selected.contactPerson || '—'} />
            <Info label="Телефон" value={selected.phone || '—'} />
            <Info label="Email" value={selected.email || '—'} />
            <Info label="Роль" value="Ответственный за клиента" />
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Точки и магазины</h2>
            <p className="mt-1 text-xs text-slate-500">Адреса, контакты и телефоны конкретных точек клиента.</p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {points.map((point) => (
              <PointCard
                key={point.id}
                point={point}
                onEdit={() => openPointForm(point)}
                onDelete={async () => {
                  if (point.isPrimary) return;
                  if (!selected) return;
                  if (confirm(`Удалить точку «${point.name}»?`)) {
                    await api.deleteClientPoint(point.id);
                    await loadClientDetails(selected);
                  }
                }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Постоянные клиенты</h2>
              <p className="mt-1 text-xs text-slate-500">Клиенты, которые относятся только к «{selected.name}».</p>
            </div>

            <button onClick={() => openRegularClientForm()} className={buttonSecondary}>
              <Plus className="h-4 w-4" />
              Добавить постоянного клиента
            </button>
          </div>

          {regularClients.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center">
              <UserRound className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-950">Постоянных клиентов пока нет</p>
              <p className="mt-1 text-xs text-slate-500">Добавь их здесь, потом подключим к созданию заявок.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Клиент</th>
                    <th className="px-5 py-3 font-semibold">Адрес</th>
                    <th className="px-5 py-3 font-semibold">Контакт</th>
                    <th className="px-5 py-3 font-semibold">Телефон</th>
                    <th className="px-5 py-3 text-right font-semibold">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {regularClients.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold text-slate-950">{item.name}</td>
                      <td className="px-5 py-4 text-slate-600">{item.address}</td>
                      <td className="px-5 py-4 text-slate-600">{item.contactPerson || '—'}</td>
                      <td className="px-5 py-4 text-slate-600">{item.phone || '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openRegularClientForm(item)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            Изменить
                          </button>

                          <button
                            onClick={async () => {
                              if (!selected) return;
                              if (confirm(`Удалить постоянного клиента «${item.name}»?`)) {
                                await api.deleteClientRegularClient(item.id);
                                await loadClientDetails(selected);
                              }
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => openPointForm()}
          className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
          title="Добавить точку"
          aria-label="Добавить точку"
        >
          <Plus className="h-6 w-6" />
        </button>

        {showClientModal && <ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={() => setShowClientModal(false)} />}
        {showPointModal && <PointModal form={pointForm} setForm={setPointForm} editing={Boolean(editingPointId)} onSubmit={submitPoint} onClose={() => setShowPointModal(false)} />}
        {showRegularClientModal && <RegularClientModal form={regularClientForm} setForm={setRegularClientForm} editing={Boolean(editingRegularClientId)} onSubmit={submitRegularClient} onClose={() => setShowRegularClientModal(false)} />}
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по клиенту, руководителю, телефону или адресу..." className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-slate-300 focus:bg-white" />
          </div>

          <div className="text-xs text-slate-400">{filtered.length} клиентов</div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-block h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Building2 className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-950">Клиенты не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Клиент</th>
                  <th className="px-5 py-3 font-semibold">Руководитель</th>
                  <th className="px-5 py-3 font-semibold">Телефон</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 text-right font-semibold">Открыть</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map((client) => (
                  <tr key={client.id} onClick={() => void openClient(client)} className="group cursor-pointer hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{client.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Вся строка кликабельна</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{client.contactPerson || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{client.phone || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{client.email || '—'}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition group-hover:bg-slate-950 group-hover:text-white">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => openClientForm()}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
        title="Добавить клиента"
        aria-label="Добавить клиента"
      >
        <Plus className="h-6 w-6" />
      </button>

      {showClientModal && <ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={() => setShowClientModal(false)} />}
    </div>
  );
}

function PointCard({ point, onEdit, onDelete }: { point: Point; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
            <Store className="h-4 w-4" />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">{point.name}</p>
            <p className="mt-1 text-xs text-slate-500">{point.isPrimary ? 'Основная точка' : 'Магазин / филиал'}</p>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2 text-sm text-slate-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>{point.address}</span>
        </div>

        {(point.contactPerson || point.phone) && (
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {point.contactPerson && <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{point.contactPerson}</div>}
            {point.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{point.phone}</div>}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onEdit} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Edit2 className="h-3.5 w-3.5" />
          Редактировать
        </button>

        {!point.isPrimary && (
          <button type="button" onClick={onDelete} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={full ? 'sm:col-span-2' : ''}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{value}</p></div>;
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  );
}

function ClientModal({ form, setForm, editing, onSubmit, onClose }: { form: ClientForm; setForm: Dispatch<SetStateAction<ClientForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать клиента' : 'Добавить клиента'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название клиента *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Основной адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className={inputClass} placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить клиента'}</button>
      </form>
    </ModalShell>
  );
}

function PointModal({ form, setForm, editing, onSubmit, onClose }: { form: PointForm; setForm: Dispatch<SetStateAction<PointForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать точку' : 'Добавить точку'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название точки *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить точку'}</button>
      </form>
    </ModalShell>
  );
}

function RegularClientModal({ form, setForm, editing, onSubmit, onClose }: { form: PointForm; setForm: Dispatch<SetStateAction<PointForm>>; editing: boolean; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return (
    <ModalShell title={editing ? 'Редактировать постоянного клиента' : 'Добавить постоянного клиента'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={inputClass} placeholder="Название / имя *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className={inputClass} placeholder="Адрес *" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className={inputClass} placeholder="Контактное лицо" value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
        <input className={inputClass} placeholder="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <button className={`w-full ${buttonPrimary}`}>{editing ? 'Сохранить' : 'Добавить'}</button>
      </form>
    </ModalShell>
  );
}
