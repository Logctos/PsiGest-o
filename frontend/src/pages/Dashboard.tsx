import { useState, useEffect } from 'react'
import { getPerformance } from '../api'
import type { PerformanceReport, ProductPerformance } from '../types'

export function Dashboard() {
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPerformance(month)
      .then(setReport)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>
  if (error) return <div className="p-8 text-red-600">Erro: {error}</div>
  if (!report) return null

  const criticals = report.products.filter(p => p.is_critical || p.next_month_consumed > 0)
  const monthPct = report.total_working_days > 0
    ? Math.round(report.elapsed_working_days / report.total_working_days * 100)
    : 0

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard de Performance</h2>
          <p className="text-sm text-gray-500 mt-1">
            {report.elapsed_working_days}/{report.total_working_days} dias uteis &middot; {report.remaining_working_days} restantes
          </p>
        </div>
        <input
          type="month" value={month}
          onChange={e => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {criticals.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800 mb-2">Alertas Criticos</p>
          <ul className="space-y-1">
            {criticals.map(p => (
              <li key={p.product_id} className="text-sm text-red-700">
                {p.next_month_consumed > 0
                  ? `${p.product_name}: consumindo ${p.next_month_consumed} und. do estoque do proximo mes`
                  : `${p.product_name}: estoque critico - cobre apenas ${p.stock_coverage_days} dias`
                }
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
          <span>Progresso do Mes</span>
          <span>{monthPct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${monthPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {report.products.map(p => <ProductCard key={p.product_id} p={p} />)}
      </div>
    </div>
  )
}

function ProductCard({ p }: { p: ProductPerformance }) {
  const salesPct = p.monthly_target > 0 ? p.total_sold / p.monthly_target : 0
  const expPct = p.monthly_target > 0 ? p.expected_sold_by_today / p.monthly_target : 0

  const borderColor = p.next_month_consumed > 0
    ? 'border-red-400 bg-red-50'
    : p.is_critical
    ? 'border-amber-400 bg-amber-50'
    : 'border-gray-200 bg-white'

  const badge = p.next_month_consumed > 0
    ? { label: 'Consumindo proximo mes', cls: 'bg-red-600 text-white' }
    : p.is_critical
    ? { label: 'Estoque Critico', cls: 'bg-amber-500 text-white' }
    : p.sales_delta > 0
    ? { label: 'Acima da meta', cls: 'bg-blue-600 text-white' }
    : { label: 'No prazo', cls: 'bg-green-600 text-white' }

  const barColor = salesPct > 1 ? 'bg-red-500' : salesPct > expPct ? 'bg-blue-500' : 'bg-amber-500'

  return (
    <div className={`rounded-xl border-2 p-5 space-y-4 ${borderColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{p.product_name}</p>
          {p.product_code && <p className="text-xs text-gray-500">{p.product_code}</p>}
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-600">
          <span>Vendas: {p.total_sold} / {p.monthly_target}</span>
          <span>{Math.round(salesPct * 100)}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-600 z-10"
            style={{ left: `${Math.min(expPct * 100, 100)}%` }}
            title={`Meta esperada hoje: ${p.expected_sold_by_today}`}
          />
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${Math.min(salesPct * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Meta esperada: {p.expected_sold_by_today}</span>
          <span className={p.sales_delta >= 0 ? 'text-blue-600 font-medium' : 'text-amber-600 font-medium'}>
            {p.sales_delta >= 0 ? `+${p.sales_delta}` : p.sales_delta} vs meta
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Estoque atual" value={`${p.current_stock} und.`} sub={`Cobre ${p.stock_coverage_days} dias`} warn={p.is_critical} />
        <Stat label="Producao necessaria" value={`${p.production_needed} und.`} sub="Restante do mes" warn={p.production_needed > 0} />
        <Stat label="Media diaria" value={`${p.avg_daily_sales} und./dia`} sub={`${p.elapsed_working_days} dias`} />
        {p.next_month_consumed > 0 && (
          <Stat label="Consumido proximo mes" value={`${p.next_month_consumed} und.`} warn />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="bg-white/80 rounded-lg p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-semibold ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
