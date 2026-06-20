import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { SchedulePage } from './pages/SchedulePage'
import { RulesPage } from './pages/RulesPage'
import { ProductsPage } from './pages/ProductsPage'
import { MachinesPage } from './pages/MachinesPage'

type Page = 'dashboard' | 'schedule' | 'rules' | 'products' | 'machines'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'D' },
  { id: 'schedule', label: 'Programacao', icon: 'P' },
  { id: 'rules', label: 'Regras do Agente', icon: 'R' },
  { id: 'products', label: 'Produtos', icon: 'X' },
  { id: 'machines', label: 'Maquinas', icon: 'M' },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'schedule': return <SchedulePage />
      case 'rules': return <RulesPage />
      case 'products': return <ProductsPage />
      case 'machines': return <MachinesPage />
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <h1 className="text-lg font-bold">PsiGest-O</h1>
          <p className="text-xs text-slate-400 mt-0.5">Programacao de Producao</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(item => (
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
        </nav>
        <div className="px-5 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">Agente: Claude Sonnet</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{renderPage()}</main>
    </div>
  )
}
