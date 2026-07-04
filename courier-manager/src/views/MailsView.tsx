import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, MailPlus, MailCheck, Search } from 'lucide-react';
import * as api from '../lib/api';
import * as XLSX from 'xlsx';
import { formatLocalDate, formatLocalDateTime } from '../lib/local-time';
import { AppSelect } from '../components/AppSelect';

interface Mail {
  id: number;
  waybillNumber: string;
  recipientName: string;
  recipientPhone?: string;
  deliveryAddress: string;
  status: 'not_delivered' | 'delivered' | 'failed';
  createdAt: string;
  deliveredAt?: string;
  recipientSignature?: string;
  courierName?: string;
  courier?: { name?: string; fullName?: string };
}

interface CellRange { column: string; startRow: number; endRow: number }
interface FieldMapping { waybill: CellRange; recipient: CellRange; address: CellRange; phone?: CellRange }
type MailStatus = 'all' | 'not_delivered' | 'delivered';
type PreviewCell = string | number | boolean | Date | null | undefined;

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const compactInputClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

const statusLabels: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'Доставлено', not_delivered: 'В работе' };
const statusClass: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'border-slate-300 bg-white text-slate-950', not_delivered: 'border-slate-200 bg-slate-50 text-slate-600' };
const statusDotClass: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'bg-slate-950', not_delivered: 'bg-slate-300' };

const getCourierName = (mail: Mail) => mail.courierName || mail.courier?.name || mail.courier?.fullName || 'Не назначен';
const cellToText = (value: PreviewCell) => value === null || value === undefined ? '' : String(value).trim();

function toDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateKey(): string {
  return toDateKey(new Date());
}

function isMailVisibleOnArchiveDate(mail: Mail, archiveDate: string): boolean {
  const createdDate = toDateKey(mail.createdAt);
  const deliveredDate = mail.deliveredAt ? toDateKey(mail.deliveredAt) : '';

  if (!createdDate) return false;

  if (mail.status === 'delivered') {
    return deliveredDate === archiveDate || (!deliveredDate && createdDate === archiveDate);
  }

  return createdDate <= archiveDate;
}

function columnToIndex(col: string): number {
  let index = 0;
  const normalized = col.trim().toUpperCase();
  for (let i = 0; i < normalized.length; i += 1) index = index * 26 + normalized.charCodeAt(i) - 64;
  return index - 1;
}

