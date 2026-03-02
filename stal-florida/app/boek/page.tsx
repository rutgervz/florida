'use client'

import { useState, useEffect } from 'react'
import type { Product, Rider, Availability } from '@/lib/types'

// ── Gradient configs ──
const gradients: Record<string, string> = {
  ocean: 'from-cyan-700 to-blue-800',
  forest: 'from-green-700 to-emerald-900',
  sunset: 'from-orange-600 to-red-800',
  sand: 'from-amber-600 to-yellow-800',
  night: 'from-gray-700 to-gray-900',
}

export default function BookingPage() {
  const [step, setStep] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [riders, setRiders] = useState<Rider[]>([])
  const [availability, setAvailability] = useState<Record<string, Availability>>({})
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  // Load products
  useEffect(() => {
    fetch('/api/availability?start_date=2000-01-01&end_date=2000-01-01')
    // Load products from public Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey) {
      fetch(`${supabaseUrl}/rest/v1/products?active=eq.true&order=sort_order`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
        .then(r => r.json())
        .then(setProducts)
        .catch(console.error)
    }
  }, [])

  // Load availability when product or month changes
  useEffect(() => {
    if (!selectedProduct) return
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0)
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]

    fetch(`/api/availability?product_id=${selectedProduct.id}&start_date=${startStr}&end_date=${endStr}`)
      .then(r => r.json())
      .then(data => {
        if (data[selectedProduct.id]) {
          setAvailability(data[selectedProduct.id])
        }
      })
      .catch(console.error)
  }, [selectedProduct, calendarMonth])

  // ── Step 1: Choose ride ──
  function renderStep1() {
    return (
      <div>
        <h1 className="text-3xl mb-2">Kies je rit</h1>
        <p className="text-gray-500 mb-6">Selecteer hieronder de rit die je wilt boeken.</p>
        <div className="space-y-4">
          {products.map(product => (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md border-l-4"
              style={{ borderLeftColor: `#${product.accent}` }}
              onClick={() => {
                setSelectedProduct(product)
                setStep(2)
              }}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="text-xl font-serif">{product.icon} {product.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {product.duration_minutes} min · {product.start_time?.substring(0, 5)} · {product.required_gaits?.join(', ')} · Vanaf {product.min_age} jaar
                    </p>
                  </div>
                  <span className="text-2xl font-serif" style={{ color: `#${product.accent}` }}>
                    €{product.price}
                  </span>
                </div>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `#${product.accent}15`, color: `#${product.accent}` }}>
                    Max {product.slots_total} ruiters
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `#${product.accent}15`, color: `#${product.accent}` }}>
                    Max {product.slots_adult} volw. ({product.max_weight_child + 1}-{product.max_weight_adult}kg)
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `#${product.accent}15`, color: `#${product.accent}` }}>
                    Max {product.slots_child} kind. (≤{product.max_weight_child}kg)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 2: Choose date ──
  function renderStep2() {
    if (!selectedProduct) return null

    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1 // Monday = 0

    const days: (number | null)[] = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)

    const today = new Date().toISOString().split('T')[0]

    return (
      <div>
        <button onClick={() => { setStep(1); setSelectedProduct(null) }} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          ← Terug naar ritten
        </button>
        <h1 className="text-3xl mb-2">Kies je datum</h1>
        <p className="text-sm mb-6" style={{ color: `#${selectedProduct.accent}` }}>
          {selectedProduct.icon} {selectedProduct.name} · {selectedProduct.duration_minutes} min · {selectedProduct.start_time?.substring(0, 5)}
        </p>

        <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => setCalendarMonth(new Date(year, month - 1))} className="text-gray-400 hover:text-gray-700 text-xl">‹</button>
            <h3 className="text-lg font-serif">
              {calendarMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setCalendarMonth(new Date(year, month + 1))} className="text-gray-400 hover:text-gray-700 text-xl">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
              <div key={d} className={`text-xs font-bold py-2 ${d === 'Zo' ? 'text-red-300' : 'text-gray-400'}`}>{d}</div>
            ))}
            {days.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const avail = availability[dateStr]
              const isPast = dateStr < today
              const isSunday = (i % 7) === 6
              const isBlocked = !avail || avail.blocked || avail.total_available === 0
              const isSelected = dateStr === selectedDate
              const disabled = isPast || isSunday || isBlocked

              return (
                <button
                  key={dateStr}
                  disabled={disabled}
                  className={`py-2 rounded-lg text-sm ${
                    isSelected ? 'ring-2 ring-offset-1' : ''
                  } ${
                    disabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'hover:bg-gray-50 cursor-pointer'
                  }`}
                  style={isSelected ? { backgroundColor: `#${selectedProduct.accent}15`, ringColor: `#${selectedProduct.accent}` } : {}}
                  onClick={() => {
                    setSelectedDate(dateStr)
                    setRiders([])
                  }}
                >
                  <div className={`font-medium ${isSelected ? '' : ''}`} style={isSelected ? { color: `#${selectedProduct.accent}` } : {}}>
                    {day}
                  </div>
                  {!isPast && !isSunday && avail && !avail.blocked && (
                    <div className="text-[10px] text-gray-400">
                      {avail.adults_available}V {avail.children_available}K
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 text-xs text-gray-400 text-center">
            V = volwassenen ({selectedProduct.max_weight_child + 1}-{selectedProduct.max_weight_adult}kg) · K = kinderen (≤{selectedProduct.max_weight_child}kg) · Zo = gesloten
          </div>
        </div>

        {selectedDate && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setStep(3)}
              className="px-8 py-3 rounded-xl text-white font-medium shadow-sm"
              style={{ backgroundColor: `#${selectedProduct.accent}` }}
            >
              Verder met {new Date(selectedDate).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} →
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Step 3: Add riders ──
  function renderStep3() {
    if (!selectedProduct) return null
    const avail = availability[selectedDate]
    if (!avail) return null

    const currentAdults = riders.filter(r => r.type === 'adult').length
    const currentChildren = riders.filter(r => r.type === 'child').length

    function addRider() {
      setRiders([...riders, { name: '', age: 0, weight: 0, experience: '', type: 'adult' }])
    }

    function updateRider(index: number, field: keyof Rider, value: any) {
      const updated = [...riders]
      ;(updated[index] as any)[field] = value

      // Auto-classify by weight
      if (field === 'weight' && value > 0) {
        updated[index].type = value <= selectedProduct!.max_weight_child ? 'child' : 'adult'
      }

      setRiders(updated)
    }

    function removeRider(index: number) {
      setRiders(riders.filter((_, i) => i !== index))
    }

    const canAddMore = riders.length < avail.total_available

    return (
      <div>
        <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          ← Terug naar kalender
        </button>
        <h1 className="text-3xl mb-2">Ruiters invullen</h1>
        <p className="text-sm mb-6" style={{ color: `#${selectedProduct.accent}` }}>
          {selectedProduct.icon} {selectedProduct.name} · {new Date(selectedDate).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })} · {selectedProduct.start_time?.substring(0, 5)}
        </p>

        {/* Availability counters */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <div className="text-xs text-gray-400 font-medium">TOTAAL VRIJ</div>
            <div className="text-2xl font-serif">{avail.total_available - riders.length}</div>
            <div className="text-xs text-gray-400">van {selectedProduct.slots_total}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <div className="text-xs text-gray-400 font-medium">VOLWASSENEN</div>
            <div className="text-2xl font-serif text-warm">{avail.adults_available - currentAdults}</div>
            <div className="text-xs text-gray-400">vrij</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <div className="text-xs text-gray-400 font-medium">KINDEREN</div>
            <div className="text-2xl font-serif text-ocean">{avail.children_available - currentChildren}</div>
            <div className="text-xs text-gray-400">vrij</div>
          </div>
        </div>

        {/* Rider forms */}
        {riders.map((rider, i) => (
          <div key={i} className="bg-white rounded-xl p-5 shadow-sm mb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif text-lg">Ruiter {i + 1}</h3>
              <div className="flex items-center gap-3">
                {rider.weight > 0 && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    rider.type === 'child' ? 'bg-ocean-light text-ocean' : 'bg-warm-light text-warm'
                  }`}>
                    {rider.type === 'child' ? `Kind (≤${selectedProduct.max_weight_child}kg)` : `Volwassene (${selectedProduct.max_weight_child + 1}-${selectedProduct.max_weight_adult}kg)`}
                  </span>
                )}
                {riders.length > 1 && (
                  <button onClick={() => removeRider(i)} className="text-red-400 hover:text-red-600 text-sm">Verwijder</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-400 font-medium block mb-1">NAAM</label>
                <input
                  type="text"
                  value={rider.name}
                  onChange={e => updateRider(i, 'name', e.target.value)}
                  placeholder="Volledige naam"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">LEEFTIJD</label>
                <input
                  type="number"
                  value={rider.age || ''}
                  onChange={e => updateRider(i, 'age', parseInt(e.target.value) || 0)}
                  placeholder="Jaar"
                  min={selectedProduct.min_age}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none"
                />
                {rider.age > 0 && rider.age < selectedProduct.min_age && (
                  <p className="text-xs text-red-500 mt-1">Min. {selectedProduct.min_age} jaar</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">GEWICHT (KG)</label>
                <input
                  type="number"
                  value={rider.weight || ''}
                  onChange={e => updateRider(i, 'weight', parseInt(e.target.value) || 0)}
                  placeholder="Kg"
                  max={selectedProduct.max_weight_adult}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none"
                />
                {rider.weight > selectedProduct.max_weight_adult && (
                  <p className="text-xs text-red-500 mt-1">Max. {selectedProduct.max_weight_adult} kg</p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-400 font-medium block mb-1">ERVARING</label>
              <select
                value={rider.experience}
                onChange={e => updateRider(i, 'experience', e.target.value)}
                className="w-full md:w-1/2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none"
              >
                <option value="">Kies ervaring...</option>
                <option value="beginner">Beginner (stap)</option>
                <option value="gevorderd">Gevorderd (stap & draf)</option>
                <option value="ervaren">Ervaren (stap, draf & galop)</option>
              </select>
            </div>
          </div>
        ))}

        <div className="flex justify-between items-center mt-4">
          {canAddMore ? (
            <button onClick={addRider} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium">
              + Ruiter toevoegen
            </button>
          ) : (
            <span className="text-sm text-gray-400">Maximaal aantal ruiters bereikt</span>
          )}

          {riders.length > 0 && riders.every(r => r.name && r.age >= selectedProduct.min_age && r.weight > 0 && r.weight <= selectedProduct.max_weight_adult && r.experience) && (
            <button
              onClick={() => setStep(4)}
              className="px-8 py-3 rounded-xl text-white font-medium shadow-sm"
              style={{ backgroundColor: `#${selectedProduct.accent}` }}
            >
              Verder →
            </button>
          )}
        </div>

        {riders.length === 0 && (
          <div className="mt-6 text-center">
            <button onClick={addRider} className="px-6 py-3 rounded-xl text-white font-medium shadow-sm" style={{ backgroundColor: `#${selectedProduct.accent}` }}>
              + Eerste ruiter toevoegen
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Step 4: Confirm & Pay ──
  function renderStep4() {
    if (!selectedProduct) return null
    const totalAmount = selectedProduct.price * riders.length

    async function handlePayment() {
      if (!agreedToTerms) {
        setError('Je moet akkoord gaan met de voorwaarden')
        return
      }
      if (!contactEmail) {
        setError('Vul je e-mailadres in')
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch('/api/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: selectedProduct!.id,
            date: selectedDate,
            riders,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            contact_name: contactName || riders[0]?.name,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Er ging iets mis')
          setLoading(false)
          return
        }

        // Redirect to Mollie checkout
        if (data.checkout_url) {
          window.location.href = data.checkout_url
        }
      } catch (err) {
        setError('Er ging iets mis. Probeer het opnieuw.')
        setLoading(false)
      }
    }

    return (
      <div>
        <button onClick={() => setStep(3)} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          ← Terug naar ruiters
        </button>
        <h1 className="text-3xl mb-6">Bevestigen & Betalen</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 text-white" style={{ backgroundColor: `#${selectedProduct.accent}` }}>
              <h2 className="text-lg font-serif">{selectedProduct.icon} {selectedProduct.name}</h2>
              <p className="text-sm opacity-80">
                {new Date(selectedDate).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · {selectedProduct.start_time?.substring(0, 5)} · {selectedProduct.duration_minutes} min
              </p>
            </div>
            <div className="p-5">
              {riders.map((r, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-400 text-sm">{r.age} jr · {r.weight} kg · {r.type === 'adult' ? 'Volw.' : 'Kind'}</span>
                </div>
              ))}
              <div className="flex justify-between pt-4 mt-2 border-t border-gray-200">
                <span className="font-bold">Totaal</span>
                <span className="text-3xl font-serif">€{totalAmount.toFixed(0)}</span>
              </div>

              {/* Contact */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="text-xs text-gray-400 font-medium block mb-1">E-MAIL *</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="jan@voorbeeld.nl"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none mb-2"
                />
                <label className="text-xs text-gray-400 font-medium block mb-1">TELEFOON</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="06-12345678"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-ocean focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-warm-light rounded-xl p-6">
            <h3 className="text-sm font-bold text-warm tracking-wider mb-4">VOORWAARDEN</h3>
            <div className="space-y-3 text-sm text-amber-800">
              <p>✓ Reservering is niet annuleerbaar na betaling</p>
              <p>✓ Aanwezig om {selectedProduct.arrive_time?.substring(0, 5) || selectedProduct.start_time?.substring(0, 5)} uur</p>
              {selectedProduct.warning && <p>✓ {selectedProduct.warning}</p>}
              <p>✓ Maximaal {selectedProduct.max_weight_adult} kg per ruiter</p>
              <p>✓ Helm wordt verstrekt door de stal</p>
            </div>

            <label className="flex items-start gap-3 mt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-4 h-4"
              />
              <span className="text-sm text-amber-800">Ik ga akkoord met de voorwaarden</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
        )}

        <button
          onClick={handlePayment}
          disabled={loading || !agreedToTerms || !contactEmail}
          className="w-full mt-6 py-4 rounded-xl text-white text-lg font-medium shadow-sm disabled:opacity-50"
          style={{ backgroundColor: `#${selectedProduct.accent}` }}
        >
          {loading ? 'Even geduld...' : `Betaal €${totalAmount.toFixed(0)} & Reserveer`}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">Betaling via Mollie · iDEAL</p>
      </div>
    )
  }

  // ── Header ──
  const steps = ['Kies rit', 'Datum', 'Ruiters', 'Betalen']

  return (
    <div className="min-h-screen bg-cream">
      {/* Navigation */}
      <nav className="bg-gray-900 text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <span className="font-serif text-lg">🐴 Stal Florida</span>
          <div className="hidden md:flex gap-6">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  i + 1 === step ? 'bg-ocean text-white' :
                  i + 1 < step ? 'bg-green-700 text-white' :
                  'bg-gray-700 text-gray-400'
                }`}>{i + 1}</span>
                <span className={`text-sm ${i + 1 === step ? 'text-white font-medium' : 'text-gray-500'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </main>
    </div>
  )
}
