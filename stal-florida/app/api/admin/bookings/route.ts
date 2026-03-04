import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID, isValidDate } from '@/lib/validation'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  let query = supabaseAdmin
    .from('reservations')
    .select('*, products(name, icon, start_time, arrive_time)')
    .order('date', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) {
    const validStatuses = ['pending', 'confirmed', 'expired', 'cancelled']
    if (validStatuses.includes(status)) {
      query = query.eq('status', status)
    }
  } else {
    query = query.in('status', ['pending', 'confirmed'])
  }

  if (startDate && isValidDate(startDate)) query = query.gte('date', startDate)
  if (endDate && isValidDate(endDate)) query = query.lte('date', endDate)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'Geldig ID is verplicht' }, { status: 400 })
  }

  // Only cancel, never hard delete (audit trail)
  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'confirmed']) // can only cancel active reservations

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cancelled: true })
}
