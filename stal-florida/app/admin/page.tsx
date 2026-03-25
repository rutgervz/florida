'use client'

import { useState, useEffect, useCallback } from 'react'

interface Product {
  id: string; name: string; description: string; icon: string; price: number
  start_time: string; arrive_time: string; duration_minutes: number
  required_gaits: string[]; min_age: number; max_age: number | null
  max_weight_adult: number; max_weight_child: number
  slots_adult: number; slots_child: number; slots_total: number
  available_days: number[]; time_slots: string[] | null
  warning: string | null; active: boolean; sort_order: number; gradient: string; accent: string
}

function fmt(d: Date) { return d.toISOString().split('T')[0] }
function getMonday(offset: number) {
  const d = new Date(); const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
  return new Date(d.getFullYear(), d.getMonth(), diff)
}
function getWeekNumber(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<'dashboard' | 'planning' | 'products' | 'bookings' | 'offline'>('dashboard')
  const [products, setProducts] = useState<Product[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [allBookings, setAllBookings] = useState<any[]>([])
  const [blockedDates, setBlockedDates] = useState<any[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [availability, setAvailability] = useState<any>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { const s = sessionStorage.getItem('admin_token'); if (s) setToken(s) }, [])

  const authHeaders = useCallback(() => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }), [token])

  useEffect(() => { if (!token) return; loadProducts(); loadBookings(); loadAllBookings(); loadBlockedDates() }, [token])
  useEffect(() => { if (!token) return; loadAvailability() }, [token, weekOffset])

  async function login() {
    const res = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    if (res.ok) { const data = await res.json(); setToken(data.token); sessionStorage.setItem('admin_token', data.token); setLoginError('') }
    else setLoginError('Onjuist wachtwoord')
  }

  async function loadProducts() { const r = await fetch('/api/admin/products', { headers: authHeaders() }); if (r.ok) setProducts(await r.json()) }
  async function loadBookings() { const r = await fetch('/api/admin/bookings', { headers: authHeaders() }); if (r.ok) setBookings(await r.json()) }
  async function loadAllBookings() { const r = await fetch('/api/admin/bookings?status=confirmed', { headers: authHeaders() }); if (r.ok) { const confirmed = await r.json(); const r2 = await fetch('/api/admin/bookings?status=offline', { headers: authHeaders() }); const offline = r2.ok ? await r2.json() : []; setAllBookings([...confirmed, ...offline]) } }
  async function loadBlockedDates() { const r = await fetch('/api/admin/block-date', { headers: authHeaders() }); if (r.ok) setBlockedDates(await r.json()) }
  async function loadAvailability() { const m = getMonday(weekOffset); const s = new Date(m); s.setDate(s.getDate() + 5); const r = await fetch('/api/availability?start_date=' + fmt(m) + '&end_date=' + fmt(s)); if (r.ok) setAvailability(await r.json()) }

  async function cancelBooking(id: string) {
    if (confirm('Weet je zeker dat je deze reservering wilt annuleren?')) {
      await fetch('/api/admin/bookings?id=' + id, { method: 'DELETE', headers: authHeaders() })
      loadBookings(); loadAllBookings(); loadAvailability()
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 w-80 shadow-lg">
          <h1 className="text-2xl font-serif mb-6 text-center">Stal Florida</h1>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Wachtwoord" className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 mb-3 focus:outline-none focus:border-cyan-700" />
          {loginError && <p className="text-red-500 text-sm mb-3">{loginError}</p>}
          <button onClick={login} className="w-full py-3 bg-cyan-700 text-white rounded-lg font-medium">Inloggen</button>
        </div>
      </div>
    )
  }

  const today = fmt(new Date())
  const monday = getMonday(0); const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)

  const activeBookings = allBookings.filter(b => b.status === 'confirmed' || b.status === 'offline')
  const todayBookings = activeBookings.filter(b => b.date === today)
  const weekBookings = activeBookings.filter(b => b.date >= fmt(monday) && b.date <= fmt(sunday))
  const monthBookings = activeBookings.filter(b => b.date >= fmt(monthStart) && b.date <= fmt(monthEnd))

  const todayRevenue = todayBookings.reduce((s: number, b: any) => s + parseFloat(b.total_amount), 0)
  const weekRevenue = weekBookings.reduce((s: number, b: any) => s + parseFloat(b.total_amount), 0)
  const monthRevenue = monthBookings.reduce((s: number, b: any) => s + parseFloat(b.total_amount), 0)
  const todayRiders = todayBookings.reduce((s: number, b: any) => s + (b.riders?.length || 0), 0)
  const weekRiders = weekBookings.reduce((s: number, b: any) => s + (b.riders?.length || 0), 0)
  const monthRiders = monthBookings.reduce((s: number, b: any) => s + (b.riders?.length || 0), 0)

  const filteredBookings = bookings.filter(b => {
    const q = searchQuery.toLowerCase()
    const ms = !searchQuery || (b.contact_name || '').toLowerCase().includes(q) || (b.contact_email || '').toLowerCase().includes(q) || (b.contact_phone || '').includes(searchQuery) || (b.riders || []).some((r: any) => r.name.toLowerCase().includes(q))
    const mst = !statusFilter || b.status === statusFilter
    return ms && mst
  })

  const planMonday = getMonday(weekOffset)
  const weekDays = Array.from({ length: 6 }, (_, i) => { const d = new Date(planMonday); d.setDate(d.getDate() + i); return d })
  const dayNames = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
  const tabs = ['dashboard', 'planning', 'products', 'bookings', 'offline'] as const
  const tabLabels: Record<string, string> = { dashboard: 'Overzicht', planning: 'Planning', products: 'Producten', bookings: 'Reserveringen', offline: 'Offline invoer' }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between">
        <span className="font-serif text-lg">Stal Florida - Admin</span>
        <div className="flex gap-1 flex-wrap">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={'px-3 py-2 rounded-t text-sm font-medium ' + (tab === t ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white')}>
              {tabLabels[t]}
            </button>
          ))}
        </div>
        <button onClick={() => { setToken(''); sessionStorage.removeItem('admin_token') }} className="text-gray-500 text-sm hover:text-white">Uit</button>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-6">

        {tab === 'dashboard' && (
          <div>
            <h1 className="text-2xl font-serif mb-6">Overzicht</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6"><div className="text-xs text-gray-400 font-medium tracking-wider mb-1">VANDAAG</div><div className="text-3xl font-serif" style={{ color: '#2D6A7A' }}>{todayBookings.length}</div><div className="text-sm text-gray-500">{todayRiders} ruiters - EUR {todayRevenue.toFixed(0)}</div></div>
              <div className="bg-white rounded-xl shadow-sm p-6"><div className="text-xs text-gray-400 font-medium tracking-wider mb-1">DEZE WEEK</div><div className="text-3xl font-serif" style={{ color: '#2D5A3A' }}>{weekBookings.length}</div><div className="text-sm text-gray-500">{weekRiders} ruiters - EUR {weekRevenue.toFixed(0)}</div></div>
              <div className="bg-white rounded-xl shadow-sm p-6"><div className="text-xs text-gray-400 font-medium tracking-wider mb-1">DEZE MAAND</div><div className="text-3xl font-serif" style={{ color: '#7A4A2D' }}>{monthBookings.length}</div><div className="text-sm text-gray-500">{monthRiders} ruiters - EUR {monthRevenue.toFixed(0)}</div></div>
            </div>
            <h2 className="text-lg font-serif mb-3">Vandaag ({new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })})</h2>
            {todayBookings.length === 0 ? <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center mb-6">Geen boekingen vandaag</div> : <div className="space-y-3 mb-6">{todayBookings.map((b: any) => <BookingCard key={b.id} booking={b} onCancel={cancelBooking} />)}</div>}
            <h2 className="text-lg font-serif mb-3">Deze week</h2>
            {weekBookings.length === 0 ? <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center mb-6">Geen boekingen deze week</div> : <div className="space-y-3 mb-6">{weekBookings.map((b: any) => <BookingCard key={b.id} booking={b} onCancel={cancelBooking} />)}</div>}
            <h2 className="text-lg font-serif mb-3">Deze maand</h2>
            {monthBookings.length === 0 ? <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center">Geen boekingen deze maand</div> : <div className="space-y-3">{monthBookings.map((b: any) => <BookingCard key={b.id} booking={b} onCancel={cancelBooking} />)}</div>}
          </div>
        )}

        {tab === 'planning' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-serif">Weekoverzicht</h1>
              <div className="flex items-center gap-3">
                <button onClick={() => setWeekOffset(weekOffset - 1)} className="px-3 py-1 rounded bg-white shadow-sm text-sm">&#8249;</button>
                <span className="text-sm text-gray-500">Week {getWeekNumber(planMonday)}</span>
                <button onClick={() => setWeekOffset(weekOffset + 1)} className="px-3 py-1 rounded bg-white shadow-sm text-sm">&#8250;</button>
                <button onClick={() => setWeekOffset(0)} className="px-3 py-1 rounded bg-cyan-700 text-white shadow-sm text-sm">Vandaag</button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                <div className="bg-white p-3" />
                {weekDays.map((d, i) => (<div key={i} className={'bg-white p-3 text-center ' + (fmt(d) === today ? 'bg-cyan-50' : '')}><div className="text-xs text-gray-400 font-medium">{dayNames[i]}</div><div className={'text-sm font-medium ' + (fmt(d) === today ? 'text-cyan-700' : '')}>{d.getDate()}</div></div>))}
              </div>
              {products.filter(p => p.active).map(product => (
                <div key={product.id} className="grid grid-cols-7 gap-px bg-gray-200">
                  <div className="bg-white p-3 flex items-center text-sm font-medium" style={{ color: '#' + product.accent }}>{product.icon} {product.name}</div>
                  {weekDays.map((d, i) => { const ds = fmt(d); const av = availability[product.id]?.[ds]; const bl = !av || av.blocked; const it = ds === today; return (<div key={i} className={'bg-white p-3 text-center ' + (bl ? 'bg-gray-50' : '') + (it ? ' bg-cyan-50' : '')}>{bl ? <span className="text-xs text-gray-300">-</span> : av.slots ? <div className="text-[10px]">{Object.entries(av.slots).map(([k, v]: any) => <div key={k} style={{ color: v.total_available === 0 ? '#CC4444' : '#' + product.accent }}>{k}: {v.blocked ? 'x' : v.total_available}</div>)}</div> : <div><div className="text-sm"><span className="font-bold" style={{ color: av.adults_available === 0 ? '#CC4444' : '#' + product.accent }}>{av.adults_available}V</span> <span className="font-bold" style={{ color: av.children_available === 0 ? '#CC4444' : '#' + product.accent }}>{av.children_available}K</span></div></div>}</div>) })}
                </div>
              ))}
            </div>
            <div className="mt-6"><h2 className="text-lg font-serif mb-3">Blokkeren</h2><BlockDateForm products={products} authHeaders={authHeaders()} onBlocked={() => { loadBlockedDates(); loadAvailability() }} /></div>
            {blockedDates.length > 0 && <div className="mt-4"><h3 className="text-sm font-medium text-gray-500 mb-2">Geblokkeerd</h3>{blockedDates.map((bd: any) => (<div key={bd.id} className="flex justify-between items-center bg-red-50 rounded-lg px-4 py-2 mb-1"><span className="text-sm text-red-700">{new Date(bd.date).toLocaleDateString('nl-NL')} - {bd.products?.name || 'Alle'}{bd.time_slot ? ' ' + bd.time_slot.substring(0, 5) : ''} - {bd.reason || 'Geen reden'}</span><button onClick={async () => { await fetch('/api/admin/block-date?id=' + bd.id, { method: 'DELETE', headers: authHeaders() }); loadBlockedDates(); loadAvailability() }} className="text-red-500 text-sm hover:text-red-700">Verwijder</button></div>))}</div>}
          </div>
        )}

        {tab === 'products' && (
          <div>
            <h1 className="text-2xl font-serif mb-6">Producten beheren</h1>
            {products.map(product => <ProductEditor key={product.id} product={product} authHeaders={authHeaders()} onSaved={loadProducts} />)}
          </div>
        )}

        {tab === 'bookings' && (
          <div>
            <h1 className="text-2xl font-serif mb-4">Reserveringen</h1>
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-3 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]"><label className="text-xs text-gray-400 block mb-1">ZOEKEN</label><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Naam, e-mail of telefoon..." className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-cyan-700" /></div>
              <div><label className="text-xs text-gray-400 block mb-1">STATUS</label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"><option value="">Actief</option><option value="confirmed">Bevestigd</option><option value="pending">Wachtend</option><option value="offline">Offline</option><option value="cancelled">Geannuleerd</option><option value="expired">Verlopen</option></select></div>
              <div className="text-sm text-gray-400">{filteredBookings.length} resultaten</div>
            </div>
            {filteredBookings.length === 0 ? <div className="bg-white rounded-xl shadow-sm p-6 text-gray-400 text-center">Geen reserveringen gevonden</div> : <div className="space-y-3">{filteredBookings.map((b: any) => <BookingCard key={b.id} booking={b} onCancel={cancelBooking} />)}</div>}
          </div>
        )}

        {tab === 'offline' && (
          <div>
            <h1 className="text-2xl font-serif mb-2">Offline boeking invoeren</h1>
            <p className="text-gray-500 text-sm mb-6">Voor boekingen uit het papieren reserveringsboek.</p>
            <OfflineBookingForm products={products} authHeaders={authHeaders()} onSaved={() => { loadBookings(); loadAllBookings(); loadAvailability() }} />
          </div>
        )}
      </main>
    </div>
  )
}

