import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Filter, MailCheck, Upload } from 'lucide-react';
import * as api from '../lib/api';
import * as XLSX from 'xlsx';

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
type TabId = 'upload' | 'reports';
type MailStatus = 'all' | 'not_delivered' | 'delivered';
type PreviewCell = string | number | boolean | Date | null | undefined;

const inputClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const compactInputClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const primaryButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

const statusLabels: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'Доставлено', not_delivered: 'В работе' };
const statusClass: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'border-slate-300 bg-white text-slate-950', not_delivered: 'border-slate-200 bg-slate-50 text-slate-600' };
const statusDotClass: Record<Exclude<MailStatus, 'all'>, string> = { delivered: 'bg-slate-950', not_delivered: 'bg-slate-300' };

const getCourierName = (mail: Mail) => mail.courierName || mail.courier?.name || mail.courier?.fullName || 'Не назначен';
const cellToText = (value: PreviewCell) => value === null || value === undefined ? '' : String(value).trim();

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

export default function MailsView() {
  const [activeTab, setActiveTab] = useState<TabId>('upload');
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [fileData, setFileData] = useState<PreviewCell[][]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState(50);
  const [mapping, setMapping] = useState<FieldMapping>({ waybill: { column: 'A', startRow: 2, endRow: 100 }, recipient: { column: 'B', startRow: 2, endRow: 100 }, address: { column: 'C', startRow: 2, endRow: 100 } });
  const [filterStatus, setFilterStatus] = useState<MailStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });

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

  const loadMails = async () => {
    try {
      setLoading(true);
      const data = await api.getAllMails({ status: filterStatus, dateFrom: dateRange.from, dateTo: dateRange.to });
      setMails(data);
    } catch (error) {
      console.error('Error loading mails:', error);
      setMails([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    try {
      const headers = ['Номер накладной', 'Получатель', 'Адрес', 'Телефон', 'Статус', 'Курьер', 'Дата доставки'];
      const rows = filteredMails.map(mail => [mail.waybillNumber, mail.recipientName, mail.deliveryAddress, mail.recipientPhone || '', mail.status, getCourierName(mail), mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleDateString('ru-RU') : '']);
      const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Ошибка при экспорте отчёта');
    }
  };

  const filteredMails = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return mails.filter(mail => {
      if (filterStatus !== 'all' && mail.status !== filterStatus) return false;
      if (!query) return true;
      return [mail.waybillNumber, mail.recipientName, mail.recipientPhone || '', mail.deliveryAddress, getCourierName(mail)].join(' ').toLowerCase().includes(query);
    });
  }, [mails, filterStatus, searchQuery]);

  const stats = { total: mails.length, delivered: mails.filter(m => m.status === 'delivered').length, notDelivered: mails.filter(m => m.status === 'not_delivered').length, failed: mails.filter(m => false).length };
  const tabs: Array<{ id: TabId; label: string; icon: typeof Upload }> = [{ id: 'upload', label: 'Манифест', icon: Upload }, { id: 'reports', label: 'Отчёты', icon: FileText }];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Почтовые отправления</p><h1 className="mt-1 text-xl font-semibold text-slate-950">Диспетчерская по манифестам</h1><p className="mt-1 text-sm text-slate-500">Загрузка, проверка, фильтрация и отчёты по доставке писем.</p></div>
        <div className="inline-flex w-fit rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {tabs.map(tab => { const Icon = tab.icon; const isActive = activeTab === tab.id; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${isActive ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={16} />{tab.label}</button>; })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Всего" value={stats.total} /><Stat label="Доставлено" value={stats.delivered} /><Stat label="В работе" value={stats.notDelivered} /><Stat label="Проблемы" value={stats.failed} />
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <FieldShell label="Статус"><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as MailStatus)} className={inputClass}><option value="all">Все статусы</option><option value="delivered">Доставлено</option><option value="not_delivered">В работе</option><option value="failed">Проблема</option></select></FieldShell>
            <FieldShell label="Дата"><input type="date" value={dateRange.from} onChange={(e) => setDateRange({ from: e.target.value, to: e.target.value })} className={inputClass} /></FieldShell>
            <FieldShell label="Поиск"><input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Накладная, адрес, получатель" className={inputClass} /></FieldShell>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={loadMails} disabled={loading} className={secondaryButtonClass}><Filter size={16} />{loading ? 'Обновление...' : 'Применить'}</button><button type="button" onClick={handleExportReport} className={secondaryButtonClass}><Download size={16} />Экспорт</button></div>
        </div>

        {activeTab === 'upload' && <div className="p-4"><MailsTable mails={filteredMails.slice(0, 30)} loading={loading} compactTitle="Операционная очередь" /></div>}
        {activeTab === 'reports' && <div className="p-4"><MailsTable mails={filteredMails} loading={loading} compactTitle="Отчёты доставки" showReportColumns /></div>}
      </div>

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

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>; }
function FieldShell({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>{children}</div>; }
function UploadPanel({ selectedFile, onFileSelect }: { selectedFile: File | null; onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><input type="file" accept=".xlsx,.xls,.csv" onChange={onFileSelect} className="hidden" id="file-input" /><div className="flex items-start gap-3"><div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700"><Upload size={18} /></div><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-950">Загрузить манифест</h2><p className="mt-1 text-xs leading-5 text-slate-500">Excel или CSV. После выбора откроется настройка столбцов.</p>{selectedFile && <p className="mt-3 truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">{selectedFile.name}</p>}</div></div><label htmlFor="file-input" className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"><Upload size={16} />Выбрать файл</label><div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500"><p className="font-semibold text-slate-700">Workflow</p><p className="mt-1">Файл → предпросмотр → столбцы → загрузка писем.</p></div></div>; }

function MappingField({ label, required, columns, value, onChange }: { label: string; required?: boolean; columns: string[]; value: CellRange; onChange: (value: CellRange) => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><label className="block text-sm font-semibold text-slate-900">{label} {required && <span className="text-slate-400">*</span>}</label><select value={value.column} onChange={(e) => onChange({ ...value, column: e.target.value })} className={`${compactInputClass} mt-2`}>{columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}</select><div className="mt-3 grid grid-cols-2 gap-2"><RangeInput label="От строки" value={value.startRow} onChange={(nextValue) => onChange({ ...value, startRow: nextValue })} /><RangeInput label="До строки" value={value.endRow} onChange={(nextValue) => onChange({ ...value, endRow: nextValue })} /></div></div>;
}
function PhoneMapping({ columns, mapping, setMapping }: { columns: string[]; mapping: FieldMapping; setMapping: React.Dispatch<React.SetStateAction<FieldMapping>> }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><label className="block text-sm font-semibold text-slate-900">Телефон</label><select value={mapping.phone?.column || ''} onChange={(e) => setMapping((prev) => ({ ...prev, phone: e.target.value ? { column: e.target.value, startRow: prev.phone?.startRow || prev.waybill.startRow, endRow: prev.phone?.endRow || prev.waybill.endRow } : undefined }))} className={`${compactInputClass} mt-2`}><option value="">Не использовать</option>{columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}</select>{mapping.phone && <div className="mt-3 grid grid-cols-2 gap-2"><RangeInput label="От строки" value={mapping.phone.startRow} onChange={(value) => setMapping((prev) => ({ ...prev, phone: { ...prev.phone!, startRow: value } }))} /><RangeInput label="До строки" value={mapping.phone.endRow} onChange={(value) => setMapping((prev) => ({ ...prev, phone: { ...prev.phone!, endRow: value } }))} /></div>}</div>; }
function RangeInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="block"><span className="text-xs font-medium text-slate-500">{label}</span><input type="number" min="1" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 1)} className={`${compactInputClass} mt-1`} /></label>; }

