import { useState, useEffect } from 'react'
import { getMachines, createMachine, updateMachine, getProducts, assignProduct, removeProduct } from '../api'
import type { Machine, MachineInput, Product } from '../types'

const blank: MachineInput = { name: '', code: '', capacity_per_day: 100, working_days: 'MTWTF', notes: '' }
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'

export function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [form, setForm] = useState<MachineInput>(blank)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [m, p] = await Promise.all([getMachines(), getProducts()])
    setMachines(m); setProducts(p); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setShowForm(true) }
  const openEdit = (m: Machine) => {
    setEditing(m)
    setForm({ name: m.name, code: m.code ?? '', capacity_per_day: m.capacity_per_day, working_days: m.working_days, notes: m.notes ?? '' })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      editing ? await updateMachine(editing.id, form) : await createMachine(form)
      setShowForm(false); await load()
    } finally { setSaving(false) }
  }

  const toggleProduct = async (machineId: number, productId: number, assigned: boolean) => {
    assigned ? await removeProduct(machineId, productId) : await assignProduct(machineId, productId)
    await load()
  }

  const set = (k: keyof MachineInput, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Maquinas</h2>
          <p className="text-sm text-gray-500 mt-1">Gerencie as maquinas e atribua produtos elegiveis</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Nova Maquina</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border-2 border-blue-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Editar Maquina' : 'Nova Maquina'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="Maquina A" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Codigo</label>
              <input value={form.code} onChange={e => set('code', e.target.value)} className={INPUT} placeholder="MA01" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Capacidade (und./dia)</label>
              <input type="number" value={form.capacity_per_day} min={1} onChange={e => set('capacity_per_day', Number(e.target.value))} className={INPUT} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Dias de trabalho</label>
              <input value={form.working_days} onChange={e => set('working_days', e.target.value)} className={INPUT} placeholder="MTWTF" /></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={INPUT + ' resize-none'} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={save} disabled={saving || !form.name}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {machines.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  {m.code && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.code}</span>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{m.capacity_per_day} und./dia &middot; {m.working_days}</p>
              </div>
              <button onClick={() => openEdit(m)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Editar</button>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Produtos elegiveis (clique para atribuir/remover):</p>
              <div className="flex flex-wrap gap-2">
                {products.map(p => {
                  const assigned = m.products.some(x => x.id === p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProduct(m.id, p.id, assigned)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                        assigned ? 'bg-blue-600 text-white hover:bg-red-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={assigned ? 'Clique para remover' : 'Clique para atribuir'}
                    >
                      {p.name} {assigned ? 'v' : '+'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
