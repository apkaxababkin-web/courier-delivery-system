import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../../../components/Modal';
import type { TaskFormData, Client, NutsBox } from '../../model/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
  clients: Client[];
  isLoading?: boolean;
  mode?: 'create' | 'edit';
  initialData?: Partial<TaskFormData> | null;
  title?: string;
  submitLabel?: string;
}

type RequestType = NonNullable<TaskFormData['requestType']>;
type LocalFormData = TaskFormData & {
  senderClientId?: number;
  recipientClientId?: number;
  pickupRecipientClientId?: number;
  pickupDirection?: 'tc_to_recipient' | 'recipient_to_tc';
  nutsBoxes?: NutsBox[];
  nutsTariff?: number;
  cedroilTariff?: number;
};


const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  delivery: 'Доставка',
  movement: 'Перемещение',
  nuts: 'Орехи',
  courier_call: 'Вызов курьера',
  pickup_from_tc: 'Транспортная компания',
  simple: 'Простая заявка',
};

const NUTS_TARIFF_STORAGE_KEY = 'courier-manager:nuts-tariff';
const CEDROIL_TARIFF_STORAGE_KEY = 'courier-manager:cedroil-tariff';
const NUTS_WEIGHTS: Record<string, number> = { '1': 15, '2': 16, '3': 16.5, '4': 18, '5': 18, '6': 0 };
const DEFAULT_NUTS_BOXES: NutsBox[] = [
  { id: '1', name: '0,1 (15 кг)', quantity: 0 },
  { id: '2', name: '0,2 (16 кг)', quantity: 0 },
  { id: '3', name: '0,3 (16,5 кг)', quantity: 0 },
  { id: '4', name: '0,5 (18 кг)', quantity: 0 },
  { id: '5', name: '1 (18 кг)', quantity: 0 },
  { id: '6', name: 'Кедровое масло', quantity: 0 },
];

const readStoredTariff = (key: string) => {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : 0;
};

const makeInitialFormData = (): LocalFormData => ({
  requestType: 'delivery',
  clientId: undefined,
  senderClientId: undefined,
  recipientClientId: undefined,
  senderName: '',
  senderCompany: '',
  senderCity: '',
  senderPhone: '',
  senderAddress: '',
  recipientName: '',
  recipientCompany: '',
  recipientCity: '',
  recipientPhone: '',
  recipientAddress: '',
  deliveryAddress: '',
  packageDescription: '',
  packageType: 'small',
  specialInstructions: '',
  deliveryTimeFrom: '',
  deliveryTimeTo: '',
  placesCount: undefined,
  comments: '',
  paymentMethod: 'paid',
  paymentAmount: 0,
  nutsBoxes: DEFAULT_NUTS_BOXES.map((box) => ({ ...box })),
  nutsTariff: readStoredTariff(NUTS_TARIFF_STORAGE_KEY),
  cedroilTariff: readStoredTariff(CEDROIL_TARIFF_STORAGE_KEY),
  tcName: '',
  tcAddress: '',
  trackingNumber: '',
  pickupDirection: 'tc_to_recipient',
  pickupRecipientClientId: undefined,
});

