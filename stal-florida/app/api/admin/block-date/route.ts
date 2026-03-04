import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID, isValidDate, sanitizeString } from '@/lib/validation'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .select('*, products(name, icon)')
    .order('date')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { date, product_id, reason } = body

  if (!date || !isValidDate(date)) {
    return NextResponse.json({ error: 'Geldige datum is verplicht' }, { status: 400 })
  }

  if (product_id && !isValidUUID(product_id)) {
    return NextResponse.json({ error: 'Ongeldig product ID' }, { status: 400 })
  }

  const safeReason = reason ? sanitizeString(reason) : null

  const { data, error } = await supabaseAdmin
    .from('blocked_dates')
    .insert({
      date,
      product_id: product_id || null,
      reason: safeReason,
    })
    .select()
    .single()

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

  const { error } = await supabaseAdmin
    .from('blocked_dates')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
