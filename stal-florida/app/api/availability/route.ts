import { NextRequest, NextResponse } from 'next/server'
import { getAvailability, getAvailabilityRange } from '@/lib/availability'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const date = searchParams.get('date')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  try {
    // Single date query
    if (productId && date) {
      const availability = await getAvailability(productId, date)
      return NextResponse.json(availability)
    }

    // Date range query (for calendar view)
    if (startDate && endDate) {
      const availability = await getAvailabilityRange(
        startDate,
        endDate,
        productId || undefined
      )
      return NextResponse.json(availability)
    }

    return NextResponse.json(
      { error: 'Geef product_id + date, of start_date + end_date mee' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Availability error:', error)
    return NextResponse.json(
      { error: 'Er ging iets mis bij het ophalen van beschikbaarheid' },
      { status: 500 }
    )
  }
}
