'use client'

import { useState, useEffect, useCallback } from 'react'

interface Product {
  id: string; name: string; description: string; icon: string; price: number
  start_time: string; arrive_time: string; duration_minutes: number
  required_gaits: string[]; min_age: number; max_weight_adult: number; max_weight_child: number
  slots_adult: number; slots_child: number; slots_total: number
  available_days: number[]; warning: string | null; active: boolean; sort_order: number
  gradient: string; accent: string
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<'planning' | 'products' | 'bookings'>('planning')
  const [products, setProducts] = useState<Product[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [blockedDates, setBlockedDates] = useState<any[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [availability, setAvailability] = useState<any>({})

  // Check stored token
  useEffect(() => {
    const stored = sessionStorage.getItem('admin_token')
    if (stored) setToken(stored)
  }, [])

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  // Load data when authenticated
  useEffect(() => {
    if (!token) return
    loadProducts()
    loadBookings()
    loadBlockedDates()
  }, [token])

  useEffect(() => {
    if (!token) return
    loadAvailability()
  }, [token, weekOffset])

  async function login() {
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      const { token: t } = await res.json()
      setToken(t)
      sessionStorage.setItem('admin_token', t)
      setLoginError('')
    } else {
      setLoginError('Onjuist wachtwoord')
    }
  }

  async function loadProducts() {
    const res = await fetch('/api/admin/products', { headers: authHeaders() })
    if (res.ok) setProducts(await res.json())
  }

  async function loadBookings() {
    const res = await fetch('/api/admin/bookings', { headers: authHeaders() })
    if (res.ok) setBookings(await res.json())
  }

  async function loadBlockedDates() {
    const res = await fetch('/api/admin/block-date', { headers: authHeaders() })
    if (res.ok) setBlockedDates(await res.json())
  }

  async function loadAvailability() {
    const monday = getMonday(weekOffset)
    const saturday = new Date(monday)
    saturday.setDate(saturday.getDate() + 5)
    const res = await fetch(`/api/availability?start_date=${fmt(monday)}&end_date=${fmt(saturday)}`)
    if (res.ok) setAvailability(await res.json())
  }

  function getMonday(offset: number) {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
    return new Date(d.setDate(diff))
  }

  function fmt(d: Date) { return d.toISOString().split('T')[0] }

  // ── Login screen ──
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 w-80 shadow-lg">
          <h1 className="text-2xl font-serif mb-6 text-center">🐴 Stal Florida</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Wachtwoord"
            className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 mb-3 focus:outline-none focus:border-ocean"
          />
          {loginError && <p className="text-red-500 text-sm mb-3">{loginError}</p>}
          <button onClick={login} className="w-full py-3 bg-ocean text-white rounded-lg font-medium">
            Inloggen
          </button>
        </div>
      </div>
    )
  }

  // ── Main admin ──
  const monday = getMonday(weekOffset)
  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })

  const dayNames = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between">
        <span className="font-serif text-lg">🐴 Stal Florida — Admin</span>
        <div className="flex gap-1">
          {(['planning', 'products', 'bookings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-t text-sm font-medium ${tab === t ? 'bg-ocean text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {t === 'planning' ? '📅 Planning' : t === 'products' ? '🐎 Producten' : '📋 Reserveringen'}
            </button>
          ))}
        </div>
        <button onClick={() => { setToken(''); sessionStorage.removeItem('admin_token') }} className="text-gray-500 text-sm hover:text-white">
          Uitloggen
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* ── PLANNING TAB ── */}
        {tab === 'planning' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-serif">Weekoverzicht</h1>
              <div className="flex items-center gap-3">
                <button onClick={() => setWeekOffset(weekOffset - 1)} className="px-3 py-1 rounded bg-white shadow-sm text-sm">‹</button>
                <span className="text-sm text-gray-500">
                  Week {getWeekNumber(monday)} · {monday.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {weekDays[5].toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <button onClick={() => setWeekOffset(weekOffset + 1)} className="px-3 py-1 rounded bg-white shadow-sm text-sm">›</button>
                <button onClick={() => setWeekOffset(0)} className="px-3 py-1 rounded bg-ocean text-white shadow-sm text-sm">Vandaag</button>
              </div>
            </div>

            {/* Grid */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                <div className="bg-white p-3" />
                {weekDays.map((d, i) => (
                  <div key={i} className="bg-white p-3 text-center">
                    <div className="text-xs text-gray-400 font-medium">{dayNames[i]}</div>
                    <div className="text-sm font-medium">{d.getDate()}</div>
                  </div>
                ))}
              </div>
              {products.filter(p => p.active).map(product => (
                <div key={product.id} className="grid grid-cols-7 gap-px bg-gray-200">
                  <div className="bg-white p-3 flex items-center text-sm font-medium" style={{ color: `#${product.accent}` }}>
                    {product.icon} {product.name}
                  </div>
                  {weekDays.map((d, i) => {
                    const dateStr = fmt(d)
                    const avail = availability[product.id]?.[dateStr]
                    const isBlocked = !avail || avail.blocked
                    return (
                      <div key={i} className={`bg-white p-3 text-center ${isBlocked ? 'bg-gray-50' : ''}`}>
                        {isBlocked ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <>
                            <div className="text-sm">
                              <span className="font-bold" style={{ color: avail.adults_available === 0 ? '#CC4444' : `#${product.accent}` }}>{avail.adults_available}V</span>
                              {' '}
                              <span className="font-bold" style={{ color: avail.children_available === 0 ? '#CC4444' : `#${product.accent}` }}>{avail.children_available}K</span>
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {avail.total_available === 0 ? 'vol' : avail.total_available === product.slots_total ? 'vrij' : `${avail.total_available} vrij`}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Block date form */}
            <div className="mt-6">
              <h2 className="text-lg font-serif mb-3">Dag blokkeren</h2>
              <BlockDateForm
                products={products}
                authHeaders={authHeaders()}
                onBlocked={() => { loadBlockedDates(); loadAvailability() }}
              />
            </div>

            {/* Blocked dates list */}
            {blockedDates.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Geblokkeerde dagen</h3>
                {blockedDates.map(bd => (
                  <div key={bd.id} className="flex justify-between items-center bg-red-50 rounded-lg px-4 py-2 mb-1">
                    <span className="text-sm text-red-700">
                      {new Date(bd.date).toLocaleDateString('nl-NL')} · {bd.products?.name || 'Alle producten'} · {bd.reason || 'Geen reden'}
                    </span>
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/block-date?id=${bd.id}`, { method: 'DELETE', headers: authHeaders() })
                        loadBlockedDates()
                        loadAvailability()
                      }}
                      className="text-red-500 text-sm hover:text-red-700"
                    >
                      Verwijder ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <div>
            <h1 className="text-2xl font-serif mb-6">Producten beheren</h1>
            {products.map(product => (
              <ProductEditor
                key={product.id}
                product={product}
                authHeaders={authHeaders()}
                onSaved={loadProducts}
              />
            ))}
          </div>
        )}

        {/* ── BOOKINGS TAB ── */}
        {tab === 'bookings' && (
          <div>
            <h1 className="text-2xl font-serif mb-6">Reserveringen</h1>
            {bookings.length === 0 ? (
              <p className="text-gray-400">Nog geen reserveringen.</p>
            ) : (
              <div className="space-y-3">
                {bookings.map(b => (
                  <div key={b.id} className="bg-white rounded-xl shadow-sm p-5 border-l-4" style={{ borderLeftColor: b.status === 'confirmed' ? '#2D5A3A' : '#7A4A2D' }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium" style={{ color: `#${b.products?.icon ? '2D6A7A' : '555'}` }}>
                          {b.products?.icon} {b.products?.name}
                        </span>
                        <span className="text-gray-400 text-sm ml-3">
                          {new Date(b.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })} · {b.products?.start_time?.substring(0, 5)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-serif">€{parseFloat(b.total_amount).toFixed(0)}</span>
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {b.status === 'confirmed' ? 'Betaald ✓' : 'Wachtend'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      {b.riders?.map((r: any, i: number) => (
                        <span key={i}>
                          {r.name} ({r.age}jr, {r.weight}kg, {r.type === 'adult' ? 'Volw.' : 'Kind'})
                          {i < b.riders.length - 1 ? ' + ' : ''}
                        </span>
                      ))}
                    </div>
<div className="mt-1 text-xs text-gray-400 flex justify-between items-center">
  <span>{b.contact_email} · {b.contact_phone}</span>
  <button
    onClick={async () => {
      if (confirm('Weet je zeker dat je deze reservering wilt annuleren?')) {
        await fetch('/api/admin/bookings?id=' + b.id, { method: 'DELETE', headers: authHeaders() })
        loadBookings()
        loadAvailability()
      }
    }}
    className="text-red-400 hover:text-red-600 ml-4"
  >
    Annuleren
  </button>
</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Block Date Form Component ──
function BlockDateForm({ products, authHeaders, onBlocked }: { products: any[]; authHeaders: any; onBlocked: () => void }) {
  const [date, setDate] = useState('')
  const [productId, setProductId] = useState('')
  const [reason, setReason] = useState('')

  async function handleBlock() {
    if (!date) return
    await fetch('/api/admin/block-date', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ date, product_id: productId || null, reason }),
    })
    setDate(''); setProductId(''); setReason('')
    onBlocked()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex gap-3 items-end flex-wrap">
      <div>
        <label className="text-xs text-gray-400 block mb-1">DATUM</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">PRODUCT</label>
        <select value={productId} onChange={e => setProductId(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
          <option value="">Alle producten</option>
          {products.filter(p => p.active).map(p => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="text-xs text-gray-400 block mb-1">REDEN</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="bijv. Storm verwacht" className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
      </div>
      <button onClick={handleBlock} className="px-5 py-2 bg-ocean text-white rounded-lg text-sm font-medium">Blokkeer</button>
    </div>
  )
}

// ── Product Editor Component ──
function ProductEditor({ product, authHeaders, onSaved }: { product: Product; authHeaders: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(product)

  async function save() {
    await fetch('/api/admin/products', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(form),
    })
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 mb-3 flex justify-between items-center">
        <div>
          <span className="text-lg font-serif">{product.icon} {product.name}</span>
          <span className="ml-3 text-gray-400 text-sm">€{product.price} · {product.duration_minutes} min · {product.start_time?.substring(0, 5)}</span>
          {!product.active && <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Inactief</span>}
        </div>
        <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Bewerken</button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-3">
      <h3 className="font-serif text-lg mb-4">{product.icon} {product.name} bewerken</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="col-span-2">
          <label className="text-xs text-gray-400 block mb-1">NAAM</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">PRIJS (€)</label>
          <input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">ICOON</label>
          <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">STARTTIJD</label>
          <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">AANKOMSTTIJD</label>
          <input type="time" value={form.arrive_time} onChange={e => setForm({ ...form, arrive_time: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">DUUR (MIN)</label>
          <input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">MIN. LEEFTIJD</label>
          <input type="number" value={form.min_age} onChange={e => setForm({ ...form, min_age: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">MAX VOLW.</label>
          <input type="number" value={form.slots_adult} onChange={e => setForm({ ...form, slots_adult: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">MAX KIND.</label>
          <input type="number" value={form.slots_child} onChange={e => setForm({ ...form, slots_child: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">MAX TOTAAL</label>
          <input type="number" value={form.slots_total} onChange={e => setForm({ ...form, slots_total: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className="text-xs text-gray-400 block mb-1">BESCHRIJVING</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className="text-xs text-gray-400 block mb-1">WAARSCHUWING (optioneel)</label>
          <input value={form.warning || ''} onChange={e => setForm({ ...form, warning: e.target.value || null })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" placeholder="bijv. Bij onvoldoende vaardigheden..." />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={save} className="px-5 py-2 bg-ocean text-white rounded-lg text-sm font-medium">Opslaan</button>
        <button onClick={() => { setEditing(false); setForm(product) }} className="px-5 py-2 bg-gray-100 rounded-lg text-sm">Annuleren</button>
        <button
          onClick={async () => {
            await fetch('/api/admin/products', {
              method: 'PUT',
              headers: authHeaders,
              body: JSON.stringify({ id: product.id, active: !product.active }),
            })
            onSaved()
          }}
          className="px-5 py-2 bg-gray-100 rounded-lg text-sm ml-auto"
        >
          {product.active ? 'Deactiveren' : 'Activeren'}
        </button>
      </div>
    </div>
  )
}

function getWeekNumber(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}
