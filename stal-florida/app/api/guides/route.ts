import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isValidUUID, isValidDate } from '@/lib/validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'list') {
    const { data, error } = await supabaseAdmin
      .from('guides').select('id, name').eq('active', true).order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const guideId = searchParams.get('guide_id')
  if (!guideId || !isValidUUID(guideId)) {
    return NextResponse.json({ error: 'guide_id is verplicht' }, { status: 400 })
  }

  const year = new Date().getFullYear()
  const seasonStart = year + '-04-01'
  const seasonEnd = year + '-10-31'
  const now = new Date()
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  const startDate = today > seasonStart ? today : seasonStart

  const { data: products } = await supabaseAdmin
    .from('products').select('*').eq('active', true).order('sort_order')
  if (!products) return NextResponse.json([])

  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('product_id, date, time_slot, num_adults, num_children')
    .gte('date', startDate).lte('date', seasonEnd)
    .in('status', ['confirmed', 'offline'])

  const { data: blockedDates } = await supabaseAdmin
    .from('blocked_dates').select('product_id, date, time_slot, reduce_capacity')
    .gte('date', startDate).lte('date', seasonEnd)

  const { data: myAssignments } = await supabaseAdmin
    .from('guide_assignments').select('product_id, date, time_slot')
    .eq('guide_id', guideId).gte('date', startDate).lte('date', seasonEnd)

  const { data: allAssignments } = await supabaseAdmin
    .from('guide_assignments').select('product_id, date, time_slot, guides(name)')
    .gte('date', startDate).lte('date', seasonEnd)

  const rides: any[] = []
  const rideCountMap = new Map<string, number>()

  reservations?.forEach(r => {
    const ts = r.time_slot ? r.time_slot.substring(0, 5) : ''
    const key = r.product_id + '|' + r.date + '|' + ts
    const current = rideCountMap.get(key) || 0
    rideCountMap.set(key, current + r.num_adults + r.num_children)
  })

  rideCountMap.forEach((riderCount, key) => {
    const [productId, date, timeSlot] = key.split('|')
    const product = products.find(p => p.id === productId)
    if (!product) return

    const isBlocked = blockedDates?.some(b =>
      b.date === date &&
      (!b.product_id || b.product_id === productId) &&
      !b.reduce_capacity &&
      (!b.time_slot || (timeSlot && b.time_slot.substring(0, 5) === timeSlot))
    )
    if (isBlocked) return

    const assigned = myAssignments?.some(a =>
      a.product_id === productId && a.date === date &&
      (timeSlot ? a.time_slot && a.time_slot.substring(0, 5) === timeSlot : !a.time_slot)
    ) || false

    const guideNames = allAssignments?.filter(a =>
      a.product_id === productId && a.date === date &&
      (timeSlot ? a.time_slot && a.time_slot.substring(0, 5) === timeSlot : !a.time_slot)
    ).map(a => (a.guides as any)?.name).filter(Boolean) || []

    rides.push({
      product_id: productId, date, time_slot: timeSlot || null,
      product_name: product.name, product_icon: product.icon,
      start_time: product.start_time ? product.start_time.substring(0, 5) : '',
      duration: product.duration_minutes, rider_count: riderCount,
      assigned, all_guides: guideNames,
    })
  })

  rides.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const tA = a.time_slot || a.start_time || ''
    const tB = b.time_slot || b.start_time || ''
    return tA.localeCompare(tB)
  })

  return NextResponse.json(rides)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { allowed } = rateLimit('guide:' + ip, 20, 60000)
  if (!allowed) return NextResponse.json({ error: 'Te veel verzoeken' }, { status: 429 })

  const body = await request.json()
  const { guide_id, product_id, date, time_slot } = body

  if (!isValidUUID(guide_id) || !isValidUUID(product_id) || !isValidDate(date)) {
    return NextResponse.json({ error: 'Ongeldige parameters' }, { status: 400 })
  }

  const { data: guide } = await supabaseAdmin
    .from('guides').select('id').eq('id', guide_id).eq('active', true).single()
  if (!guide) return NextResponse.json({ error: 'Begeleider niet gevonden' }, { status: 404 })

  let query = supabaseAdmin.from('guide_assignments').select('id')
    .eq('product_id', product_id).eq('date', date)
  if (time_slot) { query = query.eq('time_slot', time_slot) }
  else { query = query.is('time_slot', null) }
  const { data: existingCount } = await query

  if (existingCount && existingCount.length >= 2) {
    return NextResponse.json({ error: 'Er zijn al 2 begeleiders ingeschreven' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('guide_assignments').insert({
      guide_id, product_id, date, time_slot: time_slot || null,
    })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Je bent al ingeschreven' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assigned: true })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const guideId = searchParams.get('guide_id')
  const productId = searchParams.get('product_id')
  const date = searchParams.get('date')
  const timeSlot = searchParams.get('time_slot')

  if (!guideId || !productId || !date) {
    return NextResponse.json({ error: 'Ongeldige parameters' }, { status: 400 })
  }

  let query = supabaseAdmin.from('guide_assignments').delete()
    .eq('guide_id', guideId).eq('product_id', productId).eq('date', date)
  if (timeSlot) { query = query.eq('time_slot', timeSlot) }
  else { query = query.is('time_slot', null) }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ removed: true })
}
