import { useState, useEffect } from 'react'
import { getRules, createRule, updateRule, deleteRule } from '../api'
import type { Rule, RuleInput } from '../types'

const TYPES = [
  { value: 'sequencing', label: 'Sequenciamento', color: 'bg-purple-100 text-purple-800' },
  { value: 'priority', label: 'Prioridade', color: 'bg-blue-100 text-blue-800' },
  { value: 'constraint', label: 'Restricao', color: 'bg-red-100 text-red-800' },
  { value: 'optimization', label: 'Otimizacao', color: 'bg-green-100 text-green-800' },
  { value: 'custom', label: 'Personalizada', color: 'bg-gray-100 text-gray-700' },
]

const blank: RuleInput = { rule_type: 'custom', name: '', description: '', active: 1, priority: 5 }

export function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState<RuleInput>(blank)
  const [saving, setSaving] = useState(false)

  const load = async () => { setLoading(true); setRules(await getRules()); setLoading(false) }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setShowForm(true) }
  const openEdit = (r: Rule) => {
    setEditing(r)
    setForm({ rule_type: r.rule_type, name: r.name, description: r.description, active: r.active, priority: r.priority })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name || !form.description) return
    setSaving(true)
    try {
      editing ? await updateRule(editing.id, form) : await createRule(form)
      setShowForm(false)
      await load()
    } finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (confirm('Remover esta regra?')) { await deleteRule(id); await load() }
  }

  const toggle = async (r: Rule) => {
    await updateRule(r.id, { rule_type: r.rule_type, name: r.name, description: r.description, active: r.active ? 0 : 1, priority: r.priority })
    await load()
  }

  const typeInfo = (t: string) => TYPES.find(x => x.value === t) ?? TYPES[4]

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Regras do Agente</h2>
          <p className="text-sm text-gray-500 mt-1">Regras que o agente de IA segue ao gerar a programacao</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Nova Regra
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Tipos de Regras</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {TYPES.map(t => (
            <span key={t.value} className={`text-xs px-2 py-1 rounded-full font-medium ${t.color}`}>{t.label}</span>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Regras ativas sao enviadas ao agente em cada geracao. Use linguagem natural e clara - o agente interpreta o texto diretamente.
        </p>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border-2 border-blue-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Editar Regra' : 'Nova Regra'}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade (1-10)</label>
                <input type="number" value={form.priority} min={1} max={10}
                  onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Regra *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Ex: Produto X antes do Y na Maquina A" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao Completa *</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                placeholder="Descreva a regra em detalhes. O agente recebera exatamente este texto para guiar suas decisoes..." />
              <p className="text-xs text-gray-400 mt-1">Use linguagem natural. O agente interpreta o texto diretamente.</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={save} disabled={saving || !form.name || !form.description}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar Regra'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rules.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">*</p>
            <p className="font-medium">Nenhuma regra cadastrada</p>
            <p className="text-sm mt-1">Adicione regras para guiar o agente de programacao</p>
          </div>
        )}
        {rules.map(rule => {
          const t = typeInfo(rule.rule_type)
          return (
            <div key={rule.id} className={`bg-white rounded-xl border p-5 transition-opacity ${rule.active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                    <span className="text-xs text-gray-400">Prioridade: {rule.priority}/10</span>
                    {!rule.active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inativa</span>}
                  </div>
                  <p className="font-semibold text-gray-900">{rule.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle(rule)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      rule.active ? 'bg-green-100 text-green-700 hover:bg-gray-100' : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                    }`}>
                    {rule.active ? 'Ativa' : 'Ativar'}
                  </button>
                  <button onClick={() => openEdit(rule)} className="text-sm text-blue-600 hover:text-blue-800">Editar</button>
                  <button onClick={() => remove(rule.id)} className="text-sm text-red-500 hover:text-red-700">Remover</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
