import { supabaseAdmin } from './supabase'
import type { Availability } from './types'

export async function getAvailability(
  productId: string,
  date: string,
  timeSlot?: string
): Promise<Availability> {
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('active', true)
    .single()

  if (productError || !product) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
  }

  const dayOfWeek = new Date(date).getDay()
  const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek
  if (!product.available_days.includes(ourDay)) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: 'Niet beschikbaar op deze dag' }
  }

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates')
    .select('*')
    .eq('date', date)
    .or('product_id.eq.' + productId + ',product_id.is.null')

  if (blockedDates && blockedDates.length > 0) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: blockedDates[0].reason || 'Geblokkeerd' }
  }

  // If product has time slots and a specific slot is requested
  if (product.time_slots && product.time_slots.length > 0 && timeSlot) {
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('num_adults, num_children')
      .eq('product_id', productId)
      .eq('date', date)
      .eq('time_slot', timeSlot)
      .in('status', ['pending', 'confirmed'])

    let used = 0
    if (reservations) {
      for (const r of reservations) { used += r.num_adults + r.num_children }
    }
    const totalLeft = product.slots_total - used
    return {
      adults_available: Math.max(0, Math.min(product.slots_adult, totalLeft)),
      children_available: Math.max(0, Math.min(product.slots_child, totalLeft)),
      total_available: Math.max(0, totalLeft),
      blocked: false,
    }
  }

  // If product has time slots, return per-slot availability
  if (product.time_slots && product.time_slots.length > 0) {
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('time_slot, num_adults, num_children')
      .eq('product_id', productId)
      .eq('date', date)
      .in('status', ['pending', 'confirmed'])

    const slots: Record<string, { total_available: number; blocked: boolean }> = {}
    let totalAvailAll = 0

    for (const slot of product.time_slots) {
      const slotKey = slot.substring(0, 5)
      let used = 0
      if (reservations) {
        for (const r of reservations) {
          if (r.time_slot && r.time_slot.substring(0, 5) === slotKey) {
            used += r.num_adults + r.num_children
          }
        }
      }
      const left = Math.max(0, product.slots_total - used)
      slots[slotKey] = { total_available: left, blocked: false }
      totalAvailAll += left
    }

    return {
      adults_available: 0,
      children_available: 0,
      total_available: totalAvailAll > 0 ? 1 : 0, // >0 means at least one slot available
      blocked: false,
      slots,
    }
  }

  // Single time slot product (original logic)
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
  return {
    adults_available: Math.max(0, Math.min(product.slots_adult - usedAdults, totalLeft)),
    children_available: Math.max(0, Math.min(product.slots_child - usedChildren, totalLeft)),
    total_available: Math.max(0, totalLeft),
    blocked: false,
  }
}

export async function getAvailabilityRange(startDate: string, endDate: string, productId?: string) {
  const results: Record<string, Record<string, Availability>> = {}

  let query = supabaseAdmin.from('products').select('*').eq('active', true).order('sort_order')
  if (productId) query = query.eq('id', productId)
  const { data: products } = await query
  if (!products) return results

  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates').select('*').gte('date', startDate).lte('date', endDate)

  const { data: reservations } = await supabaseAdmin
    .from('reservations').select('product_id, date, time_slot, num_adults, num_children')
    .gte('date', startDate).lte('date', endDate).in('status', ['pending', 'confirmed'])

  for (const product of products) {
    results[product.id] = {}

    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay()
      const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek

      if (!product.available_days.includes(ourDay)) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
        continue
      }

      const blocked = blockedDates?.find(b => b.date === date && (b.product_id === product.id || b.product_id === null))
      if (blocked) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: blocked.reason || 'Geblokkeerd' }
        continue
      }

      // Time slots product
      if (product.time_slots && product.time_slots.length > 0) {
        const slots: Record<string, { total_available: number; blocked: boolean }> = {}
        let totalAvailAll = 0

        for (const slot of product.time_slots) {
          const slotKey = slot.substring(0, 5)
          let used = 0
          reservations?.filter(r => r.product_id === product.id && r.date === date && r.time_slot && r.time_slot.substring(0, 5) === slotKey)
            .forEach(r => { used += r.num_adults + r.num_children })
          const left = Math.max(0, product.slots_total - used)
          slots[slotKey] = { total_available: left, blocked: false }
          totalAvailAll += left
        }

        results[product.id][date] = {
          adults_available: 0, children_available: 0,
          total_available: totalAvailAll > 0 ? 1 : 0,
          blocked: false, slots,
        }
        continue
      }

      // Single slot product
      let usedAdults = 0; let usedChildren = 0
      reservations?.filter(r => r.product_id === product.id && r.date === date)
        .forEach(r => { usedAdults += r.num_adults; usedChildren += r.num_children })

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
