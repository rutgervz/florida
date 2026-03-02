import { supabaseAdmin } from './supabase'
import type { Availability, Product } from './types'

export async function getAvailability(
  productId: string,
  date: string
): Promise<Availability> {
  // Get product
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('active', true)
    .single()

  if (productError || !product) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
  }

  // Check if day of week is available
  const dayOfWeek = new Date(date).getDay() // 0=Sun, 1=Mon, ...
  // Convert JS day (0=Sun) to our format (1=Mon, ..., 7=Sun)
  const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek
  if (!product.available_days.includes(ourDay)) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: 'Niet beschikbaar op deze dag' }
  }

  // Check blocked dates
  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates')
    .select('*')
    .eq('date', date)
    .or(`product_id.eq.${productId},product_id.is.null`)

  if (blockedDates && blockedDates.length > 0) {
    return {
      adults_available: 0,
      children_available: 0,
      total_available: 0,
      blocked: true,
      block_reason: blockedDates[0].reason || 'Geblokkeerd',
    }
  }

  // Calculate used slots from active reservations (pending + confirmed)
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('num_adults, num_children')
    .eq('product_id', productId)
    .eq('date', date)
    .in('status', ['pending', 'confirmed'])

  let usedAdults = 0
  let usedChildren = 0
  if (reservations) {
    for (const r of reservations) {
      usedAdults += r.num_adults
      usedChildren += r.num_children
    }
  }

  const usedTotal = usedAdults + usedChildren
  const totalLeft = product.slots_total - usedTotal
  const adultsAvailable = Math.min(product.slots_adult - usedAdults, totalLeft)
  const childrenAvailable = Math.min(product.slots_child - usedChildren, totalLeft)

  return {
    adults_available: Math.max(0, adultsAvailable),
    children_available: Math.max(0, childrenAvailable),
    total_available: Math.max(0, totalLeft),
    blocked: false,
  }
}

// Get availability for all active products on a date range
export async function getAvailabilityRange(
  startDate: string,
  endDate: string,
  productId?: string
) {
  const results: Record<string, Record<string, Availability>> = {}

  // Get products
  let query = supabaseAdmin
    .from('products')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  if (productId) {
    query = query.eq('id', productId)
  }

  const { data: products } = await query
  if (!products) return results

  // Generate date range
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  // Get all blocked dates in range
  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)

  // Get all reservations in range
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('product_id, date, num_adults, num_children')
    .gte('date', startDate)
    .lte('date', endDate)
    .in('status', ['pending', 'confirmed'])

  // Calculate availability for each product/date combo
  for (const product of products) {
    results[product.id] = {}

    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay()
      const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek

      // Day not available
      if (!product.available_days.includes(ourDay)) {
        results[product.id][date] = {
          adults_available: 0,
          children_available: 0,
          total_available: 0,
          blocked: true,
        }
        continue
      }

      // Check blocked
      const blocked = blockedDates?.find(
        b => b.date === date && (b.product_id === product.id || b.product_id === null)
      )
      if (blocked) {
        results[product.id][date] = {
          adults_available: 0,
          children_available: 0,
          total_available: 0,
          blocked: true,
          block_reason: blocked.reason || 'Geblokkeerd',
        }
        continue
      }

      // Calculate used
      let usedAdults = 0
      let usedChildren = 0
      reservations
        ?.filter(r => r.product_id === product.id && r.date === date)
        .forEach(r => {
          usedAdults += r.num_adults
          usedChildren += r.num_children
        })

      const usedTotal = usedAdults + usedChildren
      const totalLeft = product.slots_total - usedTotal

      results[product.id][date] = {
        adults_available: Math.max(0, Math.min(product.slots_adult - usedAdults, totalLeft)),
        children_available: Math.max(0, Math.min(product.slots_child - usedChildren, totalLeft)),
        total_available: Math.max(0, totalLeft),
        blocked: false,
      }
    }
  }

  return results
}
