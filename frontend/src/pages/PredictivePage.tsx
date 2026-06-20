import { useState, useEffect } from 'react'
import { getProducts, getPrediction } from '../api'
import type { Product, PredictionResult, PredictionDay } from '../types'

const LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-300 text-red-800',
  warning:  'bg-amber-50 border-amber-300 text-amber-800',
  info:     'bg-blue-50 border-blue-300 text-blue-800',
}
const LEVEL_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-amber-400',
  info:     'bg-blue-400',
}

export function PredictivePage() {
  const [products, setProducts]         = useState<Product[]>([])
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [horizon, setHorizon]           = useState(21)
  const [result, setResult]             = useState<PredictionResult | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    getProducts().then(p => {
      setProducts(p)
      if (p.length > 0) setSelectedId(p[0].id)
    })
  }, [])

  const run = async (forceRetrain = false) => {
    if (!selectedId) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await getPrediction(selectedId, horizon, forceRetrain)
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analise Preditiva</h2>
        <p className="text-sm text-gray-500 mt-1">
          Previsao de vendas e estoque usando XGBoost treinado no historico de cada produto
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.code ? ` (${p.code})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label className="block text-sm font-medium text-gray-700 mb-1">Horizonte (dias uteis)</label>
          <select
            value={horizon}
            onChange={e => setHorizon(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {[7, 14, 21, 30, 45].map(h => (
              <option key={h} value={h}>{h} dias</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => run(false)}
          disabled={loading || !selectedId}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Calculando...' : 'Calcular Previsao'}
        </button>
        <button
          onClick={() => run(true)}
          disabled={loading || !selectedId}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="Descarta cache e re-treina o modelo"
        >
          Re-treinar modelo
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {result && result.status === 'insufficient_data' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="font-semibold text-amber-800">Dados insuficientes</p>
          <p className="text-sm text-amber-700 mt-1">{result.message}</p>
          <p className="text-sm text-amber-600 mt-2">
            Registre vendas diarias na pagina de rastreamento para habilitar a previsao.
          </p>
        </div>
      )}

      {result && result.status === 'ok' && (
        <>
          {/* Alerts */}
          {result.alerts.length > 0 && (
            <div className="space-y-2">
              {result.alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 ${LEVEL_STYLE[a.level]}`}>
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[a.level]}`} />
                  <p className="text-sm font-medium">{a.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Total previsto"
              value={`${result.total_predicted_sales.toLocaleString('pt-BR')} und.`}
              sub={`${result.horizon_days} dias uteis`}
            />
            <SummaryCard
              label="Media diaria prevista"
              value={`${result.avg_daily_predicted} und./dia`}
            />
            <SummaryCard
              label="Estoque atual"
              value={`${result.current_stock.toLocaleString('pt-BR')} und.`}
            />
            <SummaryCard
              label="MAPE do modelo"
              value={result.model_info.mape_pct !== null ? `${result.model_info.mape_pct}%` : 'N/A'}
              sub={`${result.model_info.training_samples} amostras de treino`}
              highlight={result.model_info.mape_pct !== null && result.model_info.mape_pct < 15}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Stock chart (bar) */}
            <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Projecao de Estoque e Vendas</h3>
              <StockChart predictions={result.predictions} />
            </div>

            {/* Feature importance */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Variaveis mais importantes</h3>
              <div className="space-y-2">
                {result.feature_importance.map(f => (
                  <div key={f.feature}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="font-mono">{f.feature}</span>
                      <span>{f.importance}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${f.importance}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                <p><span className="font-medium">Algoritmo:</span> {result.model_info.algorithm}</p>
                <p><span className="font-medium">Estimadores:</span> {result.model_info.n_estimators}</p>
                <p><span className="font-medium">Cache:</span> {result.model_info.from_cache ? 'Sim' : 'Nao (re-treinado)'}</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">Detalhe diario</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Data', 'Venda Prevista', 'Producao Planejada', 'Estoque Projetado', 'Status'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.predictions.map((day, i) => {
                    const isRuptura = day.stock_after <= 0
                    const isLow = day.stock_after > 0 && day.stock_after < result.avg_daily_predicted * 3
                    return (
                      <tr key={i} className={isRuptura ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}>
                        <td className="px-4 py-2 font-mono text-xs">{day.date}</td>
                        <td className="px-4 py-2">{day.predicted_sales.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-2">
                          {day.planned_production > 0
                            ? <span className="text-green-700 font-medium">+{day.planned_production}</span>
                            : <span className="text-gray-300">-</span>
                          }
                        </td>
                        <td className="px-4 py-2 font-medium">
                          <span className={isRuptura ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}>
                            {day.stock_after.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {isRuptura
                            ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Ruptura</span>
                            : isLow
                            ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Critico</span>
                            : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">OK</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function StockChart({ predictions }: { predictions: PredictionDay[] }) {
  const maxStock = Math.max(...predictions.map(p => p.stock_after), 1)
  const maxSales = Math.max(...predictions.map(p => p.predicted_sales), 1)
  const scale    = Math.max(maxStock, maxSales)

  const visible = predictions.slice(0, 30)
  const barW = Math.max(4, Math.floor(600 / visible.length) - 2)

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-0.5 h-48 min-w-[400px]" style={{ minWidth: `${visible.length * (barW + 2)}px` }}>
        {visible.map((day, i) => {
          const stockH = Math.round((day.stock_after / scale) * 180)
          const salesH = Math.round((day.predicted_sales / scale) * 180)
          const prodH  = day.planned_production > 0
            ? Math.round((day.planned_production / scale) * 180)
            : 0
          const isRuptura = day.stock_after <= 0

          return (
            <div
              key={i}
              className="flex items-end gap-px shrink-0 group relative"
              style={{ width: barW * 3 + 4 }}
              title={`${day.date}\nVenda prevista: ${day.predicted_sales.toFixed(0)}\nProducao: ${day.planned_production}\nEstoque: ${day.stock_after.toFixed(0)}`}
            >
              {/* Sales bar */}
              <div
                className="bg-blue-300 rounded-t"
                style={{ width: barW, height: Math.max(2, salesH) }}
              />
              {/* Production bar */}
              <div
                className="bg-green-400 rounded-t"
                style={{ width: barW, height: Math.max(prodH, 0) }}
              />
              {/* Stock bar */}
              <div
                className={`rounded-t ${isRuptura ? 'bg-red-400' : 'bg-slate-300'}`}
                style={{ width: barW, height: Math.max(2, stockH) }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-300 inline-block" /> Venda prevista</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> Producao planejada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300 inline-block" /> Estoque projetado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Ruptura</span>
      </div>
    </div>
  )
}
