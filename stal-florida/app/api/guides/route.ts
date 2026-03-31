import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isValidUUID } from '@/lib/validation'

// GET: list active guides, or upcoming rides with assignments
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // List active guides
  if (action === 'list') {
    const { data, error } = await supabaseAdmin
      .from('guides').select('id, name').eq('active', true).order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Get upcoming rides with assignments for a specific guide
  const guideId = searchParams.get('guide_id')
  if (!guideId || !isValidUUID(guideId)) {
    return NextResponse.json({ error: 'guide_id is verplicht' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]
  const twoWeeks = new Date()
  twoWeeks.setDate(twoWeeks.getDate() + 14)
  const endDate = twoWeeks.toISOString().split('T')[0]

  // Get all confirmed/offline rides in the next 2 weeks
  const { data: rides } = await supabaseAdmin
    .from('reservations')
    .select('id, product_id, date, time_slot, riders, num_adults, num_children, products(name, icon, start_time, duration_minutes)')
    .gte('date', today).lte('date', endDate)
    .in('status', ['confirmed', 'offline'])
    .order('date').order('time_slot')

  // Get all assignments for this guide
  const { data: assignments } = await supabaseAdmin
    .from('guide_assignments')
    .select('reservation_id')
    .eq('guide_id', guideId)

  const assignedIds = new Set((assignments || []).map(a => a.reservation_id))

  // Get all assignments for all guides (to show who else is signed up)
  const reservationIds = (rides || []).map(r => r.id)
  let allAssignments: any[] = []
  if (reservationIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('guide_assignments')
      .select('reservation_id, guides(name)')
      .in('reservation_id', reservationIds)
    allAssignments = data || []
  }

  const ridesWithStatus = (rides || []).map(r => ({
    ...r,
    assigned: assignedIds.has(r.id),
    all_guides: allAssignments
      .filter(a => a.reservation_id === r.id)
      .map(a => a.guides?.name || 'Onbekend'),
  }))

  return NextResponse.json(ridesWithStatus)
}

// POST: assign guide to a ride
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { guide_id, reservation_id } = body

  if (!isValidUUID(guide_id) || !isValidUUID(reservation_id)) {
    return NextResponse.json({ error: 'Ongeldige IDs' }, { status: 400 })
  }

  // Verify guide exists and is active
  const { data: guide } = await supabaseAdmin
    .from('guides').select('id').eq('id', guide_id).eq('active', true).single()
  if (!guide) return NextResponse.json({ error: 'Begeleider niet gevonden' }, { status: 404 })

  // Check how many guides are already assigned
  const { data: existing } = await supabaseAdmin
    .from('guide_assignments').select('id').eq('reservation_id', reservation_id)
  if (existing && existing.length >= 2) {
    return NextResponse.json({ error: 'Er zijn al 2 begeleiders ingeschreven' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('guide_assignments').insert({ guide_id, reservation_id })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Je bent al ingeschreven' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assigned: true })
}

// DELETE: unassign guide from a ride
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const guideId = searchParams.get('guide_id')
  const reservationId = searchParams.get('reservation_id')

  if (!guideId || !reservationId || !isValidUUID(guideId) || !isValidUUID(reservationId)) {
    return NextResponse.json({ error: 'Ongeldige IDs' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('guide_assignments').delete()
    .eq('guide_id', guideId).eq('reservation_id', reservationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ removed: true })
}
