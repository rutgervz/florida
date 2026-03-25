export interface Product {
  id: string
  name: string
  description: string
  icon: string
  price: number
  start_time: string
  arrive_time: string
  duration_minutes: number
  required_gaits: string[]
  min_age: number
  max_age: number | null
  max_weight_adult: number
  max_weight_child: number
  slots_adult: number
  slots_child: number
  slots_total: number
  available_days: number[]
  time_slots: string[] | null
  warning: string | null
  active: boolean
  sort_order: number
  gradient: string
  accent: string
}

export interface Rider {
  name: string
  age: number
  weight: number
  experience: string
  type: 'adult' | 'child'
}

export interface Reservation {
  id: string
  product_id: string
  date: string
  time_slot: string | null
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled'
  riders: Rider[]
  num_adults: number
  num_children: number
  contact_name: string
  contact_email: string
  contact_phone: string
  mollie_payment_id: string
  total_amount: number
  created_at: string
  expires_at: string
  confirmed_at: string | null
}

export interface BlockedDate {
  id: string
  date: string
  product_id: string | null
  reason: string | null
}

export interface SlotAvailability {
  total_available: number
  blocked: boolean
}

export interface Availability {
  adults_available: number
  children_available: number
  total_available: number
  blocked: boolean
  block_reason?: string
  slots?: Record<string, SlotAvailability>
}