function BookingCard({ booking: b, onCancel }: { booking: any; onCancel: (id: string) => void }) {
  const displayTime = b.time_slot ? b.time_slot.substring(0, 5) : (b.products?.start_time ? b.products.start_time.substring(0, 5) : '')
  const statusColors: Record<string, string> = { confirmed: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', offline: 'bg-blue-100 text-blue-700', cancelled: 'bg-red-100 text-red-700', expired: 'bg-gray-100 text-gray-500' }
  const statusLabels: Record<string, string> = { confirmed: 'Betaald', pending: 'Wachtend', offline: 'Offline', cancelled: 'Geannuleerd', expired: 'Verlopen' }
  const borderColors: Record<string, string> = { confirmed: '#2D5A3A', pending: '#7A4A2D', offline: '#2D6A7A', cancelled: '#999', expired: '#999' }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border-l-4" style={{ borderLeftColor: borderColors[b.status] || '#999' }}>
      <div className="flex justify-between items-start">
        <div>
          <span className="font-medium" style={{ color: '#2D6A7A' }}>{b.products?.icon} {b.products?.name}</span>
          <span className="text-gray-400 text-sm ml-3">{new Date(b.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })} - {displayTime}</span>
        </div>
        <div className="text-right">
          <span className="text-xl font-serif">EUR {parseFloat(b.total_amount).toFixed(0)}</span>
          <div><span className={'text-xs px-2 py-0.5 rounded-full ' + (statusColors[b.status] || '')}>{statusLabels[b.status] || b.status}</span></div>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-500">{b.riders?.map((r: any, i: number) => <span key={i}>{r.name} ({r.age}jr, {r.weight}kg){i < b.riders.length - 1 ? ' + ' : ''}</span>)}</div>
      <div className="mt-1 text-xs text-gray-400 flex justify-between items-center">
        <span>{b.contact_name} - {b.contact_email}{b.contact_phone ? ' - ' + b.contact_phone : ''}</span>
        {['confirmed', 'pending', 'offline'].includes(b.status) && <button onClick={() => onCancel(b.id)} className="text-red-400 hover:text-red-600 ml-4">Annuleren</button>}
      </div>
    </div>
  )
}

