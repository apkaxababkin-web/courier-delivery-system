import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Download, FileText, CheckCircle, Clock } from 'lucide-react';
import * as api from '../lib/api';
import { useManagerRealtime } from '../lib/useManagerRealtime';
import { RealtimeStatusCard } from '../components/RealtimeStatusCard';
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
}

interface CellRange {
  column: string;
  startRow: number;
  endRow: number;
}

interface FieldMapping {
  waybill: CellRange;
  recipient: CellRange;
  address: CellRange;
  phone?: CellRange;
}

const today = new Date().toISOString().split('T')[0];

export default function MailsView() {
  const realtime = useManagerRealtime(5000);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({
    waybill: { column: 'A', startRow: 2, endRow: 100 },
    recipient: { column: 'B', startRow: 2, endRow: 100 },
    address: { column: 'C', startRow: 2, endRow: 100 },
  });
  const [filterStatus, setFilterStatus] = useState<'all' | 'not_delivered' | 'delivered' | 'failed'>('all');
  const [selectedDate, setSelectedDate] = useState(today);

  const mails = (realtime.snapshot?.mails ?? []) as Mail[];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      setFileData(data);

      const maxCols = Math.max(...data.map((row: any) => row.length || 0), 0);
      const cols = [];
      for (let i = 0; i < maxCols; i++) cols.push(String.fromCharCode(65 + i));
      setColumns(cols);
      setShowMappingForm(true);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Ошибка при чтении файла');
    }
  };

  const columnToIndex = (col: string): number => col.charCodeAt(0) - 65;

  const getCellValue = (rowIndex: number, colLetter: string): string => {
    const colIndex = columnToIndex(colLetter);
    const row = fileData[rowIndex];
    if (!row || colIndex >= row.length) return '';
    return String(row[colIndex] || '');
  };

  const buildManifestRows = () => {
    const mailsToCreate = [];
    const startRow = mapping.waybill.startRow - 1;
    const endRow = Math.min(mapping.waybill.endRow, fileData.length);

    for (let i = startRow; i < endRow; i++) {
      const waybill = getCellValue(i, mapping.waybill.column).trim();
      const recipient = getCellValue(i, mapping.recipient.column).trim();
      const address = getCellValue(i, mapping.address.column).trim();
      const phone = mapping.phone ? getCellValue(i, mapping.phone.column).trim() : undefined;

      if (waybill && recipient && address) {
        mailsToCreate.push({
          waybillNumber: waybill,
          recipientName: recipient,
          deliveryAddress: address,
          recipientPhone: phone || undefined,
        });
      }
    }

    return mailsToCreate;
  };

  const handleUploadManifest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || fileData.length === 0) {
      alert('Выберите файл');
      return;
    }

    try {
      setLoading(true);
      const mailsToCreate = buildManifestRows();
      const result = await api.bulkCreateMails(mailsToCreate);
      setImportResult(result);
      setSelectedFile(null);
      setShowMappingForm(false);
      setFileData([]);
      await realtime.refresh(false);
    } catch (error) {
      console.error('Error uploading manifest:', error);
      alert('Ошибка при загрузке манифеста');
    } finally {
      setLoading(false);
    }
  };

  const filteredMails = useMemo(() => {
    return mails.filter(mail => {
      if (filterStatus !== 'all' && mail.status !== filterStatus) return false;
      const createdAt = mail.createdAt ? mail.createdAt.slice(0, 10) : '';
      if (selectedDate && createdAt && createdAt !== selectedDate) return false;
      return true;
    });
  }, [mails, filterStatus, selectedDate]);

  const handleExportReport = async () => {
    try {
      const headers = ['Номер накладной', 'Получатель', 'Адрес', 'Телефон', 'Статус', 'Дата доставки'];
      const rows = filteredMails.map(mail => [
        mail.waybillNumber,
        mail.recipientName,
        mail.deliveryAddress,
        mail.recipientPhone || '',
        mail.status,
        mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleDateString('ru-RU') : '',
      ]);

      const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `mails_${selectedDate || today}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Ошибка при экспорте отчёта');
    }
  };

  const stats = useMemo(() => ({
    total: filteredMails.length,
    delivered: filteredMails.filter(m => m.status === 'delivered').length,
    notDelivered: filteredMails.filter(m => m.status === 'not_delivered').length,
    failed: filteredMails.filter(m => m.status === 'failed').length,
  }), [filteredMails]);

  const isBusy = loading || realtime.isLoading;

  return (
    <div className="space-y-6">
      <RealtimeStatusCard
        isRefreshing={realtime.isRefreshing}
        error={realtime.error}
        lastSyncAt={realtime.lastSyncAt}
        onRefresh={() => realtime.refresh(true)}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Почтовые отправления</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Диспетчерская по письмам</h2>
            <p className="mt-1 text-sm text-slate-500">Просмотр доставок по выбранной дате.</p>
          </div>

          <div className="flex items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" id="mail-manifest-input" />
            <label htmlFor="mail-manifest-input" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              <Upload size={18} />
              Манифест
            </label>
            <button onClick={handleExportReport} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <Download size={18} />
              Экспорт
            </button>
          </div>
        </div>
      </div>

      {importResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Импорт завершён: добавлено {importResult.created}, дубликатов пропущено {importResult.skipped}
          {importResult.errors.length ? `, ошибок ${importResult.errors.length}` : ''}.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Всего</div><div className="mt-2 text-3xl font-bold text-slate-900">{stats.total}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-slate-500"><CheckCircle size={16} />Доставлено</div><div className="mt-2 text-3xl font-bold text-slate-900">{stats.delivered}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-slate-500"><Clock size={16} />В работе</div><div className="mt-2 text-3xl font-bold text-slate-900">{stats.notDelivered}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Проблемы</div><div className="mt-2 text-3xl font-bold text-slate-900">{stats.failed}</div></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-slate-200 p-4 lg:grid-cols-[280px_220px_1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Статус</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="all">Все статусы</option>
              <option value="delivered">Доставлено</option>
              <option value="not_delivered">В работе</option>
              <option value="failed">Проблемы</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Дата</span>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>

          <div className="text-sm text-slate-500 lg:pb-2">Показаны доставки только за выбранную дату.</div>

          <button onClick={() => realtime.refresh(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Обновить</button>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Операционная очередь</h3>
              <p className="text-sm text-slate-500">Показано: {filteredMails.length}</p>
            </div>

            {isBusy ? (
              <div className="p-12 text-center text-slate-500">Загрузка...</div>
            ) : filteredMails.length === 0 ? (
              <div className="flex min-h-80 flex-col items-center justify-center p-12 text-center text-slate-500">
                <FileText size={36} className="mb-3 text-slate-300" />
                <p className="font-semibold text-slate-900">Нет писем для отображения</p>
                <p className="mt-1 text-sm">Выберите другую дату или загрузите новый манифест.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Накладная</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Получатель</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Адрес</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Статус</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Дата доставки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMails.map((mail) => (
                      <tr key={mail.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-3 font-semibold text-slate-900">{mail.waybillNumber}</td>
                        <td className="px-6 py-3 text-slate-900">{mail.recipientName}</td>
                        <td className="px-6 py-3 text-slate-600">{mail.deliveryAddress}</td>
                        <td className="px-6 py-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{mail.status === 'delivered' ? 'Доставлено' : mail.status === 'not_delivered' ? 'В работе' : 'Проблемы'}</span></td>
                        <td className="px-6 py-3 text-slate-600">{mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleDateString('ru-RU') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showMappingForm && fileData.length > 0 && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', padding: 24 }}>
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Выберите диапазон ячеек</h3>
            <p className="mt-1 text-sm text-slate-500">Укажите столбец и диапазон строк для каждого поля.</p>

            <form onSubmit={handleUploadManifest} className="mt-6 space-y-6">
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-200"><th className="border border-slate-300 px-2 py-1 text-left">Строка</th>{columns.map(col => <th key={col} className="border border-slate-300 px-2 py-1 text-left">{col}</th>)}</tr>
                  </thead>
                  <tbody>{fileData.slice(0, 10).map((row, idx) => <tr key={idx}><td className="border border-slate-300 px-2 py-1 font-semibold text-slate-600">{idx + 1}</td>{columns.map(col => <td key={col} className="border border-slate-300 px-2 py-1 text-slate-700">{String(row[columnToIndex(col)] || '').substring(0, 20)}</td>)}</tr>)}</tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(['waybill', 'recipient', 'address'] as const).map((field) => (
                  <div key={field} className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-900">{field === 'waybill' ? 'Номер накладной' : field === 'recipient' ? 'Имя получателя' : 'Адрес доставки'} *</label>
                    <select value={mapping[field].column} onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], column: e.target.value } })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}</select>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min="1" value={mapping[field].startRow} onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], startRow: parseInt(e.target.value) } })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="От строки" />
                      <input type="number" min="1" value={mapping[field].endRow} onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], endRow: parseInt(e.target.value) } })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="До строки" />
                    </div>
                  </div>
                ))}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-900">Телефон</label>
                  <select value={mapping.phone?.column || ''} onChange={(e) => setMapping({ ...mapping, phone: e.target.value ? { column: e.target.value, startRow: mapping.phone?.startRow || 2, endRow: mapping.phone?.endRow || 100 } : undefined })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Не использовать</option>{columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}</select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">{loading ? 'Загрузка...' : 'Загрузить'}</button>
                <button type="button" onClick={() => { setShowMappingForm(false); setSelectedFile(null); setFileData([]); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Отмена</button>
              </div>
            </form>
          </div>
        </div>, document.body)}
    </div>
  );
}
