import { supabaseAdmin } from './supabase'
import type { Availability } from './types'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'offline']

function applyReduction(slotsTotal: number, slotsAdult: number, slotsChild: number, reduction: number) {
  const newTotal = Math.max(0, slotsTotal - reduction)
  const newAdult = Math.min(slotsAdult, newTotal)
  const newChild = Math.min(slotsChild, newTotal)
  return { slotsTotal: newTotal, slotsAdult: newAdult, slotsChild: newChild }
}

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

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates').select('*').eq('date', date)
    .or('product_id.eq.' + productId + ',product_id.is.null')

  // Full-day block (no time_slot, no reduce_capacity)
  const fullDayBlock = blockedDates?.find(b => !b.time_slot && !b.reduce_capacity)
  if (fullDayBlock) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fullDayBlock.reason || 'Geblokkeerd' }
  }

  // Calculate capacity reductions for this product (entries with reduce_capacity set)
  let totalReduction = 0
  blockedDates?.forEach(b => {
    if (b.reduce_capacity && b.reduce_capacity > 0) {
      if (!b.time_slot) {
        // Reduction applies to all slots / the single slot
        totalReduction += b.reduce_capacity
      }
    }
  })

  // Time slot products
  if (product.time_slots && product.time_slots.length > 0) {
    if (timeSlot) {
      const slotBlocked = blockedDates?.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === timeSlot.substring(0, 5))
      if (slotBlocked) {
        return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlocked.reason || 'Geblokkeerd' }
      }

      // Slot-specific reductions
      let slotReduction = totalReduction
      blockedDates?.forEach(b => {
        if (b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === timeSlot.substring(0, 5)) {
          slotReduction += b.reduce_capacity
        }
      })

      const reduced = applyReduction(product.slots_total, product.slots_adult, product.slots_child, slotReduction)

      const { data: reservations } = await supabaseAdmin
        .from('reservations').select('num_adults, num_children')
        .eq('product_id', productId).eq('date', date).eq('time_slot', timeSlot)
        .in('status', ACTIVE_STATUSES)

      let used = 0
      if (reservations) { for (const r of reservations) { used += r.num_adults + r.num_children } }
      const totalLeft = reduced.slotsTotal - used
      return {
        adults_available: Math.max(0, Math.min(reduced.slotsAdult, totalLeft)),
        children_available: Math.max(0, Math.min(reduced.slotsChild, totalLeft)),
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
      const slotBlocked = blockedDates?.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === slotKey)
      if (slotBlocked) { slots[slotKey] = { total_available: 0, blocked: true }; continue }

      let slotReduction = totalReduction
      blockedDates?.forEach(b => {
        if (b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === slotKey) {
          slotReduction += b.reduce_capacity
        }
      })

      const reduced = applyReduction(product.slots_total, product.slots_adult, product.slots_child, slotReduction)
      let used = 0
      if (reservations) {
        for (const r of reservations) {
          if (r.time_slot && r.time_slot.substring(0, 5) === slotKey) { used += r.num_adults + r.num_children }
        }
      }
      const left = Math.max(0, reduced.slotsTotal - used)
      slots[slotKey] = { total_available: left, blocked: false }
      totalAvailAll += left
    }

    return { adults_available: 0, children_available: 0, total_available: totalAvailAll > 0 ? 1 : 0, blocked: false, slots }
  }

  // Single slot product
  const slotBlock = blockedDates?.find(b => !b.reduce_capacity && b.time_slot && product.start_time && b.time_slot.substring(0, 5) === product.start_time.substring(0, 5))
  if (slotBlock) {
    return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlock.reason || 'Geblokkeerd' }
  }

  const reduced = applyReduction(product.slots_total, product.slots_adult, product.slots_child, totalReduction)

  const { data: reservations } = await supabaseAdmin
    .from('reservations').select('num_adults, num_children')
    .eq('product_id', productId).eq('date', date).in('status', ACTIVE_STATUSES)

  let usedAdults = 0; let usedChildren = 0
  if (reservations) { for (const r of reservations) { usedAdults += r.num_adults; usedChildren += r.num_children } }

  const usedTotal = usedAdults + usedChildren
  const totalLeft = reduced.slotsTotal - usedTotal
  return {
    adults_available: Math.max(0, Math.min(reduced.slotsAdult - usedAdults, totalLeft)),
    children_available: Math.max(0, Math.min(reduced.slotsChild - usedChildren, totalLeft)),
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
      const fullDayBlock = dateBlocks.find(b => !b.time_slot && !b.reduce_capacity)

      if (fullDayBlock) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fullDayBlock.reason || 'Geblokkeerd' }
        continue
      }

      let totalReduction = 0
      dateBlocks.forEach(b => { if (b.reduce_capacity && !b.time_slot) totalReduction += b.reduce_capacity })

      if (product.time_slots && product.time_slots.length > 0) {
        const slots: Record<string, { total_available: number; blocked: boolean }> = {}
        let totalAvailAll = 0
        for (const slot of product.time_slots) {
          const slotKey = slot.substring(0, 5)
          const slotBlocked = dateBlocks.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === slotKey)
          if (slotBlocked) { slots[slotKey] = { total_available: 0, blocked: true }; continue }

          let slotReduction = totalReduction
          dateBlocks.forEach(b => { if (b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === slotKey) slotReduction += b.reduce_capacity })

          const reduced = applyReduction(product.slots_total, product.slots_adult, product.slots_child, slotReduction)
          let used = 0
          reservations?.filter(r => r.product_id === product.id && r.date === date && r.time_slot && r.time_slot.substring(0, 5) === slotKey)
            .forEach(r => { used += r.num_adults + r.num_children })
          const left = Math.max(0, reduced.slotsTotal - used)
          slots[slotKey] = { total_available: left, blocked: false }; totalAvailAll += left
        }
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: totalAvailAll > 0 ? 1 : 0, blocked: false, slots }
        continue
      }

      const slotBlock = dateBlocks.find(b => !b.reduce_capacity && b.time_slot && product.start_time && b.time_slot.substring(0, 5) === product.start_time.substring(0, 5))
      if (slotBlock) {
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: slotBlock.reason || 'Geblokkeerd' }
        continue
      }

      const reduced = applyReduction(product.slots_total, product.slots_adult, product.slots_child, totalReduction)
      let usedAdults = 0; let usedChildren = 0
      reservations?.filter(r => r.product_id === product.id && r.date === date)
        .forEach(r => { usedAdults += r.num_adults; usedChildren += r.num_children })
      const usedTotal = usedAdults + usedChildren; const totalLeft = reduced.slotsTotal - usedTotal
      results[product.id][date] = {
        adults_available: Math.max(0, Math.min(reduced.slotsAdult - usedAdults, totalLeft)),
        children_available: Math.max(0, Math.min(reduced.slotsChild - usedChildren, totalLeft)),
        total_available: Math.max(0, totalLeft), blocked: false,
      }
    }
  }
  return results
}
