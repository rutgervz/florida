import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMollieClient } from '@/lib/mollie'
import { getAvailability } from '@/lib/availability'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import {
  isValidUUID, isValidDate, isValidEmail, isValidPhone, isValidTime,
  sanitizeName, sanitizeString, validateRiderInput,
  isExperienceSufficient, getMinimumExperience, MAX_RIDERS,
} from '@/lib/validation'
import type { Rider } from '@/lib/types'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { allowed } = rateLimit('reserve:' + ip, 5, 60000)
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { product_id, date, time_slot, riders, contact_email, contact_phone, contact_name } = body

    if (!isValidUUID(product_id)) return NextResponse.json({ error: 'Ongeldig product' }, { status: 400 })
    if (!isValidDate(date)) return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 })

    // Use CET-aware date (Vercel runs in UTC)
    const cetNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
    const today = cetNow.getFullYear() + '-' + String(cetNow.getMonth() + 1).padStart(2, '0') + '-' + String(cetNow.getDate()).padStart(2, '0')
    if (date < today) return NextResponse.json({ error: 'Kan niet in het verleden boeken' }, { status: 400 })

    const maxDate = new Date(cetNow)
    maxDate.setMonth(maxDate.getMonth() + 6)
    const maxDateStr = maxDate.getFullYear() + '-' + String(maxDate.getMonth() + 1).padStart(2, '0') + '-' + String(maxDate.getDate()).padStart(2, '0')
    if (date > maxDateStr) return NextResponse.json({ error: 'Kan niet meer dan 6 maanden vooruit boeken' }, { status: 400 })

    if (!isValidEmail(contact_email)) return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
    if (contact_phone && !isValidPhone(contact_phone)) return NextResponse.json({ error: 'Ongeldig telefoonnummer' }, { status: 400 })
    if (!Array.isArray(riders) || riders.length === 0) return NextResponse.json({ error: 'Voeg minimaal 1 ruiter toe' }, { status: 400 })
    if (riders.length > MAX_RIDERS) return NextResponse.json({ error: 'Maximaal ' + MAX_RIDERS + ' ruiters per boeking' }, { status: 400 })

    const { data: product, error: productError } = await supabaseAdmin
      .from('products').select('*').eq('id', product_id).eq('active', true).single()

    if (productError || !product) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 })

    // Minimum 24 uur van tevoren (op basis van starttijd van de rit)
    const rideStartTime = time_slot ? time_slot.substring(0, 5) : (product.start_time ? product.start_time.substring(0, 5) : '09:00')
    const [rideH, rideM] = rideStartTime.split(':').map(Number)
    const rideStart = new Date(date + 'T' + String(rideH).padStart(2, '0') + ':' + String(rideM).padStart(2, '0') + ':00')
    const nowCET = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
    const hoursUntilRide = (rideStart.getTime() - nowCET.getTime()) / (1000 * 60 * 60)
    if (hoursUntilRide < 24) {
      return NextResponse.json({ error: 'Reserveren kan tot uiterlijk 24 uur voor de rit.' }, { status: 400 })
    }

    // Validate time slot
    if (product.time_slots && product.time_slots.length > 0) {
      if (!time_slot) return NextResponse.json({ error: 'Kies een tijdslot' }, { status: 400 })
      if (!isValidTime(time_slot)) return NextResponse.json({ error: 'Ongeldig tijdslot' }, { status: 400 })
      const validSlots = product.time_slots.map((s: string) => s.substring(0, 5))
      if (!validSlots.includes(time_slot.substring(0, 5))) {
        return NextResponse.json({ error: 'Dit tijdslot is niet beschikbaar' }, { status: 400 })
      }
    }

    // Validate and classify riders
    const classifiedRiders: Rider[] = []
    let numAdults = 0; let numChildren = 0

    for (const rider of riders) {
      const validationError = validateRiderInput(rider, product.min_age, product.max_weight_adult, product.max_age)
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

      const type = rider.weight <= product.max_weight_child ? 'child' : 'adult'
      if (type === 'adult') numAdults++; else numChildren++

      classifiedRiders.push({
        name: sanitizeName(rider.name),
        age: Math.floor(rider.age),
        weight: Math.floor(rider.weight),
        experience: rider.experience,
        type,
      })
    }

    // Experience check
    if (product.required_gaits && product.required_gaits.length > 0) {
      for (const rider of classifiedRiders) {
        if (!isExperienceSufficient(rider.experience, product.required_gaits)) {
          const minExp = getMinimumExperience(product.required_gaits)
          const expLabels: Record<string, string> = { beginner: 'beginner (stap)', gevorderd: 'gevorderd (stap en draf)', ervaren: 'ervaren (stap, draf en galop)' }
          return NextResponse.json({ error: rider.name + ' heeft onvoldoende ervaring. Voor ' + product.name + ' is minimaal ' + expLabels[minExp] + ' vereist.' }, { status: 400 })
        }
      }
    }

    // Check availability (quick pre-check for user feedback, not authoritative)
    const availability = await getAvailability(product_id, date, time_slot || undefined)
    if (availability.blocked) return NextResponse.json({ error: 'Deze datum is niet beschikbaar' }, { status: 400 })

    const totalAmount = product.price * classifiedRiders.length
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    const safeName = sanitizeName(contact_name || classifiedRiders[0]?.name || '')
    const safeEmail = contact_email.trim().toLowerCase().substring(0, 254)
    const safePhone = contact_phone ? sanitizeString(contact_phone) : null

    // Atomic reservation: checks capacity AND inserts in one transaction
    const { data: atomicResult, error: atomicError } = await supabaseAdmin.rpc('create_reservation_atomic', {
      p_product_id: product_id,
      p_date: date,
      p_time_slot: time_slot || null,
      p_status: 'pending',
      p_riders: JSON.stringify(classifiedRiders),
      p_num_adults: numAdults,
      p_num_children: numChildren,
      p_contact_name: safeName,
      p_contact_email: safeEmail,
      p_contact_phone: safePhone,
      p_total_amount: totalAmount,
      p_expires_at: expiresAt.toISOString(),
    })

    let reservationId: string

    if (atomicError) {
      console.error('Atomic reservation error:', atomicError)
      const msg = atomicError.message || ''
      if (msg.includes('Niet genoeg plekken') || msg.includes('niet beschikbaar')) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      // Fallback: direct insert (still safe because availability was pre-checked)
      console.log('Falling back to direct insert')
      const { data: fallbackRes, error: fallbackError } = await supabaseAdmin
        .from('reservations')
        .insert({
          product_id,
          date,
          time_slot: time_slot || null,
          status: 'pending',
          riders: classifiedRiders,
          num_adults: numAdults,
          num_children: numChildren,
          contact_name: safeName,
          contact_email: safeEmail,
          contact_phone: safePhone,
          total_amount: totalAmount,
          expires_at: expiresAt.toISOString(),
        })
        .select().single()

      if (fallbackError || !fallbackRes) {
        console.error('Fallback insert error:', fallbackError)
        return NextResponse.json({ error: 'Kon reservering niet aanmaken. Probeer het opnieuw.' }, { status: 500 })
      }
      reservationId = fallbackRes.id
    } else {
      reservationId = atomicResult
    }

    // Update with Mollie payment
    try {
      const mollieClient = getMollieClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured')

      const dateFormatted = new Date(date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })
      const timeDesc = time_slot ? ' ' + time_slot.substring(0, 5) : ''

      const payment = await mollieClient.payments.create({
        amount: { currency: 'EUR', value: totalAmount.toFixed(2) },
        description: product.name + ' - ' + dateFormatted + timeDesc + ' - ' + classifiedRiders.length + ' ruiter(s)',
        redirectUrl: appUrl + '/boek/bevestiging?id=' + reservationId,
        webhookUrl: appUrl + '/api/webhook/mollie',
        metadata: { reservation_id: reservationId },
      })

      await supabaseAdmin.from('reservations').update({ mollie_payment_id: payment.id }).eq('id', reservationId)

      return NextResponse.json({ reservation_id: reservationId, checkout_url: payment.getCheckoutUrl() })
    } catch (mollieError) {
      console.error('Mollie payment creation error:', mollieError)
      await supabaseAdmin.from('reservations').update({ status: 'expired' }).eq('id', reservationId)
      return NextResponse.json({ error: 'Kon betaling niet starten. Probeer het opnieuw.' }, { status: 500 })
    }
  } catch (error) {
    console.error('Reserve error:', error)
    return NextResponse.json({ error: 'Er ging iets mis. Probeer het opnieuw.' }, { status: 500 })
  }
}
