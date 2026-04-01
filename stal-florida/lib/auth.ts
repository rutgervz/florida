import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual, randomUUID } from 'crypto'

// In-memory session store (cleared on redeploy, which is acceptable)
const sessions = new Map<string, number>()
const SESSION_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now()
  sessions.forEach((expiresAt, token) => {
    if (expiresAt < now) sessions.delete(token)
  })
}, 10 * 60 * 1000)

export function createSession(): string {
  const token = randomUUID()
  sessions.set(token, Date.now() + SESSION_TTL)
  return token
}

export function isValidSession(token: string): boolean {
  if (!token || typeof token !== 'string') return false
  const expiresAt = sessions.get(token)
  if (!expiresAt) return false
  if (expiresAt < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

export function verifyPassword(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password || !input) return false
  if (input.length !== password.length) return false
  try {
    return timingSafeEqual(Buffer.from(input), Buffer.from(password))
  } catch {
    return false
  }
}

export function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  return isValidSession(token)
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Niet geautoriseerd' },
    { status: 401 }
  )
}
