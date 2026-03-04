import createMollieClient from '@mollie/api-client'

export function getMollieClient() {
  const isLive = process.env.MOLLIE_LIVE === 'true'
  const apiKey = isLive
    ? process.env.MOLLIE_API_KEY!
    : process.env.MOLLIE_TEST_API_KEY!

  return createMollieClient({ apiKey })
}
