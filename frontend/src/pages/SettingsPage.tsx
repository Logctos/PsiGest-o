import { useState, useEffect } from 'react'
import { getSettings, updateSetting } from '../api'
import type { Setting } from '../types'

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    logo: 'A',
    color: 'bg-orange-100 text-orange-700 border-orange-300',
    activeColor: 'bg-orange-500 text-white border-orange-500',
    description: 'Modelos Claude da Anthropic. Recomendado para raciocinio complexo de producao.',
    keyLabel: 'Chave API Anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyKey: 'anthropic_api_key',
    modelKey: 'anthropic_model',
    modelSuggestions: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    logo: 'O',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    activeColor: 'bg-emerald-500 text-white border-emerald-500',
    description: 'Modelos GPT da OpenAI. Compatible com gpt-4o e versoes mais recentes.',
    keyLabel: 'Chave API OpenAI',
    keyPlaceholder: 'sk-...',
    keyKey: 'openai_api_key',
    modelKey: 'openai_model',
    modelSuggestions: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini'],
  },
]

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, Setting>>({})
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const load = async () => {
    setLoading(true)
    const rows = await getSettings()
    const map: Record<string, Setting> = {}
    rows.forEach(r => { map[r.key] = r })
    setSettings(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const currentProvider = settings['agent_provider']?.value ?? 'anthropic'

  const setProvider = async (p: string) => {
    await updateSetting('agent_provider', p)
    setSettings(s => ({ ...s, agent_provider: { ...s['agent_provider'], value: p } }))
  }

  const setDraft = (key: string, val: string) =>
    setDrafts(d => ({ ...d, [key]: val }))

  const save = async (key: string) => {
    const val = drafts[key]
    if (val === undefined || val === '') return
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await updateSetting(key, val)
      setDrafts(d => { const n = { ...d }; delete n[key]; return n })
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
      await load()
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Carregando...</div>

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configuracoes</h2>
        <p className="text-sm text-gray-500 mt-1">Configure o provedor de IA e as chaves de API do agente de programacao</p>
      </div>

      {/* Provider selector */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-gray-800">Provedor de IA</h3>
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                currentProvider === p.id ? p.activeColor : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                  currentProvider === p.id ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                }`}>{p.logo}</span>
                <span className="font-semibold text-sm">{p.name}</span>
                {currentProvider === p.id && (
                  <span className="ml-auto text-xs bg-white/30 px-2 py-0.5 rounded-full font-medium">Ativo</span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${
                currentProvider === p.id ? 'text-white/80' : 'text-gray-500'
              }`}>{p.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* API Keys */}
      {PROVIDERS.map(provider => (
        <section key={provider.id} className={`space-y-4 rounded-xl border-2 p-5 ${
          currentProvider === provider.id ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
              currentProvider === provider.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>{provider.logo}</span>
            <h3 className="text-base font-semibold text-gray-800">{provider.name}</h3>
            {currentProvider === provider.id && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Provedor ativo</span>
            )}
          </div>

          {/* API Key field */}
          <ApiKeyField
            label={provider.keyLabel}
            placeholder={provider.keyPlaceholder}
            settingKey={provider.keyKey}
            setting={settings[provider.keyKey]}
            draft={drafts[provider.keyKey] ?? ''}
            isSaving={!!saving[provider.keyKey]}
            isSaved={!!saved[provider.keyKey]}
            onChange={v => setDraft(provider.keyKey, v)}
            onSave={() => save(provider.keyKey)}
          />

          {/* Model field */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Modelo
            </label>
            <div className="flex gap-2">
              <input
                value={drafts[provider.modelKey] ?? settings[provider.modelKey]?.value ?? ''}
                onChange={e => setDraft(provider.modelKey, e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder={provider.modelSuggestions[0]}
              />
              <button
                onClick={() => save(provider.modelKey)}
                disabled={!!saving[provider.modelKey] || !drafts[provider.modelKey]}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {saving[provider.modelKey] ? '...' : saved[provider.modelKey] ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {provider.modelSuggestions.map(m => (
                <button
                  key={m}
                  onClick={() => { setDraft(provider.modelKey, m); }}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded font-mono transition-colors"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">Seguranca das chaves</p>
        <p className="text-xs text-amber-700">
          As chaves de API sao armazenadas localmente no banco de dados do servidor e nunca
          exibidas de volta na interface. Para producao, prefira configurar as variaveis de
          ambiente <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> e{' '}
          <code className="bg-amber-100 px-1 rounded">OPENAI_API_KEY</code> diretamente no servidor.
        </p>
      </div>
    </div>
  )
}

function ApiKeyField({
  label, placeholder, settingKey, setting, draft, isSaving, isSaved, onChange, onSave
}: {
  label: string
  placeholder: string
  settingKey: string
  setting?: Setting
  draft: string
  isSaving: boolean
  isSaved: boolean
  onChange: (v: string) => void
  onSave: () => void
}) {
  const [show, setShow] = useState(false)
  const isSet = setting?.value_set

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {isSet && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            Configurada
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <input
            type={show ? 'text' : 'password'}
            value={draft}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && draft && onSave()}
            className="flex-1 px-3 py-2 text-sm font-mono outline-none bg-transparent"
            placeholder={isSet ? '(chave ja configurada — deixe em branco para manter)' : placeholder}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs shrink-0 border-l border-gray-200"
          >
            {show ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        <button
          onClick={onSave}
          disabled={isSaving || !draft}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 shrink-0"
        >
          {isSaving ? '...' : isSaved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        {settingKey === 'anthropic_api_key'
          ? 'Encontre sua chave em console.anthropic.com'
          : 'Encontre sua chave em platform.openai.com/api-keys'
        }
      </p>
    </div>
  )
}
