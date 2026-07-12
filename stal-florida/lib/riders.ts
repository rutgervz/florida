import { Rider } from './types'

// The riders column is jsonb (an array). Historically some rows were written as a
// JSON-encoded string instead of an array, so any code reading riders must tolerate
// both shapes. Always route reads through this helper.
export function parseRiders(riders: unknown): Rider[] {
  if (Array.isArray(riders)) return riders as Rider[]
  if (typeof riders === 'string') {
    try {
      const parsed = JSON.parse(riders)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
