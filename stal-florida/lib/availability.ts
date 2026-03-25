import { supabaseAdmin } from './supabase'
import type { Availability } from './types'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'offline']

export async function getAvailability(productId: string, date: string, timeSlot?: string): Promise<Availability> {
  const { data: product, error: productError } = await supabaseAdmin
    .from('products').select('*').eq('id', productId).eq('active', true).single()

  if (productError || !product) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
  }

  const dayOfWeek = new Date(date).getDay()
  const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek
  if (!product.available_days.includes(ourDay)) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: 'Niet beschikbaar op deze dag' }
  }

  // Check blocked dates (including time_slot-specific blocks)
  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates').select('*').eq('date', date)
    .or('product_id.eq.' + productId + ',product_id.is.null')

  // Check for full-day blocks (time_slot is null)
  const fullDayBlock = blockedDates?.find(b => !b.time_slot)
  if (fullDayBlock) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fullDayBlock.reason || 'Geblokkeerd' }
  }

  // Time slot products
  if (product.time_slots && product.time_slots.length > 0) {
    // Specific slot requested
    if (timeSlot) {
      const slotBlocked = blockedDates?.find(b => b.time_slot && b.time_slot.substring(0, 5) === timeSlot.substring(0, 5))
      if (slotBlocked) {
        return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlocked.reason || 'Geblokkeerd' }
      }

      const { data: reservations } = await supabaseAdmin
        .from('reservations').select('num_adults, num_children')
        .eq('product_id', productId).eq('date', date).eq('time_slot', timeSlot)
        .in('status', ACTIVE_STATUSES)

      let used = 0
      if (reservations) { for (const r of reservations) { used += r.num_adults + r.num_children } }
      const totalLeft = product.slots_total - used
      return {
        adults_available: Math.max(0, Math.min(product.slots_adult, totalLeft)),
        children_available: Math.max(0, Math.min(product.slots_child, totalLeft)),
        total_available: Math.max(0, totalLeft), blocked: false,
      }
    }

    // All slots overview
    const { data: reservations } = await supabaseAdmin
      .from('reservations').select('time_slot, num_adults, num_children')
      .eq('product_id', productId).eq('date', date).in('status', ACTIVE_STATUSES)

    const slots: Record<string, { total_available: number; blocked: boolean }> = {}
    let totalAvailAll = 0

    for (const slot of product.time_slots) {
      const slotKey = slot.substring(0, 5)
      const slotBlocked = blockedDates?.find(b => b.time_slot && b.time_slot.substring(0, 5) === slotKey)

      if (slotBlocked) {
        slots[slotKey] = { total_available: 0, blocked: true }
        continue
      }

      let used = 0
      if (reservations) {
        for (const r of reservations) {
          if (r.time_slot && r.time_slot.substring(0, 5) === slotKey) { used += r.num_adults + r.num_children }
        }
      }
      const left = Math.max(0, product.slots_total - used)
      slots[slotKey] = { total_available: left, blocked: false }
      totalAvailAll += left
    }

    return { adults_available: 0, children_available: 0, total_available: totalAvailAll > 0 ? 1 : 0, blocked: false, slots }
  }

  // Single slot product — check slot-specific block for start_time
  const slotBlock = blockedDates?.find(b => b.time_slot)
  if (slotBlock && product.start_time && slotBlock.time_slot.substring(0, 5) === product.start_time.substring(0, 5)) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlock.reason || 'Geblokkeerd' }
  }

  const { data: reservations } = await supabaseAdmin
    .from('reservations').select('num_adults, num_children')
    .eq('product_id', productId).eq('date', date).in('status', ACTIVE_STATUSES)

  let usedAdults = 0; let usedChildren = 0
  if (reservations) { for (const r of reservations) { usedAdults += r.num_adults; usedChildren += r.num_children } }

  const usedTotal = usedAdults + usedChildren
  const totalLeft = product.slots_total - usedTotal
  return {
    adults_available: Math.max(0, Math.min(product.slots_adult - usedAdults, totalLeft)),
    children_available: Math.max(0, Math.min(product.slots_child - usedChildren, totalLeft)),
    total_available: Math.max(0, totalLeft), blocked: false,
  }
}

export async function getAvailabilityRange(startDate: string, endDate: string, productId?: string) {
  const results: Record<string, Record<string, Availability>> = {}

  let query = supabaseAdmin.from('products').select('*').eq('active', true).order('sort_order')
  if (productId) query = query.eq('id', productId)
  const { data: products } = await query
  if (!products) return results

  const dates: string[] = []
  const current = new Date(startDate); const end = new Date(endDate)
  while (current <= end) { dates.push(current.toISOString().split('T')[0]); current.setDate(current.getDate() + 1) }

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates').select('*').gte('date', startDate).lte('date', endDate)

  const { data: reservations } = await supabaseAdmin
    .from('reservations').select('product_id, date, time_slot, num_adults, num_children')
    .gte('date', startDate).lte('date', endDate).in('status', ACTIVE_STATUSES)

  for (const product of products) {
    results[product.id] = {}
    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay()
      const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek

      if (!product.available_days.includes(ourDay)) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
        continue
      }

      const dateBlocks = blockedDates?.filter(b => b.date === date && (b.product_id === product.id || b.product_id === null)) || []
      const fullDayBlock = dateBlocks.find(b => !b.time_slot)

      if (fullDayBlock) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fullDayBlock.reason || 'Geblokkeerd' }
        continue
      }

      if (product.time_slots && product.time_slots.length > 0) {
        const slots: Record<string, { total_available: number; blocked: boolean }> = {}
        let totalAvailAll = 0
        for (const slot of product.time_slots) {
          const slotKey = slot.substring(0, 5)
          const slotBlocked = dateBlocks.find(b => b.time_slot && b.time_slot.substring(0, 5) === slotKey)
          if (slotBlocked) { slots[slotKey] = { total_available: 0, blocked: true }; continue }
          let used = 0
          reservations?.filter(r => r.product_id === product.id && r.date === date && r.time_slot && r.time_slot.substring(0, 5) === slotKey)
            .forEach(r => { used += r.num_adults + r.num_children })
          const left = Math.max(0, product.slots_total - used)
          slots[slotKey] = { total_available: left, blocked: false }; totalAvailAll += left
        }
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: totalAvailAll > 0 ? 1 : 0, blocked: false, slots }
        continue
      }

      // Single slot — check slot-specific block
      const slotBlock = dateBlocks.find(b => b.time_slot && product.start_time && b.time_slot.substring(0, 5) === product.start_time.substring(0, 5))
      if (slotBlock) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlock.reason || 'Geblokkeerd' }
        continue
      }

      let usedAdults = 0; let usedChildren = 0
      reservations?.filter(r => r.product_id === product.id && r.date === date)
        .forEach(r => { usedAdults += r.num_adults; usedChildren += r.num_children })
      const usedTotal = usedAdults + usedChildren; const totalLeft = product.slots_total - usedTotal
      results[product.id][date] = {
        adults_available: Math.max(0, Math.min(product.slots_adult - usedAdults, totalLeft)),
        children_available: Math.max(0, Math.min(product.slots_child - usedChildren, totalLeft)),
        total_available: Math.max(0, totalLeft), blocked: false,
      }
    }
  }
  return results
}