function MailsTable({ mails, loading, compactTitle, showReportColumns = false }: { mails: Mail[]; loading: boolean; compactTitle: string; showReportColumns?: boolean }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><div><h2 className="text-sm font-semibold text-slate-950">{compactTitle}</h2><p className="text-xs text-slate-500">Показано: {mails.length}</p></div></div>{loading ? <MailsSkeleton /> : mails.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center text-sm text-slate-500"><MailCheck className="mb-3 h-8 w-8 text-slate-300" /><p className="font-medium text-slate-950">Нет писем для отображения</p><p className="mt-1 max-w-sm">Измените фильтры или загрузите новый манифест.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50"><tr className="border-b border-slate-200"><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Накладная</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Получатель</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Адрес</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Статус</th>{showReportColumns && <><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Курьер</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Доставка</th></>}<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Создано</th><th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Действия</th></tr></thead><tbody className="divide-y divide-slate-100">{mails.map((mail) => <tr key={mail.id} className="hover:bg-slate-50/80"><td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-950">{mail.waybillNumber}</td><td className="px-3 py-2.5 text-slate-900"><div className="font-medium">{mail.recipientName}</div><div className="text-xs text-slate-500">{mail.recipientPhone || 'Телефон не указан'}</div></td><td className="max-w-[360px] px-3 py-2.5 text-slate-600"><span className="line-clamp-2">{mail.deliveryAddress}</span></td><td className="px-3 py-2.5"><span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[mail.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[mail.status]}`} />{statusLabels[mail.status]}</span></td>{showReportColumns && <><td className="px-3 py-2.5 text-slate-600">{getCourierName(mail)}</td><td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td></>}<td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{new Date(mail.createdAt).toLocaleDateString('ru-RU')}</td><td className="px-3 py-2.5 text-right"><button type="button" onClick={async () => { if (!confirm(`Удалить письмо ${mail.waybillNumber}?`)) return; await api.deleteMail(mail.id); location.reload(); }} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Удалить</button></td></tr>)}</tbody></table></div>}</div>;
}

function MailsSkeleton() {
  return <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 md:grid-cols-[140px_180px_minmax(0,1fr)_120px_90px]"><div className="skeleton-line h-4 w-24" /><div className="space-y-2"><div className="skeleton-line h-4 w-28" /><div className="skeleton-line h-3 w-20" /></div><div className="skeleton-line h-4 w-full" /><div className="skeleton-line h-6 w-24" /><div className="skeleton-line h-4 w-16" /></div>)}</div>;
}
