import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Filter, Upload } from 'lucide-react';
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
  courier?: {
    name?: string;
    fullName?: string;
  };
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

type TabId = 'upload' | 'reports';
type MailStatus = 'all' | 'not_delivered' | 'delivered' | 'failed';

const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

const compactInputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200';

const primaryButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

const statusLabels: Record<Exclude<MailStatus, 'all'>, string> = {
  delivered: 'Доставлено',
  not_delivered: 'Не доставлено',
  failed: 'Проблема',
};

const statusClass: Record<Exclude<MailStatus, 'all'>, string> = {
  delivered: 'border-slate-300 bg-slate-100 text-slate-900',
  not_delivered: 'border-slate-200 bg-white text-slate-600',
  failed: 'border-slate-300 bg-slate-200 text-slate-900',
};

const getCourierName = (mail: Mail) => {
  return mail.courierName || mail.courier?.name || mail.courier?.fullName || 'Не назначен';
};

export default function MailsView() {
  const [activeTab, setActiveTab] = useState<TabId>('upload');
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({
    waybill: { column: 'A', startRow: 2, endRow: 100 },
    recipient: { column: 'B', startRow: 2, endRow: 100 },
    address: { column: 'C', startRow: 2, endRow: 100 },
  });
  const [filterStatus, setFilterStatus] = useState<MailStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadMails();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setSelectedFile(file);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      setFileData(data);

      const maxCols = Math.max(...data.map((row: any) => row.length || 0));
      const cols = [];
      for (let i = 0; i < maxCols; i++) {
        cols.push(String.fromCharCode(65 + i));
      }
      setColumns(cols);

      setShowMappingForm(true);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Ошибка при чтении файла');
    }
  };

  const columnToIndex = (col: string): number => {
    return col.charCodeAt(0) - 65;
  };

  const getCellValue = (rowIndex: number, colLetter: string): string => {
    const colIndex = columnToIndex(colLetter);
    const row = fileData[rowIndex];
    if (!row || colIndex >= row.length) return '';
    return String(row[colIndex] || '');
  };

  const handleUploadManifest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || fileData.length === 0) {
      alert('Выберите файл');
      return;
    }

    try {
      setLoading(true);

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

      for (const mail of mailsToCreate) {
        try {
          await api.createMail(mail);
        } catch (error) {
          console.error('Error creating mail:', error);
        }
      }

      alert(`Манифест загружен успешно. Добавлено ${mailsToCreate.length} писем`);
      setSelectedFile(null);
      setShowMappingForm(false);
      setFileData([]);
      loadMails();
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
      const data = await api.getAllMails({
        status: filterStatus,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      });
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
      const rows = filteredMails.map(mail => [
        mail.waybillNumber,
        mail.recipientName,
        mail.deliveryAddress,
        mail.recipientPhone || '',
        mail.status,
        getCourierName(mail),
        mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleDateString('ru-RU') : '',
      ]);

      const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
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

      return [
        mail.waybillNumber,
        mail.recipientName,
        mail.recipientPhone || '',
        mail.deliveryAddress,
        getCourierName(mail),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [mails, filterStatus, searchQuery]);

  const stats = {
    total: mails.length,
    delivered: mails.filter(m => m.status === 'delivered').length,
    notDelivered: mails.filter(m => m.status === 'not_delivered').length,
    failed: mails.filter(m => m.status === 'failed').length,
  };

  const tabs: Array<{ id: TabId; label: string; icon: typeof Upload }> = [
    { id: 'upload', label: 'Манифест', icon: Upload },
    { id: 'reports', label: 'Отчёты доставки', icon: FileText },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Почтовые отправления</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">Рабочее место по манифестам</h1>
          <p className="mt-1 text-sm text-slate-500">Загрузка, проверка и отчёты по доставке писем в одном списке.</p>
        </div>

        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Всего</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Доставлено</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stats.delivered}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">В работе</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stats.notDelivered}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Проблемы</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stats.failed}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Статус</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as MailStatus)}
                className={inputClass}
              >
                <option value="all">Все статусы</option>
                <option value="delivered">Доставлено</option>
                <option value="not_delivered">Не доставлено</option>
                <option value="failed">Проблема</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">С даты</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">По дату</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Поиск</label>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Накладная, адрес, получатель"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadMails}
              disabled={loading}
              className={secondaryButtonClass}
            >
              <Filter size={16} />
              {loading ? 'Обновление...' : 'Применить'}
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              className={secondaryButtonClass}
            >
              <Download size={16} />
              Экспорт
            </button>
          </div>
        </div>

        {activeTab === 'upload' && (
          <div className="grid gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
              />

              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
                  <Upload size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-slate-950">Загрузить манифест</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Excel или CSV. После выбора файла откроется настройка столбцов.</p>
                  {selectedFile && (
                    <p className="mt-3 truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                      Файл выбран: {selectedFile.name}
                    </p>
                  )}
                </div>
              </div>

              <label
                htmlFor="file-input"
                className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Upload size={16} />
                Выбрать файл
              </label>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">
                <p className="font-semibold text-slate-700">Порядок работы</p>
                <p className="mt-1">Выберите файл, укажите столбцы для накладной, получателя и адреса, затем загрузите строки в систему.</p>
              </div>
            </div>

            <MailsTable mails={filteredMails.slice(0, 20)} loading={loading} compactTitle="Последние письма" />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="p-4">
            <MailsTable mails={filteredMails} loading={loading} compactTitle="Отчёты о доставке" showReportColumns />
          </div>
        )}
      </div>

      {showMappingForm && fileData.length > 0 && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">Настройка столбцов манифеста</h3>
              <p className="mt-1 text-sm text-slate-500">Укажите, где находятся данные для создания писем.</p>
            </div>

            <form onSubmit={handleUploadManifest} className="space-y-5 p-5">
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">Строка</th>
                      {columns.map(col => (
                        <th key={col} className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fileData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-white">
                        <td className="border-b border-r border-slate-200 px-2 py-1 font-semibold text-slate-500">
                          {idx + 1}
                        </td>
                        {columns.map(col => (
                          <td key={col} className="border-b border-r border-slate-200 px-2 py-1 text-slate-600">
                            {String(row[columnToIndex(col)] || '').substring(0, 24)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MappingField
                  label="Номер накладной"
                  required
                  columns={columns}
                  value={mapping.waybill}
                  onChange={(value) => setMapping({ ...mapping, waybill: value })}
                />
                <MappingField
                  label="Получатель"
                  required
                  columns={columns}
                  value={mapping.recipient}
                  onChange={(value) => setMapping({ ...mapping, recipient: value })}
                />
                <MappingField
                  label="Адрес доставки"
                  required
                  columns={columns}
                  value={mapping.address}
                  onChange={(value) => setMapping({ ...mapping, address: value })}
                />
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <label className="block text-sm font-semibold text-slate-900">Телефон</label>
                  <select
                    value={mapping.phone?.column || ''}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        phone: e.target.value
                          ? {
                              column: e.target.value,
                              startRow: mapping.phone?.startRow || 2,
                              endRow: mapping.phone?.endRow || 100,
                            }
                          : undefined,
                      })
                    }
                    className={`${compactInputClass} mt-2`}
                  >
                    <option value="">Не использовать</option>
                    {columns.map(col => (
                      <option key={col} value={col}>
                        Столбец {col}
                      </option>
                    ))}
                  </select>
                  {mapping.phone && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <RangeInput
                        label="От строки"
                        value={mapping.phone.startRow}
                        onChange={(value) => setMapping({ ...mapping, phone: { ...mapping.phone!, startRow: value } })}
                      />
                      <RangeInput
                        label="До строки"
                        value={mapping.phone.endRow}
                        onChange={(value) => setMapping({ ...mapping, phone: { ...mapping.phone!, endRow: value } })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowMappingForm(false);
                    setSelectedFile(null);
                    setFileData([]);
                  }}
                  className={secondaryButtonClass}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={primaryButtonClass}
                >
                  {loading ? 'Загрузка...' : 'Загрузить манифест'}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function MappingField({
  label,
  required,
  columns,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  columns: string[];
  value: CellRange;
  onChange: (value: CellRange) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <label className="block text-sm font-semibold text-slate-900">
        {label} {required && <span className="text-slate-400">*</span>}
      </label>
      <select
        value={value.column}
        onChange={(e) => onChange({ ...value, column: e.target.value })}
        className={`${compactInputClass} mt-2`}
      >
        {columns.map(col => (
          <option key={col} value={col}>
            Столбец {col}
          </option>
        ))}
      </select>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <RangeInput
          label="От строки"
          value={value.startRow}
          onChange={(nextValue) => onChange({ ...value, startRow: nextValue })}
        />
        <RangeInput
          label="До строки"
          value={value.endRow}
          onChange={(nextValue) => onChange({ ...value, endRow: nextValue })}
        />
      </div>
    </div>
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 1)}
        className={`${compactInputClass} mt-1`}
      />
    </label>
  );
}

function MailsTable({
  mails,
  loading,
  compactTitle,
  showReportColumns = false,
}: {
  mails: Mail[];
  loading: boolean;
  compactTitle: string;
  showReportColumns?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{compactTitle}</h2>
          <p className="text-xs text-slate-500">Показано: {mails.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">Загрузка...</div>
      ) : mails.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Нет писем для отображения</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Накладная</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Получатель</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Адрес</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Статус</th>
                {showReportColumns && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Курьер</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Доставка</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Создано</th>
              </tr>
            </thead>
            <tbody>
              {mails.map((mail) => (
                <tr key={mail.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">{mail.waybillNumber}</td>
                  <td className="px-4 py-3 text-slate-900">
                    <div className="font-medium">{mail.recipientName}</div>
                    <div className="text-xs text-slate-500">{mail.recipientPhone || 'Телефон не указан'}</div>
                  </td>
                  <td className="max-w-[320px] px-4 py-3 text-slate-600">
                    <span className="line-clamp-2">{mail.deliveryAddress}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[mail.status]}`}>
                      {statusLabels[mail.status]}
                    </span>
                  </td>
                  {showReportColumns && (
                    <>
                      <td className="px-4 py-3 text-slate-600">{getCourierName(mail)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {mail.deliveredAt
                          ? new Date(mail.deliveredAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {new Date(mail.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
