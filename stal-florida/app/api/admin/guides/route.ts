import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'
import { isValidUUID, sanitizeName, sanitizeString } from '@/lib/validation'

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { data, error } = await supabaseAdmin
    .from('guides').select('*').order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const name = sanitizeName(body.name)
  const phone = sanitizeString(body.phone)

  if (!name || name.length < 2) return NextResponse.json({ error: 'Naam is verplicht (min. 2 tekens)' }, { status: 400 })
  if (!phone || phone.length < 6) return NextResponse.json({ error: 'Telefoonnummer is verplicht' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('guides').insert({ name, phone }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { id, ...updates } = body

  if (!id || !isValidUUID(id)) return NextResponse.json({ error: 'Geldig ID is verplicht' }, { status: 400 })

  if (updates.name) updates.name = sanitizeName(updates.name)
  if (updates.phone) updates.phone = sanitizeString(updates.phone)

  const { data, error } = await supabaseAdmin
    .from('guides').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id || !isValidUUID(id)) return NextResponse.json({ error: 'Geldig ID is verplicht' }, { status: 400 })

  // Soft delete: deactivate instead of removing
  const { error } = await supabaseAdmin
    .from('guides').update({ active: false }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deactivated: true })
}
