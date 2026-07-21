import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID, isValidDate, isValidTime, sanitizeName, sanitizeString, isValidEmail } from '@/lib/validation'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const descending = searchParams.get('order') === 'desc'

  let query = supabaseAdmin
    .from('reservations')
    .select('*, products(name, icon, start_time, arrive_time, time_slots)')
    .order('date', { ascending: !descending })
    .order('created_at', { ascending: false })
    .limit(500)

  if (status) {
    const validStatuses = ['pending', 'confirmed', 'expired', 'cancelled', 'offline']
    if (validStatuses.includes(status)) {
      query = query.eq('status', status)
    }
  } else {
    query = query.in('status', ['pending', 'confirmed', 'offline'])
  }

  if (startDate && isValidDate(startDate)) query = query.gte('date', startDate)
  if (endDate && isValidDate(endDate)) query = query.lte('date', endDate)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: create offline booking (manually entered)
export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { product_id, date, time_slot, riders, contact_name, contact_email, contact_phone } = body

  if (!isValidUUID(product_id)) return NextResponse.json({ error: 'Ongeldig product' }, { status: 400 })
  if (!isValidDate(date)) return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 })
  if (time_slot && !isValidTime(time_slot)) return NextResponse.json({ error: 'Ongeldig tijdslot' }, { status: 400 })

  if (!Array.isArray(riders) || riders.length === 0) {
    return NextResponse.json({ error: 'Voeg minimaal 1 ruiter toe' }, { status: 400 })
  }

  // Get product for price calculation
  const { data: product } = await supabaseAdmin
    .from('products').select('*').eq('id', product_id).single()

  if (!product) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 })

  const classifiedRiders = riders.map((r: any) => ({
    name: sanitizeName(r.name) || 'Onbekend',
    age: r.age || 0,
    weight: r.weight || 0,
    experience: r.experience || 'onbekend',
    type: (r.weight && r.weight <= product.max_weight_child) ? 'child' : 'adult',
  }))

  const numAdults = classifiedRiders.filter(r => r.type === 'adult').length
  const numChildren = classifiedRiders.filter(r => r.type === 'child').length
  const totalAmount = product.price * classifiedRiders.length

  // Use atomic function for offline bookings too (prevents overbooking)
  const { data: atomicResult, error: atomicError } = await supabaseAdmin.rpc('create_reservation_atomic', {
    p_product_id: product_id,
    p_date: date,
    p_time_slot: time_slot || null,
    p_status: 'offline',
    p_riders: classifiedRiders,
    p_num_adults: numAdults,
    p_num_children: numChildren,
    p_contact_name: sanitizeName(contact_name) || classifiedRiders[0]?.name || '',
    p_contact_email: contact_email || 'offline@stalflorida.nl',
    p_contact_phone: contact_phone ? sanitizeString(contact_phone) : null,
    p_total_amount: totalAmount,
    p_expires_at: null,
  })

  if (atomicError) {
    const msg = atomicError.message || ''
    if (msg.includes('Niet genoeg plekken') || msg.includes('niet beschikbaar')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: atomicError.message }, { status: 500 })
  }

  return NextResponse.json({ id: atomicResult, status: 'offline' })
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id || !isValidUUID(id)) return NextResponse.json({ error: 'Geldig ID is verplicht' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'confirmed', 'offline'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cancelled: true })
}