export function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  isLoading,
  mode = 'create',
  initialData = null,
  title,
  submitLabel,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<LocalFormData>(makeInitialFormData);
  const requestType = formData.requestType || 'delivery';

  useEffect(() => {
    if (!isOpen) return;

    const base = makeInitialFormData();
    setFormData({
      ...base,
      ...(initialData || {}),
      requestType: initialData?.requestType || base.requestType,
      nutsBoxes: base.nutsBoxes,
      nutsTariff: base.nutsTariff,
      cedroilTariff: base.cedroilTariff,
    });
  }, [isOpen, initialData]);

  const nutsTotal = useMemo(() => (formData.nutsBoxes || []).reduce((sum, box, index) => {
    const tariff = index === 5 ? formData.cedroilTariff || 0 : (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0);
    return sum + (box.quantity || 0) * tariff;
  }, 0), [formData.nutsBoxes, formData.nutsTariff, formData.cedroilTariff]);

  if (!isOpen) return null;

  const updateField = <K extends keyof LocalFormData>(field: K, value: LocalFormData[K]) => setFormData((prev) => ({ ...prev, [field]: value }));

  const updateTariff = (field: 'nutsTariff' | 'cedroilTariff', value: number) => {
    updateField(field, value);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(field === 'nutsTariff' ? NUTS_TARIFF_STORAGE_KEY : CEDROIL_TARIFF_STORAGE_KEY, String(value));
  };

  const selectClient = (clientId: number | undefined, target: 'sender' | 'recipient' | 'pickupClient' | 'pickupRecipient') => {
    const client = clients.find((item) => item.id === clientId);
    setFormData((prev) => {
      if (!client) return { ...prev, [`${target}ClientId`]: undefined };
      if (target === 'sender') return { ...prev, senderClientId: client.id, senderName: client.name, senderPhone: client.phone || '', senderAddress: client.address };
      if (target === 'recipient') return { ...prev, recipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      if (target === 'pickupRecipient') return { ...prev, pickupRecipientClientId: client.id, recipientName: client.name, recipientPhone: client.phone || '', deliveryAddress: client.address };
      return { ...prev, clientId: client.id, senderName: client.name, senderPhone: client.phone || '', senderAddress: client.address };
    });
  };

  const updateNutsBox = (boxId: string, patch: Partial<NutsBox>) => {
    updateField('nutsBoxes', (formData.nutsBoxes || []).map((box) => (box.id === boxId ? { ...box, ...patch } : box)));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { senderClientId, recipientClientId, pickupRecipientClientId, pickupDirection, nutsBoxes, nutsTariff, cedroilTariff, ...payload } = formData;

    onSubmit({
      ...payload,
      requestType,
      recipientName: payload.recipientName || payload.senderName || '',
      recipientPhone: payload.recipientPhone || payload.senderPhone || '',
      deliveryAddress: payload.deliveryAddress || payload.recipientAddress || payload.senderAddress || '',
      items: requestType === 'nuts' ? (nutsBoxes || []).filter((box) => box.quantity > 0).map((box) => `${box.name}: ${box.quantity}`).join('; ') : payload.items,
      description: requestType === 'nuts' ? `Орехи. Сумма: ${nutsTotal.toFixed(2)}` : payload.description,
      comments: requestType === 'pickup_from_tc' ? [payload.comments, pickupDirection === 'recipient_to_tc' ? 'Направление: получатель → ТК' : 'Направление: ТК → получатель'].filter(Boolean).join('\n') : payload.comments,
    });
    if (mode === 'create') {
      setFormData(makeInitialFormData());
    }
  };
  const requestTypeLabel = REQUEST_TYPE_LABELS[requestType] || "Заявка";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-h-[92vh] w-[min(1180px,calc(100vw-32px))] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20" overlayStyle={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)' }}>
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
        <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div className="self-center">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Создать заявку</h2>
            <p className="mt-0.5 text-sm text-slate-500">Операционная форма без лишних шагов.</p>
          </div>
          <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 md:block">
            {requestTypeLabel}
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-950 md:static"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {requestType !== 'nuts' && requestType !== 'pickup_from_tc' && requestType !== 'simple' && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Section title="Отправитель"><div className="grid gap-2.5 md:grid-cols-2">{(requestType === 'delivery' || requestType === 'movement') && <ClientSelect label="Выберите отправителя" value={formData.senderClientId} clients={clients} onChange={(id) => selectClient(id, 'sender')} className="md:col-span-2" />}<Field label="Отправитель *" value={formData.senderName || ''} onChange={(value) => updateField('senderName', value)} required /><Field label="Телефон отправителя" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} />{requestType === 'courier_call' && <><Field label="Компания отправителя" value={formData.senderCompany || ''} onChange={(value) => updateField('senderCompany', value)} /><Field label="Город отправителя" value={formData.senderCity || ''} onChange={(value) => updateField('senderCity', value)} /></>}<Field label="Адрес отправителя *" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} required className="md:col-span-2" /></div></Section>
              <Section title="Получатель"><div className="grid gap-2.5 md:grid-cols-2">{requestType === 'movement' && <ClientSelect label="Выберите получателя" value={formData.recipientClientId} clients={clients} onChange={(id) => selectClient(id, 'recipient')} className="md:col-span-2" />}<Field label="Получатель *" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} required /><Field label="Телефон получателя *" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} required />{requestType === 'courier_call' && <><Field label="Компания получателя" value={formData.recipientCompany || ''} onChange={(value) => updateField('recipientCompany', value)} /><Field label="Город получателя" value={formData.recipientCity || ''} onChange={(value) => updateField('recipientCity', value)} /></>}<Field label="Адрес доставки *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required className="md:col-span-2" />{requestType !== 'courier_call' && <Field label="Квартира/офис" value={formData.recipientAddress || ''} onChange={(value) => updateField('recipientAddress', value)} className="md:col-span-2" />}</div></Section>
            </div>
          )}

          {requestType === 'simple' && <Section title="Информация"><div className="grid gap-2.5 md:grid-cols-2"><Field label="Откуда (адрес) *" value={formData.senderAddress || ''} onChange={(value) => updateField('senderAddress', value)} required className="md:col-span-2" /><Field label="Имя *" value={formData.senderName || ''} onChange={(value) => updateField('senderName', value)} required /><Field label="Телефон *" value={formData.senderPhone || ''} onChange={(value) => updateField('senderPhone', value)} required /><Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} /><Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} />

