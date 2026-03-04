// Input validation and sanitization

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[0-9+\-\s()]{6,20}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MAX_NAME_LENGTH = 100
const MAX_RIDERS = 6
const MAX_DATE_RANGE_DAYS = 62

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.trim().substring(0, 200)
}

export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .trim()
    .substring(0, MAX_NAME_LENGTH)
    .replace(/[<>"'&]/g, '') // strip HTML-sensitive chars
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false
  return EMAIL_REGEX.test(email) && email.length <= 254
}

export function isValidPhone(phone: unknown): boolean {
  if (typeof phone !== 'string') return false
  if (phone.length === 0) return true // phone is optional
  return PHONE_REGEX.test(phone)
}

export function isValidUUID(id: unknown): boolean {
  if (typeof id !== 'string') return false
  return UUID_REGEX.test(id)
}

export function isValidDate(date: unknown): boolean {
  if (typeof date !== 'string') return false
  if (!DATE_REGEX.test(date)) return false
  const d = new Date(date)
  return !isNaN(d.getTime())
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return false
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= MAX_DATE_RANGE_DAYS
}

export function isPositiveInteger(val: unknown): boolean {
  if (typeof val !== 'number') return false
  return Number.isInteger(val) && val > 0
}

export function validateRiderInput(rider: any, minAge: number, maxWeight: number): string | null {
  if (!rider || typeof rider !== 'object') return 'Ongeldige ruiter data'

  const name = sanitizeName(rider.name)
  if (!name || name.length < 2) return 'Naam is te kort (min. 2 tekens)'

  if (typeof rider.age !== 'number' || rider.age < minAge || rider.age > 120) {
    return 'Ongeldige leeftijd (min. ' + minAge + ', max. 120)'
  }

  if (typeof rider.weight !== 'number' || rider.weight < 15 || rider.weight > maxWeight) {
    return 'Ongeldig gewicht (min. 15kg, max. ' + maxWeight + 'kg)'
  }

  const validExperiences = ['beginner', 'gevorderd', 'ervaren']
  if (!validExperiences.includes(rider.experience)) {
    return 'Kies een geldige ervaring'
  }

  return null // valid
}

// Maps experience level to which gaits the rider can do
const EXPERIENCE_GAITS: Record<string, string[]> = {
  beginner: ['stap'],
  gevorderd: ['stap', 'draf'],
  ervaren: ['stap', 'draf', 'galop'],
}

export function getExperienceGaits(experience: string): string[] {
  return EXPERIENCE_GAITS[experience] || []
}

export function isExperienceSufficient(experience: string, requiredGaits: string[]): boolean {
  const riderGaits = getExperienceGaits(experience)
  return requiredGaits.every(gait => riderGaits.includes(gait))
}

export function getMinimumExperience(requiredGaits: string[]): string {
  if (requiredGaits.includes('galop')) return 'ervaren'
  if (requiredGaits.includes('draf')) return 'gevorderd'
  return 'beginner'
}

export { MAX_RIDERS, MAX_DATE_RANGE_DAYS }
