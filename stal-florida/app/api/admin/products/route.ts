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

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()

  // Basic validation for required fields
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })
  }

  if (!body.price || typeof body.price !== 'number' || body.price <= 0) {
    return NextResponse.json({ error: 'Prijs moet groter dan 0 zijn' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert(body)
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
  const { id, ...updates } = body

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: 'Geldig product ID is verplicht' }, { status: 400 })
  }

  // Don't allow updating the id itself
  delete (updates as any).id
  delete (updates as any).created_at

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
