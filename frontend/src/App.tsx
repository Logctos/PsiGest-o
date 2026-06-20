import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { SchedulePage } from './pages/SchedulePage'
import { RulesPage } from './pages/RulesPage'
import { ProductsPage } from './pages/ProductsPage'
import { MachinesPage } from './pages/MachinesPage'
import { SettingsPage } from './pages/SettingsPage'

type Page = 'dashboard' | 'schedule' | 'rules' | 'products' | 'machines' | 'settings'

const NAV: { id: Page; label: string; icon: string; section?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',      icon: 'D', section: 'principal' },
  { id: 'schedule',   label: 'Programacao',    icon: 'P', section: 'principal' },
  { id: 'rules',      label: 'Regras do Agente', icon: 'R', section: 'principal' },
  { id: 'products',   label: 'Produtos',       icon: 'X', section: 'cadastros' },
  { id: 'machines',   label: 'Maquinas',       icon: 'M', section: 'cadastros' },
  { id: 'settings',   label: 'Configuracoes',  icon: 'C', section: 'sistema'   },
]

const SECTIONS: { id: string; label: string }[] = [
  { id: 'principal', label: 'Principal' },
  { id: 'cadastros', label: 'Cadastros' },
  { id: 'sistema',   label: 'Sistema' },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'schedule':  return <SchedulePage />
      case 'rules':     return <RulesPage />
      case 'products':  return <ProductsPage />
      case 'machines':  return <MachinesPage />
      case 'settings':  return <SettingsPage />
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <h1 className="text-lg font-bold">PsiGest-O</h1>
          <p className="text-xs text-slate-400 mt-0.5">Programacao de Producao</p>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {SECTIONS.map(section => (
            <div key={section.id} className="mb-1">
              <p className="px-5 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {section.label}
              </p>
              {NAV.filter(n => n.section === section.id).map(item => (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors ${
                    page === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-slate-700">
          <button
            onClick={() => setPage('settings')}
            className={`w-full flex items-center gap-2 text-xs rounded-lg px-2 py-2 transition-colors ${
              page === 'settings' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span className="text-base">&#9881;</span> Configuracoes de IA
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{renderPage()}</main>
    </div>
  )
}
