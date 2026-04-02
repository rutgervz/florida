'use client'

import { useState, useEffect } from 'react'

interface Guide { id: string; name: string }
interface Ride {
  product_id: string; date: string; time_slot: string | null
  product_name: string; product_icon: string; start_time: string; duration: number
  rider_count: number; assigned: boolean; all_guides: string[]
}

export default function BegeleidersPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null)
  const [rides, setRides] = useState<Ride[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mine' | 'open'>('all')

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
      const params = 'guide_id=' + selectedGuide!.id + '&product_id=' + ride.product_id + '&date=' + ride.date + (ride.time_slot ? '&time_slot=' + ride.time_slot : '')
      await fetch('/api/guides?' + params, { method: 'DELETE' })
    } else {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide_id: selectedGuide!.id, product_id: ride.product_id, date: ride.date, time_slot: ride.time_slot }),
      })
      if (!res.ok) { const data = await res.json(); alert(data.error || 'Kon niet inschrijven'); return }
    }
    loadRides()
  }

  const filteredRides = rides.filter(r => {
    if (filter === 'mine') return r.assigned
    if (filter === 'open') return r.all_guides.length === 0
    return true
  })

  const ridesByDate: Record<string, Ride[]> = {}
  filteredRides.forEach(r => {
    if (!ridesByDate[r.date]) ridesByDate[r.date] = []
    ridesByDate[r.date].push(r)
  })

  if (!selectedGuide) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-gray-900 text-white px-6 py-4">
          <div className="max-w-2xl mx-auto"><span className="font-serif text-lg">Stal Florida — Begeleiders</span></div>
        </nav>
        <main className="max-w-2xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-serif mb-2">Welkom</h1>
          <p className="text-gray-500 mb-6">Kies je naam om ritten te bekijken en je in te schrijven.</p>
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
        <p className="text-gray-500 mb-4">Seizoen april t/m oktober. Klik om je in of uit te schrijven.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setFilter('all')} className={'px-3 py-1.5 rounded-lg text-sm font-medium ' + (filter === 'all' ? 'bg-cyan-700 text-white' : 'bg-white text-gray-500 shadow-sm')}>
            Alle ritten ({rides.length})
          </button>
          <button onClick={() => setFilter('mine')} className={'px-3 py-1.5 rounded-lg text-sm font-medium ' + (filter === 'mine' ? 'bg-cyan-700 text-white' : 'bg-white text-gray-500 shadow-sm')}>
            Mijn ritten ({rides.filter(r => r.assigned).length})
          </button>
          <button onClick={() => setFilter('open')} className={'px-3 py-1.5 rounded-lg text-sm font-medium ' + (filter === 'open' ? 'bg-cyan-700 text-white' : 'bg-white text-gray-500 shadow-sm')}>
            Zonder begeleider ({rides.filter(r => r.all_guides.length === 0).length})
          </button>
        </div>

        {loading && <p className="text-gray-400">Laden...</p>}

        {!loading && filteredRides.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center">
            {filter === 'mine' ? 'Je hebt je nog niet ingeschreven voor ritten' : filter === 'open' ? 'Alle ritten hebben een begeleider' : 'Geen ritten gevonden'}
          </div>
        )}

        {Object.entries(ridesByDate).map(([date, dayRides]) => (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-bold text-gray-400 tracking-wider mb-2">
              {new Date(date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
            </h2>
            <div className="space-y-2">
              {dayRides.map(ride => {
                const time = ride.time_slot || ride.start_time
                const otherGuides = ride.all_guides.filter(g => g !== selectedGuide.name)
                const guideCount = ride.all_guides.length

                return (
                  <div key={ride.product_id + ride.date + (ride.time_slot || '')}
                    onClick={() => toggleAssignment(ride)}
                    className={'rounded-xl p-4 cursor-pointer transition-all border-2 ' +
                      (ride.assigned
                        ? 'bg-green-50 border-green-400 shadow-sm'
                        : guideCount === 0
                          ? 'bg-white border-red-200 shadow-sm hover:border-red-300'
                          : 'bg-white border-transparent shadow-sm hover:border-gray-200')
                    }>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{ride.product_icon} {ride.product_name}</span>
                        <span className="text-gray-400 text-sm ml-2">{time} — {ride.duration} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ride.assigned && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">Ingeschreven</span>}
                        {!ride.assigned && guideCount === 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Geen begeleider</span>}
                        {!ride.assigned && guideCount > 0 && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{guideCount}/2</span>}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {ride.rider_count} ruiter{ride.rider_count !== 1 ? 's' : ''} geboekt
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
