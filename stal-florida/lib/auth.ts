import { NextRequest, NextResponse } from 'next/server'

export function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  return token === process.env.ADMIN_PASSWORD
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Niet geautoriseerd' },
    { status: 401 }
  )
}
