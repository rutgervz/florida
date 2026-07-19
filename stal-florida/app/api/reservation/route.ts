import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isValidUUID } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'Ongeldige reservering' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('id, date, time_slot, status, riders, total_amount, products(name, icon, start_time, arrive_time, duration_minutes)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Reservering niet gevonden' }, { status: 404 })
  }

  // Expired en cancelled moeten wel terugkomen: de bevestigingspagina toont daarop
  // de "Betaling niet gelukt" stand. Contactgegevens worden hieronder al weggelaten.
  if (!['confirmed', 'offline', 'pending', 'expired', 'cancelled'].includes(data.status)) {
    return NextResponse.json({ error: 'Reservering niet gevonden' }, { status: 404 })
  }

  // Don't expose contact info via this endpoint
  return NextResponse.json(data)
}
