import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Public endpoint: returns only the terms-and-conditions text. The admin settings
// endpoint requires auth, so the public terms page reads from here instead.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('settings').select('value').eq('key', 'voorwaarden').maybeSingle()

  if (error) return NextResponse.json({ voorwaarden: '' }, { status: 500 })
  return NextResponse.json({ voorwaarden: data?.value || '' })
}
