import { BarChart3, Clock3, Download, FileSpreadsheet, PackageCheck, TrendingUp } from 'lucide-react';

const metrics = [
  {
    label: 'Заявок за неделю',
    value: '128',
    description: 'Всего создано заявок',
    icon: FileSpreadsheet,
  },
  {
    label: 'Выполнено вовремя',
    value: '94%',
    description: 'SLA по доставкам',
    icon: PackageCheck,
  },
  {
    label: 'Среднее время',
    value: '31 мин',
    description: 'От создания до завершения',
    icon: Clock3,
  },
  {
    label: 'Рост нагрузки',
    value: '+12%',
    description: 'К прошлой неделе',
    icon: TrendingUp,
  },
];

const reportRows = [
  { name: 'Ежедневный отчёт по заявкам', type: 'Excel', period: 'Сегодня', status: 'Готов' },
  { name: 'Курьерская загрузка', type: 'Excel', period: 'Неделя', status: 'Готов' },
  { name: 'Клиентская активность', type: 'Excel', period: 'Месяц', status: 'В разработке' },
];

export default function ReportsView() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Отчёты</h1>
          <p className="mt-1 text-sm text-slate-500">
            Операционная аналитика, выгрузки и контроль показателей доставки.
          </p>
        </div>

        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:opacity-95">
          <Download className="h-4 w-4" />
          Скачать отчёт
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {metric.value}
                  </p>
                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-500">{metric.description}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Доступные отчёты</h2>
              <p className="mt-1 text-xs text-slate-500">Выгрузки для контроля заявок, клиентов и курьеров.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Отчёт</th>
                  <th className="px-5 py-3 font-semibold">Тип</th>
                  <th className="px-5 py-3 font-semibold">Период</th>
                  <th className="px-5 py-3 font-semibold">Статус</th>
                  <th className="px-5 py-3 text-right font-semibold">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportRows.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4 font-medium text-slate-950">{row.name}</td>
                    <td className="px-5 py-4 text-slate-600">{row.type}</td>
                    <td className="px-5 py-4 text-slate-600">{row.period}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          row.status === 'Готов'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950">
                        Скачать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <BarChart3 className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-950">Сводка по операциям</h2>
              <p className="mt-1 text-xs text-slate-500">Ключевые сигналы за текущий период.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {[
              ['Новые заявки', '7', 'Нужно обработать сегодня'],
              ['Проблемные доставки', '2', 'Требуют внимания менеджера'],
              ['Свободные курьеры', '5', 'Можно назначить на новые заявки'],
            ].map(([label, value, description]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-950">{label}</p>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {value}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