function indexToColumn(index: number): string {
  let n = index + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export default function MailsView({ archiveDate }: { archiveDate?: string }) {
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [fileData, setFileData] = useState<PreviewCell[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState(50);
  const [mapping, setMapping] = useState<FieldMapping>({ waybill: { column: 'A', startRow: 2, endRow: 100 }, recipient: { column: 'B', startRow: 2, endRow: 100 }, address: { column: 'C', startRow: 2, endRow: 100 } });
  const [searchQuery, setSearchQuery] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    waybillNumber: '',
    recipientName: '',
    recipientPhone: '',
    deliveryAddress: '',
  });
  const selectedArchiveDate = archiveDate || getTodayDateKey();
  const manifestInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { loadMails(); }, []);

  const getCellValue = (rowIndex: number, colLetter: string): string => cellToText(fileData[rowIndex]?.[columnToIndex(colLetter)]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      const data = XLSX.utils.sheet_to_json<PreviewCell[]>(worksheet, { header: 1, defval: '', blankrows: true, raw: false, range });
      const normalizedRows: PreviewCell[][] = data.map((row) => Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => row[index] ?? ''));
      const cols = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => indexToColumn(range.s.c + index));
      const endRow = Math.max(2, Math.min(normalizedRows.length, 100));
      setFileData(normalizedRows);
      setColumns(cols);
      setPreviewRows(Math.min(50, Math.max(10, normalizedRows.length)));
      setMapping({ waybill: { column: cols[0] || 'A', startRow: 2, endRow }, recipient: { column: cols[1] || cols[0] || 'A', startRow: 2, endRow }, address: { column: cols[2] || cols[0] || 'A', startRow: 2, endRow } });
      setShowMappingForm(true);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Ошибка при чтении файла. Проверьте формат Excel/CSV.');
    }
  };

  const handleUploadManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || fileData.length === 0) return alert('Выберите файл');
    try {
      setLoading(true);
      const mailsToCreate: Array<{ waybillNumber: string; recipientName: string; deliveryAddress: string; recipientPhone: string }> = [];
      const startRow = Math.max(0, mapping.waybill.startRow - 1);
      const endRow = Math.min(Math.max(mapping.waybill.endRow, mapping.recipient.endRow, mapping.address.endRow, mapping.phone?.endRow || 0), fileData.length);
      for (let i = startRow; i < endRow; i += 1) {
        const waybill = getCellValue(i, mapping.waybill.column);
        const recipient = getCellValue(i, mapping.recipient.column);
        const address = getCellValue(i, mapping.address.column);
        const phone = mapping.phone ? getCellValue(i, mapping.phone.column) : '';
        if (waybill && recipient && address) mailsToCreate.push({ waybillNumber: waybill, recipientName: recipient, deliveryAddress: address, recipientPhone: phone || '' });
      }
      if (mailsToCreate.length === 0) return alert('Не найдено строк для загрузки. Проверьте выбранные столбцы и номера строк.');
      let successCount = 0;
      let failedCount = 0;
      for (const mail of mailsToCreate) {
        try { await api.createMail(mail); successCount += 1; } catch (error) { failedCount += 1; console.error('Error creating mail:', mail, error); }
      }
      alert(`Манифест обработан. Добавлено: ${successCount}${failedCount ? `. Ошибок: ${failedCount}` : ''}`);
      setSelectedFile(null);
      setShowMappingForm(false);
      setFileData([]);
      setColumns([]);
      await loadMails();
    } catch (error) {
      console.error('Error uploading manifest:', error);
      alert('Ошибка при загрузке манифеста');
    } finally {
      setLoading(false);
    }
  };

  const resetManualForm = () => {
    setManualForm({
      waybillNumber: '',
      recipientName: '',
      recipientPhone: '',
      deliveryAddress: '',
    });
  };

  const handleCreateManualMail = async (event: React.FormEvent) => {
    event.preventDefault();

    const waybillNumber = manualForm.waybillNumber.trim();
    const recipientName = manualForm.recipientName.trim();
    const deliveryAddress = manualForm.deliveryAddress.trim();

    if (!waybillNumber || !recipientName || !deliveryAddress) {
      alert('Заполните накладную, получателя и адрес');
      return;
    }

    try {
      setLoading(true);

      await api.createMail({
        waybillNumber,
        recipientName,
        deliveryAddress,
        recipientPhone: manualForm.recipientPhone.trim(),
      });

      setShowManualForm(false);
      resetManualForm();
      await loadMails();
    } catch (error) {
      console.error('Error creating mail manually:', error);
      alert('Ошибка при добавлении письма');
    } finally {
      setLoading(false);
    }
  };

  const loadMails = async () => {
    try {
      setLoading(true);
      const data = await api.getAllMails({});
      setMails(data);
    } catch (error) {
      console.error('Error loading mails:', error);
      setMails([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredMails = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return mails.filter((mail) => {
      if (!isMailVisibleOnArchiveDate(mail, selectedArchiveDate)) return false;
      if (!query) return true;

      return [mail.waybillNumber, mail.recipientName, mail.recipientPhone || '', mail.deliveryAddress, getCourierName(mail)]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [mails, searchQuery, selectedArchiveDate]);

  const deliveredTodayCount = filteredMails.filter((mail) => mail.status === 'delivered').length;
  const inWorkCount = filteredMails.length - deliveredTodayCount;

  return (
    <div className="w-full space-y-5">

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по накладной, адресу, получателю или телефону..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">Дата: {selectedArchiveDate}</span>
            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">В работе: {inWorkCount}</span>
            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">Доставлено: {deliveredTodayCount}</span>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => manifestInputRef.current?.click()}
              className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 sm:w-auto"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Загрузить манифест
            </button>
            <button
              type="button"
              onClick={() => {
                resetManualForm();
                setShowManualForm(true);
              }}
              className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
            >
              <MailPlus className="h-4 w-4" />
              Добавить вручную
            </button>
          </div>

          <input
            ref={manifestInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <MailsTable mails={filteredMails} loading={loading} compactTitle="Письма выбранного дня" />
      </div>


      {showManualForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">Добавить письмо вручную</h3>
              <p className="mt-1 text-sm text-slate-500">Заполните накладную, получателя и адрес доставки.</p>
            </div>

            <form onSubmit={handleCreateManualMail} className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Накладная *</span>
                <input
                  value={manualForm.waybillNumber}
                  onChange={(event) => setManualForm({ ...manualForm, waybillNumber: event.target.value })}
                  className={inputClass}
                  placeholder="Например: 97-0214962"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Получатель *</span>
                <input
                  value={manualForm.recipientName}
                  onChange={(event) => setManualForm({ ...manualForm, recipientName: event.target.value })}
                  className={inputClass}
                  placeholder="ФИО или организация"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Телефон</span>
                <input
                  value={manualForm.recipientPhone}
                  onChange={(event) => setManualForm({ ...manualForm, recipientPhone: event.target.value })}
                  className={inputClass}
                  placeholder="Можно оставить пустым"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Адрес доставки *</span>
                <textarea
                  value={manualForm.deliveryAddress}
                  onChange={(event) => setManualForm({ ...manualForm, deliveryAddress: event.target.value })}
                  className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="Адрес доставки"
                  required
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualForm(false);
                    resetManualForm();
                  }}
                  className={secondaryButtonClass}
                >
                  Отмена
                </button>

                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? 'Добавляем...' : 'Добавить письмо'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showMappingForm && fileData.length > 0 && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-slate-950">Настройка столбцов манифеста</h3><p className="mt-1 text-sm text-slate-500">Проверьте ячейки из Excel и укажите, откуда брать данные.</p></div>
            <form onSubmit={handleUploadManifest} className="space-y-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"><span>Лист: {fileData.length} строк, {columns.length} столбцов. Показано строк: {Math.min(previewRows, fileData.length)}</span><button type="button" className={secondaryButtonClass} onClick={() => setPreviewRows((prev) => Math.min(fileData.length, prev + 50))}>Показать ещё 50 строк</button></div>
              <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full border-collapse text-xs"><thead className="sticky top-0 z-10 bg-slate-100"><tr><th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-600">Строка</th>{columns.map(col => <th key={col} className="min-w-[120px] border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">{col}</th>)}</tr></thead><tbody>{fileData.slice(0, previewRows).map((row, idx) => <tr key={idx} className="hover:bg-slate-50"><td className="sticky left-0 border-b border-r border-slate-200 bg-white px-2 py-1 font-semibold text-slate-500">{idx + 1}</td>{columns.map((col, colIdx) => <td key={col} className="max-w-[220px] border-b border-r border-slate-200 px-2 py-1 text-slate-600"><span title={cellToText(row[colIdx])} className="block truncate">{cellToText(row[colIdx]) || <span className="text-slate-300">пусто</span>}</span></td>)}</tr>)}</tbody></table></div>
              <div className="grid gap-4 md:grid-cols-2"><MappingField label="Номер накладной" required columns={columns} value={mapping.waybill} onChange={(value) => setMapping({ ...mapping, waybill: value })} /><MappingField label="Получатель" required columns={columns} value={mapping.recipient} onChange={(value) => setMapping({ ...mapping, recipient: value })} /><MappingField label="Адрес доставки" required columns={columns} value={mapping.address} onChange={(value) => setMapping({ ...mapping, address: value })} /><PhoneMapping columns={columns} mapping={mapping} setMapping={setMapping} /></div>
              <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><button type="button" onClick={() => { setShowMappingForm(false); setSelectedFile(null); setFileData([]); setColumns([]); }} className={secondaryButtonClass}>Отмена</button><button type="submit" disabled={loading} className={primaryButtonClass}>{loading ? 'Загрузка...' : 'Загрузить манифест'}</button></div>
            </form>
          </div>
        </div>, document.body)}
    </div>
  );
}


function MappingField({ label, required, columns, value, onChange }: { label: string; required?: boolean; columns: string[]; value: CellRange; onChange: (value: CellRange) => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><label className="block text-sm font-semibold text-slate-900">{label} {required && <span className="text-slate-400">*</span>}</label><AppSelect className="mt-2" compact value={value.column} options={columns.map(col => ({ value: col, label: `Столбец ${col}` }))} onChange={(column) => onChange({ ...value, column: String(column ?? '') })} emptyText="Нет столбцов" searchable={columns.length > 7} /><div className="mt-3 grid grid-cols-2 gap-2"><RangeInput label="От строки" value={value.startRow} onChange={(nextValue) => onChange({ ...value, startRow: nextValue })} /><RangeInput label="До строки" value={value.endRow} onChange={(nextValue) => onChange({ ...value, endRow: nextValue })} /></div></div>;
}
function PhoneMapping({ columns, mapping, setMapping }: { columns: string[]; mapping: FieldMapping; setMapping: React.Dispatch<React.SetStateAction<FieldMapping>> }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><label className="block text-sm font-semibold text-slate-900">Телефон</label><AppSelect className="mt-2" compact value={mapping.phone?.column ?? null} options={[{ value: null, label: 'Не использовать' }, ...columns.map(col => ({ value: col, label: `Столбец ${col}` }))]} onChange={(column) => setMapping((prev) => ({ ...prev, phone: typeof column === 'string' && column ? { column, startRow: prev.phone?.startRow || prev.waybill.startRow, endRow: prev.phone?.endRow || prev.waybill.endRow } : undefined }))} emptyText="Нет столбцов" searchable={columns.length > 7} />{mapping.phone && <div className="mt-3 grid grid-cols-2 gap-2"><RangeInput label="От строки" value={mapping.phone.startRow} onChange={(value) => setMapping((prev) => ({ ...prev, phone: { ...prev.phone!, startRow: value } }))} /><RangeInput label="До строки" value={mapping.phone.endRow} onChange={(value) => setMapping((prev) => ({ ...prev, phone: { ...prev.phone!, endRow: value } }))} /></div>}</div>; }
function RangeInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="block"><span className="text-xs font-medium text-slate-500">{label}</span><input type="number" min="1" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 1)} className={`${compactInputClass} mt-1`} /></label>; }


function MailCompletionProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const size = 20;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - progress);
  const isDone = total > 0 && completed === total;

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 shadow-sm">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isDone ? 'rgb(16 185 129)' : 'rgb(100 116 139)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>

      <span className={isDone ? 'text-emerald-600' : 'text-slate-600'}>
        {completed}/{total} доставлено
      </span>
    </div>
  );
}

function MailsTable({ mails, loading, compactTitle, showReportColumns = false }: { mails: Mail[]; loading: boolean; compactTitle: string; showReportColumns?: boolean }) {
  const deliveredCount = mails.filter((mail) => mail.status === 'delivered').length;

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-950">{compactTitle}</h2><MailCompletionProgress completed={deliveredCount} total={mails.length} /></div>{loading ? <MailsSkeleton /> : mails.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center text-sm text-slate-500"><MailCheck className="mb-3 h-8 w-8 text-slate-300" /><p className="font-medium text-slate-950">Нет писем для отображения</p><p className="mt-1 max-w-sm">На выбранную дату нет писем. Недоставленные письма автоматически переходят на следующий день.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50"><tr className="border-b border-slate-200"><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Накладная</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Получатель</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Адрес</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Статус</th>{showReportColumns && <><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Курьер</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Доставка</th></>}<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Создано</th></tr></thead><tbody className="divide-y divide-slate-100">{mails.map((mail) => <tr key={mail.id} className="hover:bg-slate-50/80"><td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-950">{mail.waybillNumber}</td><td className="px-3 py-2.5 text-slate-900"><div className="font-medium">{mail.recipientName}</div><div className="text-xs text-slate-500">{mail.recipientPhone || 'Телефон не указан'}</div></td><td className="max-w-[360px] px-3 py-2.5 text-slate-600"><span className="line-clamp-2">{mail.deliveryAddress}</span></td><td className="px-3 py-2.5"><span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[mail.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[mail.status]}`} />{statusLabels[mail.status]}</span></td>{showReportColumns && <><td className="px-3 py-2.5 text-slate-600">{getCourierName(mail)}</td><td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{mail.deliveredAt ? formatLocalDateTime(mail.deliveredAt) : '—'}</td></>}<td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatLocalDate(mail.createdAt)}</td></tr>)}</tbody></table></div>}</div>;
}

function MailsSkeleton() {
  return <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 md:grid-cols-[140px_180px_minmax(0,1fr)_120px_90px]"><div className="skeleton-line h-4 w-24" /><div className="space-y-2"><div className="skeleton-line h-4 w-28" /><div className="skeleton-line h-3 w-20" /></div><div className="skeleton-line h-4 w-full" /><div className="skeleton-line h-6 w-24" /><div className="skeleton-line h-4 w-16" /></div>)}</div>;
}
