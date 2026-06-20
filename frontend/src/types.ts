export interface Product {
  id: number
  name: string
  code: string | null
  monthly_target: number
  current_stock: number
  min_batch: number
  priority: number
  notes: string | null
  created_at: string
}

export interface ProductInput {
  name: string
  code?: string
  monthly_target: number
  current_stock: number
  min_batch?: number
  priority?: number
  notes?: string
}

export interface Machine {
  id: number
  name: string
  code: string | null
  capacity_per_day: number
  working_days: string
  notes: string | null
  products: Array<{ id: number; name: string; code: string | null }>
  created_at: string
}

export interface MachineInput {
  name: string
  code?: string
  capacity_per_day: number
  working_days?: string
  notes?: string
}

export interface ProductPerformance {
  product_id: number
  product_name: string
  product_code: string | null
  monthly_target: number
  total_sold: number
  total_produced: number
  expected_sold_by_today: number
  sales_delta: number
  current_stock: number
  production_needed: number
  remaining_target: number
  stock_coverage_days: number
  next_month_consumed: number
  is_critical: boolean
  elapsed_working_days: number
  remaining_working_days: number
  total_working_days: number
  avg_daily_sales: number
}

export interface PerformanceReport {
  month: string
  elapsed_working_days: number
  remaining_working_days: number
  total_working_days: number
  products: ProductPerformance[]
}

export interface ScheduleEntry {
  id: number
  week_start: string
  scheduled_date: string
  machine_id: number
  product_id: number
  planned_quantity: number
  actual_quantity: number
  status: string
  notes: string | null
  agent_reasoning: string | null
  product_name: string
  product_code: string | null
  machine_name: string
  machine_code: string | null
  capacity_per_day: number
}

export interface MachineSchedule {
  machine_id: number
  machine_name: string
  machine_code: string | null
  capacity_per_day: number
  schedule: ScheduleEntry[]
}

export interface ScheduleData {
  week_start: string
  machines: MachineSchedule[]
}

export interface ScheduleCreateInput {
  week_start: string
  scheduled_date: string
  machine_id: number
  product_id: number
  planned_quantity: number
  actual_quantity?: number
  status?: string
  notes?: string
}

export interface ScheduleUpdateInput {
  planned_quantity?: number
  actual_quantity?: number
  status?: string
  notes?: string
  machine_id?: number
  product_id?: number
}

export interface GenerateResult {
  week_start: string
  schedule_count: number
  summary: string
  alerts: string[]
  provider?: string
  model?: string
}

export interface Rule {
  id: number
  rule_type: string
  name: string
  description: string
  active: number
  priority: number
  created_at: string
}

export interface RuleInput {
  rule_type: string
  name: string
  description: string
  active: number
  priority: number
}

export interface TrackingInput {
  tracking_date: string
  product_id: number
  stock_start: number
  produced: number
  sold: number
}

export interface Setting {
  key: string
  value: string
  label: string
  description: string
  input_type: string
  value_set: boolean
}
