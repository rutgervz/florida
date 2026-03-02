import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'

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

  if (status) {
    query = query.eq('status', status)
  } else {
    query = query.in('status', ['pending', 'confirmed'])
  }

  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)

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

  if (!id) {
    return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cancelled: true })
}
```

Dan het admin paneel updaten. Open `stal-florida/app/admin/page.tsx` en zoek dit blok (rond regel 240, in de bookings tab):
```
<div className="mt-1 text-xs text-gray-400">
  {b.contact_email} · {b.contact_phone}
</div>
```

Vervang dat door:
```
<div className="mt-1 text-xs text-gray-400 flex justify-between items-center">
  <span>{b.contact_email} · {b.contact_phone}</span>
  <button
    onClick={async () => {
      if (confirm('Weet je zeker dat je deze reservering wilt annuleren?')) {
        await fetch('/api/admin/bookings?id=' + b.id, { method: 'DELETE', headers: authHeaders() })
        loadBookings()
        loadAvailability()
      }
    }}
    className="text-red-400 hover:text-red-600 ml-4"
  >
    Annuleren
  </button>
</div>