<div>
<label className="mb-1 block text-sm font-medium leading-none text-slate-700">
Количество мест
</label>

<input
type="text"
inputMode="numeric"
placeholder="Не указано"
name="placesCountManual"
autoComplete="off"
value={formData.placesCount ?? ""}
onChange={(e) =>
updateField(
"placesCount",
e.target.value === ""
? undefined
: Number(e.target.value)
)
}
className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
/>
</div>

<TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-2" /></div></Section>}

          {requestType !== 'nuts' && requestType !== 'pickup_from_tc' && requestType !== 'simple' && <div className="grid gap-3 lg:grid-cols-[1fr_340px]"><Section title="Детали доставки"><div className="grid gap-2.5 md:grid-cols-2"><Field label="Время от" type="time" value={formData.deliveryTimeFrom || ''} onChange={(value) => updateField('deliveryTimeFrom', value)} /><Field label="Время до" type="time" value={formData.deliveryTimeTo || ''} onChange={(value) => updateField('deliveryTimeTo', value)} /><div>
<label className="mb-1 block text-sm font-medium leading-none text-slate-700">
Количество мест
</label>

<input
type="text"
inputMode="numeric"
placeholder="Не указано"
name="placesCountManual"
autoComplete="off"
value={formData.placesCount ?? ""}
onChange={(e) =>
updateField(
"placesCount",
e.target.value === ""
? undefined
: Number(e.target.value)
)
}
className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
/>
</div><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-2" /></div></Section>{requestType === 'delivery' && <Section title="Оплата"><div className="grid gap-2.5"><SelectField label="Способ оплаты" value={formData.paymentMethod || 'paid'} onChange={(value) => updateField('paymentMethod', value as TaskFormData['paymentMethod'])} options={[["paid", "Оплачено"], ["transfer", "Перевод"], ["cash", "Наличные"], ["terminal", "Терминал"], ["qr", "QR-код"]]} />{formData.paymentMethod !== 'paid' && <Field label="Сумма оплаты" type="number" value={formData.paymentAmount || ''} onChange={(value) => updateField('paymentAmount', Number(value) || 0)} />}</div></Section>}</div>}

          {requestType === 'nuts' && <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]"><Section title="Коробки Орехов"><div className="space-y-2">{(formData.nutsBoxes || []).map((box, index) => <div key={box.id} className="grid grid-cols-[1fr_76px_108px] items-center gap-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{box.name}</div><input aria-label={`Количество ${box.name}`} type="number" min="0" value={box.quantity} onChange={(event) => updateNutsBox(box.id, { quantity: Number(event.target.value) || 0 })} className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-300 focus:bg-white" /><div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium text-slate-700">{(index === 5 ? (box.quantity || 0) * (formData.cedroilTariff || 0) : (box.quantity || 0) * (NUTS_WEIGHTS[box.id] || 0) * (formData.nutsTariff || 0)).toFixed(2)}</div></div>)}<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><div className="flex justify-between gap-4"><span className="font-semibold text-slate-900">Итого сумма:</span><span className="font-bold text-slate-950">{nutsTotal.toFixed(2)}</span></div></div><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} /></div></Section><div className="space-y-3"><Section title="Получатель"><div className="grid gap-2.5"><ClientSelect label="Выберите получателя" value={formData.recipientClientId} clients={clients} onChange={(id) => selectClient(id, 'recipient')} /><Field label="Получатель *" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} required /><Field label="Телефон получателя *" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} required /><Field label="Адрес доставки *" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} required /></div></Section><Section title="Тарифы"><div className="grid gap-2.5"><Field label="Орехи, руб. за кг" type="number" value={formData.nutsTariff || ''} onChange={(value) => updateTariff('nutsTariff', Number(value) || 0)} /><Field label="Кедровое масло, руб." type="number" value={formData.cedroilTariff || ''} onChange={(value) => updateTariff('cedroilTariff', Number(value) || 0)} /><p className="text-xs leading-4 text-slate-500">Сейчас тарифы сохраняются на этом рабочем месте. Для общего хранения нужна backend-настройка в базе.</p></div></Section></div></div>}

          {requestType === 'pickup_from_tc' && <><Section title="Клиент"><ClientSelect label="Выберите клиента" value={formData.clientId} clients={clients} onChange={(id) => selectClient(id, 'pickupClient')} /></Section><div className="grid gap-3 lg:grid-cols-2"><Section title="Транспортная компания"><div className="grid gap-2.5 md:grid-cols-2"><SelectField label="Направление" value={formData.pickupDirection || 'tc_to_recipient'} onChange={(value) => updateField('pickupDirection', value as LocalFormData['pickupDirection'])} options={[["tc_to_recipient", "ТК → получатель"], ["recipient_to_tc", "Получатель → ТК"]]} className="md:col-span-2" /><Field label="Название ТК" value={formData.tcName || ''} onChange={(value) => updateField('tcName', value)} className="md:col-span-2" /><Field label="Адрес ТК" value={formData.tcAddress || ''} onChange={(value) => updateField('tcAddress', value)} className="md:col-span-2" /><Field label="Номер трекинга" value={formData.trackingNumber || ''} onChange={(value) => updateField('trackingNumber', value)} className="md:col-span-2" /></div></Section><Section title="Получатель"><div className="grid gap-2.5 md:grid-cols-2"><ClientSelect label="Выберите получателя" value={formData.pickupRecipientClientId} clients={clients} onChange={(id) => selectClient(id, 'pickupRecipient')} className="md:col-span-2" /><Field label="Получатель" value={formData.recipientName || ''} onChange={(value) => updateField('recipientName', value)} /><Field label="Телефон получателя" value={formData.recipientPhone || ''} onChange={(value) => updateField('recipientPhone', value)} /><Field label="Адрес доставки" value={formData.deliveryAddress || ''} onChange={(value) => updateField('deliveryAddress', value)} className="md:col-span-2" /><TextareaField label="Комментарии" value={formData.comments || ''} onChange={(value) => updateField('comments', value)} className="md:col-span-2" /></div></Section></div></>}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Отмена</button><button type="submit" disabled={isLoading} className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? (mode === 'edit' ? 'Сохранение...' : 'Создание...') : (submitLabel || (mode === 'edit' ? 'Сохранить изменения' : 'Создать заявку'))}</button></div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-sm"><h3 className="mb-2.5 text-sm font-semibold leading-none text-slate-950">{title}</h3>{children}</section>; }
function Field({ label, value, onChange, required, type = 'text', className = '' }: { label: string; value: string | number; onChange: (value: string) => void; required?: boolean; type?: string; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} required={required} className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white" /></div>; }
function SelectField({ label, value, onChange, options, className = '' }: { label: string; value: string | number; onChange: (value: string) => void; options: Array<[string | number, string]>; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white">{options.map(([optionValue, labelText]) => <option key={String(optionValue)} value={optionValue}>{labelText}</option>)}</select></div>; }
function ClientSelect({ label, value, clients, onChange, className = '' }: { label: string; value?: number; clients: Client[]; onChange: (value: number | undefined) => void; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><select value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white"><option value="">-- Не выбрано --</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name} ({client.address})</option>)}</select></div>; }
function TextareaField({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <div className={className}><label className="mb-1 block text-sm font-medium leading-none text-slate-700">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} rows={3} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm leading-5 outline-none transition focus:border-slate-300 focus:bg-white" /></div>; }
