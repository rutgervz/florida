import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID, isValidDate, isValidTime, sanitizeString } from '@/lib/validation'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .select('*, products(name, icon, slots_total)')
    .order('date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { date, date_end, product_id, time_slot, reason, reduce_capacity, reduce_type } = body

  const startDate = date
  const endDate = date_end || date

  if (!startDate || !isValidDate(startDate)) return NextResponse.json({ error: 'Geldige startdatum is verplicht' }, { status: 400 })
  if (!isValidDate(endDate)) return NextResponse.json({ error: 'Ongeldige einddatum' }, { status: 400 })
  if (endDate < startDate) return NextResponse.json({ error: 'Einddatum moet na startdatum liggen' }, { status: 400 })
  if (product_id && !isValidUUID(product_id)) return NextResponse.json({ error: 'Ongeldig product ID' }, { status: 400 })
  if (time_slot && !isValidTime(time_slot)) return NextResponse.json({ error: 'Ongeldig tijdslot' }, { status: 400 })

  const cap = reduce_capacity && Number(reduce_capacity) > 0 ? Number(reduce_capacity) : null
  const rType = cap && reduce_type && ['adult', 'child'].includes(reduce_type) ? reduce_type : null
  const safeReason = reason ? sanitizeString(reason) : null

  // Generate dates in range
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  // Limit to 365 days
  if (dates.length > 365) return NextResponse.json({ error: 'Maximaal 365 dagen per keer' }, { status: 400 })

  // Use batch_id if multiple dates
  const batchId = dates.length > 1 ? randomUUID() : null

  const rows = dates.map(d => ({
    date: d,
    product_id: product_id || null,
    time_slot: time_slot || null,
    reason: safeReason,
    reduce_capacity: cap,
    reduce_type: rType,
    batch_id: batchId,
  }))

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ created: dates.length, batch_id: batchId })
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const batchId = searchParams.get('batch_id')

  if (batchId && isValidUUID(batchId)) {
    // Delete entire batch
    const { error } = await supabaseAdmin.from('blocked_dates').delete().eq('batch_id', batchId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted_batch: true })
  }

  if (!id || !isValidUUID(id)) return NextResponse.json({ error: 'Geldig ID is verplicht' }, { status: 400 })

  const { error } = await supabaseAdmin.from('blocked_dates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
