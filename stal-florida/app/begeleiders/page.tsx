'use client'

import { useState, useEffect } from 'react'

interface Guide { id: string; name: string }
interface Ride {
  id: string; date: string; time_slot: string | null
  riders: any[]; num_adults: number; num_children: number
  products: { name: string; icon: string; start_time: string; duration_minutes: number }
  assigned: boolean; all_guides: string[]
}

export default function BegeleidersPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null)
  const [rides, setRides] = useState<Ride[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/guides?action=list').then(r => r.json()).then(setGuides).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedGuide) return
    loadRides()
  }, [selectedGuide])

  function loadRides() {
    if (!selectedGuide) return
    setLoading(true)
    fetch('/api/guides?guide_id=' + selectedGuide.id)
      .then(r => r.json())
      .then(data => { setRides(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function toggleAssignment(ride: Ride) {
    if (ride.assigned) {
      await fetch('/api/guides?guide_id=' + selectedGuide!.id + '&reservation_id=' + ride.id, { method: 'DELETE' })
    } else {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide_id: selectedGuide!.id, reservation_id: ride.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kon niet inschrijven')
        return
      }
    }
    loadRides()
  }

  // Group rides by date
  const ridesByDate: Record<string, Ride[]> = {}
  rides.forEach(r => {
    if (!ridesByDate[r.date]) ridesByDate[r.date] = []
    ridesByDate[r.date].push(r)
  })

  if (!selectedGuide) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-gray-900 text-white px-6 py-4">
          <div className="max-w-2xl mx-auto"><span className="font-serif text-lg">Stal Florida - Begeleiders</span></div>
        </nav>
        <main className="max-w-2xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-serif mb-2">Welkom</h1>
          <p className="text-gray-500 mb-6">Kies je naam om je ritten te bekijken en in te schrijven.</p>
          <div className="space-y-3">
            {guides.map(g => (
              <button key={g.id} onClick={() => setSelectedGuide(g)}
                className="w-full bg-white rounded-xl shadow-sm p-5 text-left hover:shadow-md transition-shadow">
                <span className="text-lg font-serif">{g.name}</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-4">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <span className="font-serif text-lg">Stal Florida</span>
          <button onClick={() => { setSelectedGuide(null); setRides([]) }} className="text-sm text-gray-400 hover:text-white">
            Wissel begeleider
          </button>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-serif mb-1">Hoi {selectedGuide.name}</h1>
        <p className="text-gray-500 mb-6">Komende 2 weken. Klik om je in of uit te schrijven.</p>

        {loading && <p className="text-gray-400">Laden...</p>}

        {!loading && rides.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center">
            Geen ritten de komende 2 weken
          </div>
        )}

        {Object.entries(ridesByDate).map(([date, dayRides]) => (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-bold text-gray-400 tracking-wider mb-2">
              {new Date(date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
            </h2>
            <div className="space-y-2">
              {dayRides.map(ride => {
                const time = ride.time_slot ? ride.time_slot.substring(0, 5) : (ride.products?.start_time ? ride.products.start_time.substring(0, 5) : '')
                const riderCount = ride.riders?.length || 0
                const guideCount = ride.all_guides.length
                const otherGuides = ride.all_guides.filter(g => g !== selectedGuide.name)

                return (
                  <div key={ride.id}
                    onClick={() => toggleAssignment(ride)}
                    className={'rounded-xl p-4 cursor-pointer transition-all border-2 ' +
                      (ride.assigned
                        ? 'bg-green-50 border-green-400 shadow-sm'
                        : 'bg-white border-transparent shadow-sm hover:border-gray-200')
                    }>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{ride.products?.icon} {ride.products?.name}</span>
                        <span className="text-gray-400 text-sm ml-2">{time} - {ride.products?.duration_minutes} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ride.assigned && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">Ingeschreven</span>}
                        {guideCount > 0 && !ride.assigned && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{guideCount}/2</span>}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {riderCount} ruiter{riderCount !== 1 ? 's' : ''}
                      {otherGuides.length > 0 && <span className="ml-2 text-gray-400">ook: {otherGuides.join(', ')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
