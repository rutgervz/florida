import { NextRequest, NextResponse } from 'next/server'
import { getAvailability, getAvailabilityRange } from '@/lib/availability'
import { isValidUUID, isValidDate, isValidDateRange } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const date = searchParams.get('date')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  try {
    // Single date query
    if (productId && date) {
      if (!isValidUUID(productId) || !isValidDate(date)) {
        return NextResponse.json({ error: 'Ongeldige parameters' }, { status: 400 })
      }
      const availability = await getAvailability(productId, date)
      return NextResponse.json(availability)
    }

    // Date range query (for calendar view)
    if (startDate && endDate) {
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return NextResponse.json({ error: 'Ongeldige datums' }, { status: 400 })
      }
      if (!isValidDateRange(startDate, endDate)) {
        return NextResponse.json({ error: 'Datumbereik te groot (max 62 dagen)' }, { status: 400 })
      }
      if (productId && !isValidUUID(productId)) {
        return NextResponse.json({ error: 'Ongeldig product ID' }, { status: 400 })
      }

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
