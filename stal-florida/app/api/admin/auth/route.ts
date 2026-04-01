import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { verifyPassword, createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
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

  if (verifyPassword(password)) {
    const token = createSession()
    return NextResponse.json({ token })
  }

  return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 })
}
