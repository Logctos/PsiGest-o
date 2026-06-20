import type {
  Product, ProductInput,
  Machine, MachineInput,
  PerformanceReport,
  ScheduleData, ScheduleCreateInput, ScheduleUpdateInput, GenerateResult,
  Rule, RuleInput,
  TrackingInput,
} from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// Products
export const getProducts = () => req<Product[]>('/api/products')
export const createProduct = (d: ProductInput) => req<Product>('/api/products', { method: 'POST', body: JSON.stringify(d) })
export const updateProduct = (id: number, d: ProductInput) => req<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(d) })
export const deleteProduct = (id: number) => req<void>(`/api/products/${id}`, { method: 'DELETE' })

// Machines
export const getMachines = () => req<Machine[]>('/api/machines')
export const createMachine = (d: MachineInput) => req<Machine>('/api/machines', { method: 'POST', body: JSON.stringify(d) })
export const updateMachine = (id: number, d: MachineInput) => req<Machine>(`/api/machines/${id}`, { method: 'PUT', body: JSON.stringify(d) })
export const assignProduct = (mid: number, pid: number) => req<void>(`/api/machines/${mid}/products/${pid}`, { method: 'POST' })
export const removeProduct = (mid: number, pid: number) => req<void>(`/api/machines/${mid}/products/${pid}`, { method: 'DELETE' })

// Analytics
export const getPerformance = (month?: string) =>
  req<PerformanceReport>(`/api/analytics/performance${month ? `?month=${month}` : ''}`)

// Schedule
export const getSchedule = (weekStart?: string) =>
  req<ScheduleData>(`/api/schedule${weekStart ? `?week_start=${weekStart}` : ''}`)
export const createScheduleEntry = (d: ScheduleCreateInput) =>
  req<ScheduleEntry>('/api/schedule', { method: 'POST', body: JSON.stringify(d) })
export const generateSchedule = (weekStart: string, regenerate = false) =>
  req<GenerateResult>('/api/schedule/generate', { method: 'POST', body: JSON.stringify({ week_start: weekStart, regenerate }) })
export const updateScheduleEntry = (id: number, d: ScheduleUpdateInput) =>
  req<ScheduleEntry>(`/api/schedule/${id}`, { method: 'PUT', body: JSON.stringify(d) })
export const deleteScheduleEntry = (id: number) => req<void>(`/api/schedule/${id}`, { method: 'DELETE' })

// Rules
export const getRules = () => req<Rule[]>('/api/rules')
export const createRule = (d: RuleInput) => req<Rule>('/api/rules', { method: 'POST', body: JSON.stringify(d) })
export const updateRule = (id: number, d: RuleInput) => req<Rule>(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(d) })
export const deleteRule = (id: number) => req<void>(`/api/rules/${id}`, { method: 'DELETE' })

// Tracking
export const createTracking = (d: TrackingInput) => req<void>('/api/tracking', { method: 'POST', body: JSON.stringify(d) })
export const getTracking = (month?: string, productId?: number) => {
  const p = new URLSearchParams()
  if (month) p.set('month', month)
  if (productId) p.set('product_id', String(productId))
  return req<unknown[]>(`/api/tracking?${p}`)
}
