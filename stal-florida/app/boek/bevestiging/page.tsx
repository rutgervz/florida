'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface ReservationData {
  id: string
  status: string
  date: string
  riders: any[]
  total_amount: number
  contact_email: string
  products: {
    name: string
    icon: string
    start_time: string
    arrive_time: string
    duration_minutes: number
  }
}

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('id')
  const [reservation, setReservation] = useState<ReservationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (!reservationId) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return

    // Poll for status updates (Mollie webhook may take a moment)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/reservations?id=eq.${reservationId}&select=*,products(name,icon,start_time,arrive_time,duration_minutes)`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
        )
        const data = await res.json()
        if (data?.[0]) {
          setReservation(data[0])
          setLoading(false)
          if (data[0].status === 'confirmed' || data[0].status === 'expired') {
            setPolling(false)
            clearInterval(interval)
          }
        }
      } catch (err) {
        console.error(err)
      }
    }, 2000)

    // Stop polling after 60 seconds
    setTimeout(() => {
      setPolling(false)
      clearInterval(interval)
    }, 60000)

    return () => clearInterval(interval)
  }, [reservationId])

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🐴</div>
          <p className="text-gray-500">Betaling wordt verwerkt...</p>
        </div>
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Reservering niet gevonden.</p>
        </div>
      </div>
    )
  }

  const isConfirmed = reservation.status === 'confirmed'
  const product = reservation.products

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-gray-900 text-white px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <span className="font-serif text-lg">🐴 Stal Florida</span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12 text-center">
        {isConfirmed ? (
          <>
            <div className="text-5xl mb-4">🐴</div>
            <h1 className="text-3xl font-serif mb-2">Reservering bevestigd!</h1>
            <p className="text-gray-500 mb-8">Een bevestigingsmail is verstuurd naar {reservation.contact_email}</p>

            <div className="bg-ocean-light rounded-xl p-6 text-left">
              <h2 className="text-xl font-serif mb-1">{product.icon} {product.name}</h2>
              <p className="text-gray-500 mb-2">
                {new Date(reservation.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-ocean font-medium mb-4">
                Starttijd: {product.start_time?.substring(0, 5)} · Aanwezig om {product.arrive_time?.substring(0, 5) || product.start_time?.substring(0, 5)}
              </p>

              <div className="border-t border-cyan-200 pt-3 mb-3">
                {reservation.riders.map((r: any, i: number) => (
                  <p key={i} className="text-gray-600 text-sm py-1">
                    {r.name} · {r.age} jr · {r.weight} kg · {r.type === 'adult' ? 'Volwassene' : 'Kind'}
                  </p>
                ))}
              </div>

              <div className="border-t border-cyan-200 pt-3 flex justify-between">
                <span className="text-gray-500">Totaal betaald</span>
                <span className="text-xl font-serif">€{parseFloat(reservation.total_amount as any).toFixed(0)}</span>
              </div>
            </div>

            <div className="mt-6 text-sm text-gray-400">
              <p>📍 Reddingsweg 38, Schiermonnikoog</p>
              <p>📞 06 41 91 87 02</p>
            </div>
          </>
        ) : reservation.status === 'pending' ? (
          <>
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="text-3xl font-serif mb-2">Betaling wordt verwerkt</h1>
            <p className="text-gray-500">Even geduld, we wachten op bevestiging van de betaling...</p>
            {polling && <p className="text-sm text-gray-400 mt-4">Dit kan een paar seconden duren.</p>}
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-3xl font-serif mb-2">Betaling niet gelukt</h1>
            <p className="text-gray-500 mb-6">De betaling is niet voltooid. Je kunt het opnieuw proberen.</p>
            <a href="/boek" className="px-6 py-3 bg-ocean text-white rounded-xl font-medium">
              Opnieuw boeken
            </a>
          </>
        )}
      </main>
    </div>
  )
}
