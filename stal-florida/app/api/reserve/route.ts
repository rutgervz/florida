import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMollieClient } from '@/lib/mollie'
import { getAvailability } from '@/lib/availability'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import {
  isValidUUID,
  isValidDate,
  isValidEmail,
  isValidPhone,
  sanitizeName,
  sanitizeString,
  validateRiderInput,
  isExperienceSufficient,
  getMinimumExperience,
  MAX_RIDERS,
} from '@/lib/validation'
import type { Rider } from '@/lib/types'

export async function POST(request: NextRequest) {
  // Rate limit: max 5 reservations per minute per IP
  const ip = getClientIp(request)
  const { allowed } = rateLimit('reserve:' + ip, 5, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { product_id, date, riders, contact_email, contact_phone, contact_name } = body

    // Validate product_id
    if (!isValidUUID(product_id)) {
      return NextResponse.json({ error: 'Ongeldig product' }, { status: 400 })
    }

    // Validate date
    if (!isValidDate(date)) {
      return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 })
    }

    // Don't allow bookings in the past
    const today = new Date().toISOString().split('T')[0]
    if (date < today) {
      return NextResponse.json({ error: 'Kan niet in het verleden boeken' }, { status: 400 })
    }

    // Don't allow bookings more than 6 months ahead
    const maxDate = new Date()
    maxDate.setMonth(maxDate.getMonth() + 6)
    if (date > maxDate.toISOString().split('T')[0]) {
      return NextResponse.json({ error: 'Kan niet meer dan 6 maanden vooruit boeken' }, { status: 400 })
    }

    // Validate email
    if (!isValidEmail(contact_email)) {
      return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
    }

    // Validate phone (optional)
    if (contact_phone && !isValidPhone(contact_phone)) {
      return NextResponse.json({ error: 'Ongeldig telefoonnummer' }, { status: 400 })
    }

    // Validate riders array
    if (!Array.isArray(riders) || riders.length === 0) {
      return NextResponse.json({ error: 'Voeg minimaal 1 ruiter toe' }, { status: 400 })
    }

    if (riders.length > MAX_RIDERS) {
      return NextResponse.json({ error: 'Maximaal ' + MAX_RIDERS + ' ruiters per boeking' }, { status: 400 })
    }

    // Get product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('active', true)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 })
    }

    // Validate and classify each rider
    const classifiedRiders: Rider[] = []
    let numAdults = 0
    let numChildren = 0

    for (const rider of riders) {
      const validationError = validateRiderInput(rider, product.min_age, product.max_weight_adult)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }

      const type = rider.weight <= product.max_weight_child ? 'child' : 'adult'
      if (type === 'adult') numAdults++
      else numChildren++

      classifiedRiders.push({
        name: sanitizeName(rider.name),
        age: Math.floor(rider.age),
        weight: Math.floor(rider.weight),
        experience: rider.experience,
        type,
      })
    }

    // Validate experience against product requirements
    if (product.required_gaits && product.required_gaits.length > 0) {
      for (const rider of classifiedRiders) {
        if (!isExperienceSufficient(rider.experience, product.required_gaits)) {
          const minExp = getMinimumExperience(product.required_gaits)
          const expLabels: Record<string, string> = {
            beginner: 'beginner (stap)',
            gevorderd: 'gevorderd (stap en draf)',
            ervaren: 'ervaren (stap, draf en galop)',
          }
          return NextResponse.json(
            { error: rider.name + ' heeft onvoldoende ervaring. Voor ' + product.name + ' is minimaal ' + expLabels[minExp] + ' vereist.' },
            { status: 400 }
          )
        }
      }
    }

    // Check availability
    const availability = await getAvailability(product_id, date)

    if (availability.blocked) {
      return NextResponse.json({ error: 'Deze datum is niet beschikbaar' }, { status: 400 })
    }

    if (numAdults > availability.adults_available) {
      return NextResponse.json(
        { error: 'Niet genoeg plekken voor volwassenen. Er zijn nog ' + availability.adults_available + ' plekken.' },
        { status: 400 }
      )
    }

    if (numChildren > availability.children_available) {
      return NextResponse.json(
        { error: 'Niet genoeg plekken voor kinderen. Er zijn nog ' + availability.children_available + ' plekken.' },
        { status: 400 }
      )
    }

    if (numAdults + numChildren > availability.total_available) {
      return NextResponse.json(
        { error: 'Niet genoeg plekken. Er zijn nog ' + availability.total_available + ' plekken in totaal.' },
        { status: 400 }
      )
    }

    // Calculate total server-side (never trust client)
    const totalAmount = product.price * classifiedRiders.length

    // Create reservation with pending status
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    const safeName = sanitizeName(contact_name || classifiedRiders[0]?.name || '')
    const safeEmail = contact_email.trim().toLowerCase().substring(0, 254)
    const safePhone = contact_phone ? sanitizeString(contact_phone) : null

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from('reservations')
      .insert({
        product_id,
        date,
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
      .select()
      .single()

    if (reservationError || !reservation) {
      console.error('Reservation insert error:', reservationError)
      return NextResponse.json({ error: 'Kon reservering niet aanmaken' }, { status: 500 })
    }

    // Create Mollie payment
    try {
      const mollieClient = getMollieClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL

      if (!appUrl) {
        throw new Error('NEXT_PUBLIC_APP_URL not configured')
      }

      const dateFormatted = new Date(date).toLocaleDateString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      })

      const payment = await mollieClient.payments.create({
        amount: {
          currency: 'EUR',
          value: totalAmount.toFixed(2),
        },
        description: product.name + ' - ' + dateFormatted + ' - ' + classifiedRiders.length + ' ruiter(s)',
        redirectUrl: appUrl + '/boek/bevestiging?id=' + reservation.id,
        webhookUrl: appUrl + '/api/webhook/mollie',
        metadata: {
          reservation_id: reservation.id,
        },
      })

      // Update reservation with Mollie payment ID
      await supabaseAdmin
        .from('reservations')
        .update({ mollie_payment_id: payment.id })
        .eq('id', reservation.id)

      return NextResponse.json({
        reservation_id: reservation.id,
        checkout_url: payment.getCheckoutUrl(),
      })
    } catch (mollieError) {
      // Mollie failed — clean up the reservation
      console.error('Mollie payment creation error:', mollieError)
      await supabaseAdmin
        .from('reservations')
        .update({ status: 'expired' })
        .eq('id', reservation.id)

      return NextResponse.json(
        { error: 'Kon betaling niet starten. Probeer het opnieuw.' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Reserve error:', error)
    return NextResponse.json(
      { error: 'Er ging iets mis. Probeer het opnieuw.' },
      { status: 500 }
    )
  }
}
