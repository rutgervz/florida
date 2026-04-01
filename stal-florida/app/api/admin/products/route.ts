import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

const ALLOWED_PRODUCT_FIELDS = ['name', 'icon', 'price', 'description', 'duration_minutes', 'start_time', 'arrive_time', 'min_age', 'max_age', 'max_weight_adult', 'max_weight_child', 'slots_total', 'slots_adult', 'slots_child', 'required_gaits', 'available_days', 'time_slots', 'warning', 'active', 'sort_order', 'accent']

function pickAllowed(body: any) {
  const clean: any = {}
  ALLOWED_PRODUCT_FIELDS.forEach(f => { if (body[f] !== undefined) clean[f] = body[f] })
  return clean
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })
  }

  if (!body.price || typeof body.price !== 'number' || body.price <= 0) {
    return NextResponse.json({ error: 'Prijs moet groter dan 0 zijn' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert(pickAllowed(body))
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { id } = body

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'Geldig product ID is verplicht' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(pickAllowed(body))
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
