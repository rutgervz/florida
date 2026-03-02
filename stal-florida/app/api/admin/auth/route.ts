import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (password === process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ token: process.env.ADMIN_PASSWORD })
  }

  return NextResponse.json(
    { error: 'Onjuist wachtwoord' },
    { status: 401 }
  )
}
