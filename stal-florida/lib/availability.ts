import { supabaseAdmin } from './supabase'
import type { Availability } from './types'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'offline']

// Filter string for Supabase: only count pending if not expired
const ACTIVE_FILTER = 'and(status.in.(confirmed,offline)),and(status.eq.pending,expires_at.gt.now())'

interface Reduction { amount: number; type: string | null }

function applyReductions(slotsTotal: number, slotsAdult: number, slotsChild: number, reductions: Reduction[]) {
  let t = slotsTotal, a = slotsAdult, c = slotsChild
  for (const r of reductions) {
    if (r.type === 'adult') { a = Math.max(0, a - r.amount); t = Math.max(0, t - r.amount) }
    else if (r.type === 'child') { c = Math.max(0, c - r.amount); t = Math.max(0, t - r.amount) }
    else { t = Math.max(0, t - r.amount); a = Math.min(a, t); c = Math.min(c, t) }
  }
  return { slotsTotal: t, slotsAdult: a, slotsChild: c }
}

function collectReductions(blocks: any[], timeSlotFilter?: string): Reduction[] {
  const reductions: Reduction[] = []
  for (const b of blocks) {
    if (!b.reduce_capacity || b.reduce_capacity <= 0) continue
    if (!b.time_slot) { reductions.push({ amount: b.reduce_capacity, type: b.reduce_type || null }) }
    else if (timeSlotFilter && b.time_slot.substring(0, 5) === timeSlotFilter) {
      reductions.push({ amount: b.reduce_capacity, type: b.reduce_type || null })
    }
  }
  return reductions
}

export async function getAvailability(productId: string, date: string, timeSlot?: string): Promise<Availability> {
  const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', productId).eq('active', true).single()
  if (!product) return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }

  const dayOfWeek = new Date(date).getDay()
  const ourDay = dayOfWeek === 0 ? 7 : dayOfWeek
  if (!product.available_days.includes(ourDay)) return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }

  const { data: blocks } = await supabaseAdmin.from('blocked_dates').select('*').eq('date', date).or('product_id.eq.' + productId + ',product_id.is.null')
  const fullBlock = blocks?.find(b => !b.time_slot && !b.reduce_capacity)
  if (fullBlock) return { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fullBlock.reason || 'Geblokkeerd' }

  if (product.time_slots && product.time_slots.length > 0) {
    if (timeSlot) {
      const slotBlock = blocks?.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === timeSlot.substring(0, 5))
      if (slotBlock) return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }
      const red = applyReductions(product.slots_total, product.slots_adult, product.slots_child, collectReductions(blocks || [], timeSlot.substring(0, 5)))
      const { data: res } = await supabaseAdmin.from('reservations').select('num_adults, num_children').eq('product_id', productId).eq('date', date).eq('time_slot', timeSlot).or(ACTIVE_FILTER)
      let used = 0; res?.forEach(r => { used += r.num_adults + r.num_children })
      const left = red.slotsTotal - used
      return { adults_available: Math.max(0, Math.min(red.slotsAdult, left)), children_available: Math.max(0, Math.min(red.slotsChild, left)), total_available: Math.max(0, left), blocked: false }
    }
    const { data: res } = await supabaseAdmin.from('reservations').select('time_slot, num_adults, num_children').eq('product_id', productId).eq('date', date).or(ACTIVE_FILTER)
    const slots: Record<string, { total_available: number; blocked: boolean }> = {}; let anyAvail = 0
    for (const slot of product.time_slots) {
      const sk = slot.substring(0, 5)
      if (blocks?.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === sk)) { slots[sk] = { total_available: 0, blocked: true }; continue }
      const red = applyReductions(product.slots_total, product.slots_adult, product.slots_child, collectReductions(blocks || [], sk))
      let used = 0; res?.filter(r => r.time_slot && r.time_slot.substring(0, 5) === sk).forEach(r => { used += r.num_adults + r.num_children })
      const left = Math.max(0, red.slotsTotal - used); slots[sk] = { total_available: left, blocked: false }; anyAvail += left
    }
    return { adults_available: 0, children_available: 0, total_available: anyAvail > 0 ? 1 : 0, blocked: false, slots }
  }

  // Single slot
  const slotBlock = blocks?.find(b => !b.reduce_capacity && b.time_slot && product.start_time && b.time_slot.substring(0, 5) === product.start_time.substring(0, 5))
  if (slotBlock) return { adults_available: 0, children_available: 0, total_available: 0, blocked: true }

  const red = applyReductions(product.slots_total, product.slots_adult, product.slots_child, collectReductions(blocks || []))
  const { data: res } = await supabaseAdmin.from('reservations').select('num_adults, num_children').eq('product_id', productId).eq('date', date).or(ACTIVE_FILTER)
  let uA = 0, uC = 0; res?.forEach(r => { uA += r.num_adults; uC += r.num_children })
  const left = red.slotsTotal - uA - uC
  const adultsAvail = Math.max(0, Math.min(red.slotsAdult - uA, left))
  // Children can fill any remaining slot not taken by adults
  const childrenAvail = Math.max(0, left)
  return { adults_available: adultsAvail, children_available: childrenAvail, total_available: Math.max(0, left), blocked: false }
}

