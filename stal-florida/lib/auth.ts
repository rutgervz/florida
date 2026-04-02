import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  const password = process.env.ADMIN_PASSWORD
  if (!password || !token) return false

  return safeCompare(token, password)
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Niet geautoriseerd' },
    { status: 401 }
  )
}
