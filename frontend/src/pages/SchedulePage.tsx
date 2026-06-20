import { useState, useEffect, useCallback } from 'react'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'
import { getSchedule, generateSchedule, updateScheduleEntry, deleteScheduleEntry, createScheduleEntry, getProducts, getMachines } from '../api'
import type { ScheduleData, ScheduleEntry, Machine, Product } from '../types'

function weekDays(weekStart: string): string[] {
  const s = parseISO(weekStart)
  return Array.from({ length: 5 }, (_, i) => format(addDays(s, i), 'yyyy-MM-dd'))
}

function toWeekStart(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-blue-100 border-blue-300 text-blue-900',
  in_progress: 'bg-amber-100 border-amber-300 text-amber-900',
  done: 'bg-green-100 border-green-300 text-green-900',
  cancelled: 'bg-gray-100 border-gray-200 text-gray-400 line-through',
}

export function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => toWeekStart(new Date()))
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [editCtx, setEditCtx] = useState<{ entry: ScheduleEntry | null; date: string; mid: number; mname: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sched, prods, machs] = await Promise.all([getSchedule(weekStart), getProducts(), getMachines()])
      setSchedule(sched)
      setProducts(prods)
      setMachines(machs)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const handleGenerate = async (regen = false) => {
    setGenerating(true)
    setAlerts([])
    setSummary('')
    try {
      const r = await generateSchedule(weekStart, regen)
      setAlerts(r.alerts || [])
      setSummary(r.summary || '')
      await load()
    } catch (e: unknown) {
      alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const days = weekDays(weekStart)

  // Build lookup: machine_id -> date -> entries[]
  const map: Record<number, Record<string, ScheduleEntry[]>> = {}
  if (schedule) {
    for (const m of schedule.machines) {
      map[m.machine_id] = {}
      for (const e of m.schedule) {
        const day = e.scheduled_date
        if (!map[m.machine_id][day]) map[m.machine_id][day] = []
        map[m.machine_id][day].push(e)
      }
    }
  }

  const shift = (n: number) => {
    const d = parseISO(weekStart)
    setWeekStart(format(addDays(d, n * 7), 'yyyy-MM-dd'))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Programacao Semanal</h2>
          <p className="text-sm text-gray-500">
            Semana de {format(parseISO(weekStart), 'dd/MM/yyyy')} a {format(addDays(parseISO(weekStart), 4), 'dd/MM/yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">&#8592; Anterior</button>
          <button onClick={() => shift(1)} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Proxima &#8594;</button>
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Gerando...' : 'Gerar com IA'}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            Regenerar
          </button>
        </div>
      </div>

      {summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 mb-1">Resumo do Agente</p>
          <p className="text-sm text-blue-800">{summary}</p>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">Alertas</p>
          <ul className="space-y-1">
            {alerts.map((a, i) => <li key={i} className="text-sm text-amber-800">&bull; {a}</li>)}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando programacao...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 border-b border-r border-gray-200 min-w-[160px]">Maquina</th>
                {days.map((d, i) => (
                  <th key={d} className="px-3 py-3 text-center text-sm font-semibold text-gray-600 border-b border-r border-gray-200 min-w-[140px]">
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-xs text-gray-400 font-normal">{format(parseISO(d), 'dd/MM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {machines.map(machine => (
                <tr key={machine.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 border-r border-gray-200 align-top">
                    <p className="font-medium text-gray-900 text-sm">{machine.name}</p>
                    {machine.code && <p className="text-xs text-gray-500">{machine.code}</p>}
                    <p className="text-xs text-gray-400">{machine.capacity_per_day} und./dia</p>
                  </td>
                  {days.map(d => {
                    const entries = map[machine.id]?.[d] || []
                    const total = entries.reduce((s, e) => s + e.planned_quantity, 0)
                    const pct = machine.capacity_per_day > 0 ? Math.round(total / machine.capacity_per_day * 100) : 0
                    return (
                      <td key={d} className="px-2 py-2 border-r border-gray-100 align-top">
                        <div className="space-y-1">
                          {entries.map(entry => (
                            <div
                              key={entry.id}
                              onClick={() => setEditCtx({ entry, date: d, mid: machine.id, mname: machine.name })}
                              className={`rounded-lg border px-2 py-1.5 text-xs cursor-pointer hover:opacity-75 group relative ${STATUS_COLORS[entry.status] || STATUS_COLORS.planned}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="font-semibold truncate">{entry.product_name}</p>
                                  <p className="opacity-75">{entry.planned_quantity} und.</p>
                                  {entry.actual_quantity > 0 && <p className="opacity-60">Real: {entry.actual_quantity}</p>}
                                </div>
                                <button
                                  onClick={async ev => { ev.stopPropagation(); if (confirm('Remover?')) { await deleteScheduleEntry(entry.id); load() } }}
                                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                                >x</button>
                              </div>
                              {entry.agent_reasoning && (
                                <p className="mt-0.5 opacity-50 truncate" title={entry.agent_reasoning}>{entry.agent_reasoning}</p>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => setEditCtx({ entry: null, date: d, mid: machine.id, mname: machine.name })}
                            className="w-full text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded p-1 border border-dashed border-gray-200 hover:border-blue-300 transition-colors"
                          >+ Adicionar</button>
                          {total > 0 && (
                            <p className={`text-xs text-center ${pct > 100 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                              {total}/{machine.capacity_per_day} ({pct}%)
                            </p>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editCtx && (
        <EditModal
          entry={editCtx.entry}
          date={editCtx.date}
          machineId={editCtx.mid}
          machineName={editCtx.mname}
          weekStart={weekStart}
          products={products}
          onClose={() => setEditCtx(null)}
          onSave={async () => { setEditCtx(null); await load() }}
        />
      )}
    </div>
  )
}

function EditModal({
  entry, date, machineId, machineName, weekStart, products, onClose, onSave,
}: {
  entry: ScheduleEntry | null
  date: string
  machineId: number
  machineName: string
  weekStart: string
  products: Product[]
  onClose: () => void
  onSave: () => void
}) {
  const [productId, setProductId] = useState(entry?.product_id ?? products[0]?.id ?? 0)
  const [qty, setQty] = useState(entry?.planned_quantity ?? 0)
  const [actualQty, setActualQty] = useState(entry?.actual_quantity ?? 0)
  const [status, setStatus] = useState(entry?.status ?? 'planned')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!productId || qty <= 0) return
    setSaving(true)
    try {
      if (entry) {
        await updateScheduleEntry(entry.id, { product_id: productId, planned_quantity: qty, actual_quantity: actualQty, status, notes: notes || undefined })
      } else {
        await createScheduleEntry({ week_start: weekStart, scheduled_date: date, machine_id: machineId, product_id: productId, planned_quantity: qty, actual_quantity: actualQty, status, notes: notes || undefined })
      }
      onSave()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{entry ? 'Editar' : 'Adicionar'} Programacao</h3>
            <p className="text-sm text-gray-500">{machineName} &middot; {format(parseISO(date), 'dd/MM/yyyy')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">x</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
            <select
              value={productId}
              onChange={e => setProductId(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Planejada</label>
              <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Real</label>
              <input type="number" value={actualQty} onChange={e => setActualQty(Number(e.target.value))} min={0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="planned">Planejado</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Opcional..." />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !productId || qty <= 0}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
