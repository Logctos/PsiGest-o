import { useState, useEffect } from 'react'
import { getProducts, createProduct, updateProduct, deleteProduct } from '../api'
import type { Product, ProductInput } from '../types'

const blank: ProductInput = { name: '', code: '', monthly_target: 0, current_stock: 0, min_batch: 1, priority: 5, notes: '' }

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductInput>(blank)
  const [saving, setSaving] = useState(false)

  const load = async () => { setLoading(true); setProducts(await getProducts()); setLoading(false) }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setShowForm(true) }
  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({ name: p.name, code: p.code ?? '', monthly_target: p.monthly_target, current_stock: p.current_stock, min_batch: p.min_batch, priority: p.priority, notes: p.notes ?? '' })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      editing ? await updateProduct(editing.id, form) : await createProduct(form)
      setShowForm(false); await load()
    } finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (confirm('Remover produto?')) { await deleteProduct(id); await load() }
  }

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>

  const F = form
  const set = (k: keyof ProductInput, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Produtos</h2>
          <p className="text-sm text-gray-500 mt-1">Gerencie os produtos e suas metas mensais</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Novo Produto</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border-2 border-blue-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Editar Produto' : 'Novo Produto'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome *">
              <input value={F.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="Produto X" />
            </Field>
            <Field label="Codigo">
              <input value={F.code} onChange={e => set('code', e.target.value)} className={INPUT} placeholder="PRX" />
            </Field>
            <Field label="Meta Mensal (und.)">
              <input type="number" value={F.monthly_target} min={0} onChange={e => set('monthly_target', Number(e.target.value))} className={INPUT} />
            </Field>
            <Field label="Estoque Atual (und.)">
              <input type="number" value={F.current_stock} min={0} onChange={e => set('current_stock', Number(e.target.value))} className={INPUT} />
            </Field>
            <Field label="Lote Minimo">
              <input type="number" value={F.min_batch} min={1} onChange={e => set('min_batch', Number(e.target.value))} className={INPUT} />
            </Field>
            <Field label="Prioridade (1-10)">
              <input type="number" value={F.priority} min={1} max={10} onChange={e => set('priority', Number(e.target.value))} className={INPUT} />
            </Field>
            <div className="col-span-2">
              <Field label="Observacoes">
                <textarea value={F.notes} onChange={e => set('notes', e.target.value)} rows={2} className={INPUT + ' resize-none'} />
              </Field>
            </div>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Produto', 'Meta Mensal', 'Estoque Atual', 'Lote Min.', 'Prioridade', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  {p.code && <p className="text-xs text-gray-500">{p.code}</p>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.monthly_target.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={p.current_stock < p.monthly_target * 0.1 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {p.current_stock.toLocaleString('pt-BR')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.min_batch}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    p.priority >= 8 ? 'bg-red-100 text-red-800' : p.priority >= 5 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                  }`}>{p.priority}/10</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => openEdit(p)} className="text-sm text-blue-600 hover:text-blue-800">Editar</button>
                    <button onClick={() => remove(p.id)} className="text-sm text-red-500 hover:text-red-700">Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
