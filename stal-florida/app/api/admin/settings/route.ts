import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin, unauthorizedResponse } from '@/lib/auth'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('settings').select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, string> = {}
  if (data) data.forEach(s => { settings[s.key] = s.value })
  return NextResponse.json(settings)
}

export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) return unauthorizedResponse()

  const body = await request.json()
  const { key, value } = body

  if (!key || typeof key !== 'string' || typeof value !== 'string') {
    return NextResponse.json({ error: 'Key en value zijn verplicht' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true })
}