export async function getAvailabilityRange(startDate: string, endDate: string, productId?: string) {
  const results: Record<string, Record<string, Availability>> = {}
  let query = supabaseAdmin.from('products').select('*').eq('active', true).order('sort_order')
  if (productId) query = query.eq('id', productId)
  const { data: products } = await query
  if (!products) return results

  const dates: string[] = []; const cur = new Date(startDate + 'T12:00:00'); const end = new Date(endDate + 'T12:00:00')
  while (cur <= end) { const y = cur.getFullYear(); const m = String(cur.getMonth() + 1).padStart(2, '0'); const dd = String(cur.getDate()).padStart(2, '0'); dates.push(y + '-' + m + '-' + dd); cur.setDate(cur.getDate() + 1) }

  const { data: allBlocks } = await supabaseAdmin.from('blocked_dates').select('*').gte('date', startDate).lte('date', endDate)
  const { data: allRes } = await supabaseAdmin.from('reservations').select('product_id, date, time_slot, num_adults, num_children').gte('date', startDate).lte('date', endDate).or(ACTIVE_FILTER)

  // Normalize dates from Supabase (could be '2026-04-01' or '2026-04-01T00:00:00')
  const normDate = (d: string) => d ? d.substring(0, 10) : ''

  for (const product of products) {
    results[product.id] = {}
    for (const date of dates) {
      const dow = new Date(date).getDay(); const od = dow === 0 ? 7 : dow
      if (!product.available_days.includes(od)) { results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true }; continue }

      const db = allBlocks?.filter(b => normDate(b.date) === date && (b.product_id === product.id || b.product_id === null)) || []
      const fb = db.find(b => !b.time_slot && !b.reduce_capacity)
      if (fb) { results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true, block_reason: fb.reason || 'Geblokkeerd' }; continue }

      if (product.time_slots && product.time_slots.length > 0) {
        const slots: Record<string, { total_available: number; blocked: boolean }> = {}; let anyAvail = 0
        for (const slot of product.time_slots) {
          const sk = slot.substring(0, 5)
          if (db.find(b => !b.reduce_capacity && b.time_slot && b.time_slot.substring(0, 5) === sk)) { slots[sk] = { total_available: 0, blocked: true }; continue }
          const red = applyReductions(product.slots_total, product.slots_adult, product.slots_child, collectReductions(db, sk))
          let used = 0; allRes?.filter(r => r.product_id === product.id && normDate(r.date) === date && r.time_slot && r.time_slot.substring(0, 5) === sk).forEach(r => { used += r.num_adults + r.num_children })
          const left = Math.max(0, red.slotsTotal - used); slots[sk] = { total_available: left, blocked: false }; anyAvail += left
        }
        results[product.id][date] = { adults_available: 0, children_available: 0, total_available: anyAvail > 0 ? 1 : 0, blocked: false, slots }; continue
      }

      const sb = db.find(b => !b.reduce_capacity && b.time_slot && product.start_time && b.time_slot.substring(0, 5) === product.start_time.substring(0, 5))
      if (sb) { results[product.id][date] = { adults_available: 0, children_available: 0, total_available: 0, blocked: true }; continue }

      const red = applyReductions(product.slots_total, product.slots_adult, product.slots_child, collectReductions(db))
      let uA = 0, uC = 0; allRes?.filter(r => r.product_id === product.id && normDate(r.date) === date).forEach(r => { uA += r.num_adults; uC += r.num_children })
      const left = red.slotsTotal - uA - uC
      results[product.id][date] = { adults_available: Math.max(0, Math.min(red.slotsAdult - uA, left)), children_available: Math.max(0, left), total_available: Math.max(0, left), blocked: false }
    }
  }
  return results
}
