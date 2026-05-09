import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Download, FileText, CheckCircle, Clock, RefreshCcw } from 'lucide-react';
import * as api from '../lib/api';
import { useManagerRealtime } from '../lib/useManagerRealtime';
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

export default function MailsView() {
  const realtime = useManagerRealtime(5000);
  const [activeTab, setActiveTab] = useState<'upload' | 'reports'>('upload');
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
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

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
      link.setAttribute('download', `report_${new Date().toISOString().split('T')[0]}.csv`);
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

  const filteredMails = useMemo(() => {
    return mails.filter(mail => {
      if (filterStatus !== 'all' && mail.status !== filterStatus) return false;
      const createdAt = mail.createdAt ? mail.createdAt.slice(0, 10) : '';
      if (dateRange.from && createdAt && createdAt < dateRange.from) return false;
      if (dateRange.to && createdAt && createdAt > dateRange.to) return false;
      return true;
    });
  }, [mails, filterStatus, dateRange.from, dateRange.to]);

  const stats = useMemo(() => ({
    total: mails.length,
    delivered: mails.filter(m => m.status === 'delivered').length,
    notDelivered: mails.filter(m => m.status === 'not_delivered').length,
    failed: mails.filter(m => m.status === 'failed').length,
  }), [mails]);

  const isBusy = loading || realtime.isLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span>
          Realtime: {realtime.error ? 'ошибка синхронизации' : 'активен'}
          {realtime.lastSyncAt ? ` · обновлено ${new Date(realtime.lastSyncAt).toLocaleTimeString('ru-RU')}` : ''}
          {realtime.isRefreshing && !realtime.isLoading ? ' · обновление...' : ''}
        </span>
        <button
          type="button"
          onClick={() => realtime.refresh(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw size={16} />
          Обновить
        </button>
      </div>

      {realtime.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {realtime.error}
        </div>
      ) : null}

      {importResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Импорт завершён: добавлено {importResult.created}, дубликатов пропущено {importResult.skipped}
          {importResult.errors.length ? `, ошибок ${importResult.errors.length}` : ''}.
        </div>
      ) : null}

      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('upload')}
          className={`pb-3 px-4 font-medium transition ${activeTab === 'upload' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Upload size={18} className="inline mr-2" />
          Загрузка манифеста
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-3 px-4 font-medium transition ${activeTab === 'reports' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <FileText size={18} className="inline mr-2" />
          Отчёты о доставке
        </button>
      </div>

      {activeTab === 'upload' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-8 border-2 border-dashed border-gray-300 hover:border-blue-500 transition cursor-pointer">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="flex flex-col items-center gap-3 cursor-pointer">
              <Upload size={48} className="text-gray-400" />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">Загрузите манифест</p>
                <p className="text-sm text-gray-600">Поддерживаются файлы Excel (.xlsx, .xls) и CSV</p>
              </div>
              {selectedFile && <p className="text-sm text-green-600 font-medium">✓ Выбран файл: {selectedFile.name}</p>}
            </label>
          </div>

          {showMappingForm && fileData.length > 0 && createPortal(
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', paddingTop: 80 }}>
              <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-5xl my-8 max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Выберите диапазон ячеек</h3>
                <p className="text-sm text-gray-600 mb-6">Укажите столбец и диапазон строк для каждого поля</p>

                <form onSubmit={handleUploadManifest} className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 overflow-x-auto max-h-64 mb-6">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="border border-gray-300 px-2 py-1 text-left">Строка</th>
                          {columns.map(col => <th key={col} className="border border-gray-300 px-2 py-1 text-left bg-gray-300 font-semibold">{col}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {fileData.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className={idx === 0 ? 'bg-yellow-50' : ''}>
                            <td className="border border-gray-300 px-2 py-1 font-semibold text-gray-600">{idx + 1}</td>
                            {columns.map(col => <td key={col} className="border border-gray-300 px-2 py-1 text-gray-700">{String(row[columnToIndex(col)] || '').substring(0, 20)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {(['waybill', 'recipient', 'address'] as const).map((field) => (
                      <div key={field} className="space-y-3">
                        <label className="block text-sm font-semibold text-gray-900">
                          {field === 'waybill' ? 'Номер накладной' : field === 'recipient' ? 'Имя получателя' : 'Адрес доставки'} *
                        </label>
                        <select
                          value={mapping[field].column}
                          onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], column: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-gray-600">От строки</label>
                            <input type="number" min="1" value={mapping[field].startRow} onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], startRow: parseInt(e.target.value) } })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-600">До строки</label>
                            <input type="number" min="1" value={mapping[field].endRow} onChange={(e) => setMapping({ ...mapping, [field]: { ...mapping[field], endRow: parseInt(e.target.value) } })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-gray-900">Телефон (опционально)</label>
                      <select
                        value={mapping.phone?.column || ''}
                        onChange={(e) => setMapping({ ...mapping, phone: e.target.value ? { column: e.target.value, startRow: mapping.phone?.startRow || 2, endRow: mapping.phone?.endRow || 100 } : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Не использовать</option>
                        {columns.map(col => <option key={col} value={col}>Столбец {col}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
                      {loading ? 'Загрузка...' : 'Загрузить'}
                    </button>
                    <button type="button" onClick={() => { setShowMappingForm(false); setSelectedFile(null); setFileData([]); }} className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition font-medium">
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            </div>, document.body)}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Инструкция:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>1. Подготовьте файл Excel с данными писем</li>
              <li>2. Загрузите файл — система покажет превью данных</li>
              <li>3. Выберите столбцы и диапазон строк</li>
              <li>4. Письма загрузятся bulk-импортом с пропуском дубликатов</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4"><div className="text-gray-600 text-sm font-medium">Всего писем</div><div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div></div>
            <div className="bg-green-50 rounded-lg shadow p-4 border border-green-200"><div className="text-green-700 text-sm font-medium flex items-center gap-2"><CheckCircle size={16} />Доставлено</div><div className="text-3xl font-bold text-green-600 mt-2">{stats.delivered}</div></div>
            <div className="bg-orange-50 rounded-lg shadow p-4 border border-orange-200"><div className="text-orange-700 text-sm font-medium flex items-center gap-2"><Clock size={16} />Не доставлено</div><div className="text-3xl font-bold text-orange-600 mt-2">{stats.notDelivered}</div></div>
            <div className="bg-red-50 rounded-lg shadow p-4 border border-red-200"><div className="text-red-700 text-sm font-medium">Ошибки</div><div className="text-3xl font-bold text-red-600 mt-2">{stats.failed}</div></div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">Все</option>
                  <option value="delivered">Доставлено</option>
                  <option value="not_delivered">Не доставлено</option>
                  <option value="failed">Ошибка</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">От даты</label>
                <input type="date" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">До даты</label>
                <input type="date" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button onClick={handleExportReport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium">
              <Download size={20} />Экспортировать
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isBusy ? <div className="p-8 text-center text-gray-500">Загрузка...</div> : filteredMails.length === 0 ? <div className="p-8 text-center text-gray-500">Нет писем для отображения</div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Номер накладной</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Получатель</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Адрес</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Статус</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Дата доставки</th>
                </tr>
              </thead>
              <tbody>
                {filteredMails.map((mail) => (
                  <tr key={mail.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">{mail.waybillNumber}</td>
                    <td className="px-6 py-3 text-gray-900">{mail.recipientName}</td>
                    <td className="px-6 py-3 text-gray-600">{mail.deliveryAddress}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${mail.status === 'delivered' ? 'bg-green-100 text-green-800' : mail.status === 'not_delivered' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>
                        {mail.status === 'delivered' ? 'Доставлено' : mail.status === 'not_delivered' ? 'Не доставлено' : 'Ошибка'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleDateString('ru-RU') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
