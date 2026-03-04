import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Rate limit: max 5 login attempts per minute
  const ip = getClientIp(request)
  const { allowed } = rateLimit('login:' + ip, 5, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Te veel inlogpogingen. Probeer het later opnieuw.' },
      { status: 429 }
    )
  }

  const { password } = await request.json()

  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return NextResponse.json({ error: 'Ongeldig wachtwoord' }, { status: 400 })
  }

  if (password === process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ token: process.env.ADMIN_PASSWORD })
  }

  return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 })
}