function OfflineBookingForm({ products, authHeaders, onSaved }: { products: any[]; authHeaders: any; onSaved: () => void }) {
  const [productId, setProductId] = useState('')
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [riderCount, setRiderCount] = useState(1)
  const [riders, setRiders] = useState([{ name: '', age: 0, weight: 0, experience: 'onbekend' }])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectedProduct = products.find((p: any) => p.id === productId)
  const hasSlots = selectedProduct?.time_slots && selectedProduct.time_slots.length > 0

  useEffect(() => {
    const newRiders = Array.from({ length: riderCount }, (_, i) => riders[i] || { name: '', age: 0, weight: 0, experience: 'onbekend' })
    setRiders(newRiders)
  }, [riderCount])

  async function handleSave() {
    if (!productId || !date) { setMessage('Kies product en datum'); return }
    if (hasSlots && !timeSlot) { setMessage('Kies een tijdslot'); return }
    if (riders.some(r => !r.name)) { setMessage('Vul alle namen in'); return }
    setSaving(true); setMessage('')
    const res = await fetch('/api/admin/bookings', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ product_id: productId, date, time_slot: timeSlot || null, riders, contact_name: contactName || riders[0]?.name, contact_email: '', contact_phone: contactPhone }),
    })
    if (res.ok) {
      setMessage('Offline boeking opgeslagen!')
      setProductId(''); setDate(''); setTimeSlot(''); setContactName(''); setContactPhone('')
      setRiderCount(1); setRiders([{ name: '', age: 0, weight: 0, experience: 'onbekend' }])
      onSaved()
    } else {
      const data = await res.json(); setMessage('Fout: ' + (data.error || 'Onbekend'))
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">PRODUCT *</label>
          <select value={productId} onChange={e => { setProductId(e.target.value); setTimeSlot('') }} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
            <option value="">Kies product...</option>
            {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.icon} {p.name} - EUR {p.price}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">DATUM *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
        </div>
        {hasSlots && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">TIJDSLOT *</label>
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
              <option value="">Kies tijd...</option>
              {selectedProduct.time_slots.map((s: string) => <option key={s} value={s.substring(0, 5)}>{s.substring(0, 5)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400 block mb-1">CONTACTNAAM</label>
          <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Naam contactpersoon" className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">TELEFOON</label>
          <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="06-..." className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">AANTAL RUITERS</label>
          <input type="number" min={1} max={6} value={riderCount} onChange={e => setRiderCount(Math.max(1, Math.min(6, parseInt(e.target.value) || 1)))} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
        </div>
      </div>

      <h3 className="text-sm font-medium text-gray-500 mb-2">Ruiters</h3>
      {riders.map((r, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 mb-2">
          <input type="text" value={r.name} onChange={e => { const u = [...riders]; u[i] = { ...u[i], name: e.target.value }; setRiders(u) }} placeholder={'Naam ruiter ' + (i + 1) + ' *'} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
          <input type="number" value={r.age || ''} onChange={e => { const u = [...riders]; u[i] = { ...u[i], age: parseInt(e.target.value) || 0 }; setRiders(u) }} placeholder="Leeftijd" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
          <input type="number" value={r.weight || ''} onChange={e => { const u = [...riders]; u[i] = { ...u[i], weight: parseInt(e.target.value) || 0 }; setRiders(u) }} placeholder="Gewicht kg" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" />
        </div>
      ))}

      {message && <div className={'mt-4 p-3 rounded-lg text-sm ' + (message.startsWith('Fout') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>{message}</div>}

      <button onClick={handleSave} disabled={saving} className="mt-4 px-6 py-3 bg-cyan-700 text-white rounded-lg font-medium disabled:opacity-50">
        {saving ? 'Opslaan...' : 'Offline boeking opslaan'}
      </button>
      {selectedProduct && <span className="ml-4 text-sm text-gray-400">Totaal: EUR {(selectedProduct.price * riderCount).toFixed(0)}</span>}
    </div>
  )
}

function BlockDateForm({ products, authHeaders, onBlocked }: { products: any[]; authHeaders: any; onBlocked: () => void }) {
  const [date, setDate] = useState('')
  const [productId, setProductId] = useState('')
  const [timeSlot, setTimeSlot] = useState('')
  const [reason, setReason] = useState('')

  const selectedProduct = products.find((p: any) => p.id === productId)
  const hasSlots = selectedProduct?.time_slots && selectedProduct.time_slots.length > 0

  async function handleBlock() {
    if (!date) return
    await fetch('/api/admin/block-date', { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, product_id: productId || null, time_slot: timeSlot || null, reason }) })
    setDate(''); setProductId(''); setTimeSlot(''); setReason(''); onBlocked()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex gap-3 items-end flex-wrap">
      <div><label className="text-xs text-gray-400 block mb-1">DATUM</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" /></div>
      <div><label className="text-xs text-gray-400 block mb-1">PRODUCT</label><select value={productId} onChange={e => { setProductId(e.target.value); setTimeSlot('') }} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"><option value="">Alle</option>{products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}</select></div>
      {hasSlots && <div><label className="text-xs text-gray-400 block mb-1">TIJDSLOT</label><select value={timeSlot} onChange={e => setTimeSlot(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm"><option value="">Hele dag</option>{selectedProduct.time_slots.map((s: string) => <option key={s} value={s.substring(0, 5)}>{s.substring(0, 5)}</option>)}</select></div>}
      {!hasSlots && productId && <div><label className="text-xs text-gray-400 block mb-1">RIT</label><span className="px-3 py-2 text-sm text-gray-500">Hele rit ({selectedProduct?.start_time?.substring(0, 5)})</span></div>}
      <div className="flex-1"><label className="text-xs text-gray-400 block mb-1">REDEN</label><input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="bijv. Storm" className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm" /></div>
      <button onClick={handleBlock} className="px-5 py-2 bg-cyan-700 text-white rounded-lg text-sm font-medium">Blokkeer</button>
    </div>
  )
}

function ProductEditor({ product, authHeaders, onSaved }: { product: Product; authHeaders: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(product)
  async function save() { await fetch('/api/admin/products', { method: 'PUT', headers: authHeaders, body: JSON.stringify(form) }); setEditing(false); onSaved() }
  if (!editing) {
    return (<div className="bg-white rounded-xl shadow-sm p-5 mb-3 flex justify-between items-center"><div><span className="text-lg font-serif">{product.icon} {product.name}</span><span className="ml-3 text-gray-400 text-sm">EUR {product.price} - {product.duration_minutes} min</span>{!product.active && <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Inactief</span>}</div><button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Bewerken</button></div>)
  }
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-3">
      <h3 className="font-serif text-lg mb-4">{product.icon} {product.name} bewerken</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="col-span-2"><label className="text-xs text-gray-400 block mb-1">NAAM</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">PRIJS</label><input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">ICOON</label><input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">STARTTIJD</label><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">AANKOMST</label><input type="time" value={form.arrive_time} onChange={e => setForm({ ...form, arrive_time: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">DUUR (MIN)</label><input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">MIN LEEFTIJD</label><input type="number" value={form.min_age} onChange={e => setForm({ ...form, min_age: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
        <div className="col-span-2 md:col-span-4"><label className="text-xs text-gray-400 block mb-1">BESCHRIJVING</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" /></div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={save} className="px-5 py-2 bg-cyan-700 text-white rounded-lg text-sm font-medium">Opslaan</button>
        <button onClick={() => { setEditing(false); setForm(product) }} className="px-5 py-2 bg-gray-100 rounded-lg text-sm">Annuleren</button>
        <button onClick={async () => { await fetch('/api/admin/products', { method: 'PUT', headers: authHeaders, body: JSON.stringify({ id: product.id, active: !product.active }) }); onSaved() }} className="px-5 py-2 bg-gray-100 rounded-lg text-sm ml-auto">{product.active ? 'Deactiveren' : 'Activeren'}</button>
      </div>
    </div>
  )
}
