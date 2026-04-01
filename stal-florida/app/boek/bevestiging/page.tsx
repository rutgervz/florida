'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('id')
  const [reservation, setReservation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (!reservationId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/reservation?id=' + reservationId)
        if (!res.ok) return
        const data = await res.json()
        if (data && data.id) {
          setReservation(data)
          setLoading(false)
          if (data.status === 'confirmed' || data.status === 'expired') {
            setPolling(false); clearInterval(interval)
          }
        }
      } catch (err) { console.error(err) }
    }, 2000)
    setTimeout(() => { setPolling(false); clearInterval(interval) }, 60000)
    return () => clearInterval(interval)
  }, [reservationId])

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><p className="text-gray-500">Betaling wordt verwerkt...</p></div>
  if (!reservation) return <div className="min-h-screen bg-cream flex items-center justify-center"><p className="text-gray-500">Reservering niet gevonden.</p></div>

  const isConfirmed = reservation.status === 'confirmed'
  const product = reservation.products
  const displayTime = reservation.time_slot ? reservation.time_slot.substring(0, 5) : (product.start_time ? product.start_time.substring(0, 5) : '')
  const arriveTime = reservation.time_slot
    ? (() => { const [h, m] = reservation.time_slot.substring(0, 5).split(':').map(Number); const t = h * 60 + m - 15; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') })()
    : (product.arrive_time ? product.arrive_time.substring(0, 5) : displayTime)

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-gray-900 text-white px-6 py-4"><div className="max-w-4xl mx-auto"><span className="font-serif text-lg">Stal Florida</span></div></nav>
      <main className="max-w-2xl mx-auto px-6 py-12 text-center">
        {isConfirmed ? (
          <div>
            <h1 className="text-3xl font-serif mb-2">Reservering bevestigd!</h1>
            <p className="text-gray-500 mb-8">Een bevestigingsmail is verstuurd.</p>
            <div className="bg-blue-50 rounded-xl p-6 text-left">
              <h2 className="text-xl font-serif mb-1">{product.icon} {product.name}</h2>
              <p className="text-gray-500 mb-2">{new Date(reservation.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="text-cyan-700 font-medium mb-4">Starttijd: {displayTime} - Aanwezig om {arriveTime}</p>
              <div className="border-t border-cyan-200 pt-3 mb-3">
                {reservation.riders.map((r: any, i: number) => <p key={i} className="text-gray-600 text-sm py-1">{r.name} - {r.age} jr - {r.weight} kg</p>)}
              </div>
              <div className="border-t border-cyan-200 pt-3 flex justify-between">
                <span className="text-gray-500">Totaal betaald</span>
                <span className="text-xl font-serif">EUR {parseFloat(String(reservation.total_amount)).toFixed(0)}</span>
              </div>
            </div>
            <div className="mt-6 text-sm text-gray-400"><p>Reddingsweg 38, Schiermonnikoog</p><p>06 41 91 87 02</p></div>
          </div>
        ) : reservation.status === 'pending' ? (
          <div>
            <h1 className="text-3xl font-serif mb-2">Betaling wordt verwerkt</h1>
            <p className="text-gray-500">Even geduld, we wachten op bevestiging van de betaling...</p>
            {polling && <p className="text-sm text-gray-400 mt-4">Dit kan een paar seconden duren.</p>}
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-serif mb-2">Betaling niet gelukt</h1>
            <p className="text-gray-500 mb-6">De betaling is niet voltooid. Je kunt het opnieuw proberen.</p>
            <a href="/boek" className="px-6 py-3 bg-cyan-700 text-white rounded-xl font-medium">Opnieuw boeken</a>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><p className="text-gray-500">Laden...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  )
}
