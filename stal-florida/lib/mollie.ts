import createMollieClient from '@mollie/api-client'

export function getMollieClient() {
  // The Mollie key prefix (test_ / live_) already encodes the environment, so the
  // documented setup is a single MOLLIE_API_KEY per Vercel environment. We still honour
  // the older MOLLIE_LIVE + MOLLIE_TEST_API_KEY scheme as a fallback so the client works
  // regardless of which convention an environment is configured with.
  const isLive = process.env.MOLLIE_LIVE === 'true'
  const apiKey = isLive
    ? process.env.MOLLIE_API_KEY
    : (process.env.MOLLIE_TEST_API_KEY || process.env.MOLLIE_API_KEY)

  if (!apiKey) {
    throw new Error('Mollie API key ontbreekt: stel MOLLIE_API_KEY in (of MOLLIE_TEST_API_KEY).')
  }

  return createMollieClient({ apiKey })
}
