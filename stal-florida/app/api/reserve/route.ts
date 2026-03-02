import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMollieClient } from '@/lib/mollie'
import { getAvailability } from '@/lib/availability'
import type { Rider } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, date, riders, contact_email, contact_phone, contact_name } = body

    // Validate input
    if (!product_id || !date || !riders?.length || !contact_email) {
      return NextResponse.json(
        { error: 'Vul alle verplichte velden in' },
        { status: 400 }
      )
    }

    // Get product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('active', true)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product niet gevonden' },
        { status: 404 }
      )
    }

    // Classify riders and validate
    const classifiedRiders: Rider[] = []
    let numAdults = 0
    let numChildren = 0

    for (const rider of riders) {
      // Age check
      if (rider.age < product.min_age) {
        return NextResponse.json(
          { error: `${rider.name} is te jong. Minimumleeftijd is ${product.min_age} jaar.` },
          { status: 400 }
        )
      }

      // Weight check
      if (rider.weight > product.max_weight_adult) {
        return NextResponse.json(
          { error: `${rider.name} is te zwaar. Maximum gewicht is ${product.max_weight_adult} kg.` },
          { status: 400 }
        )
      }

      const type = rider.weight <= product.max_weight_child ? 'child' : 'adult'
      if (type === 'adult') numAdults++
      else numChildren++

      classifiedRiders.push({
        name: rider.name,
        age: rider.age,
        weight: rider.weight,
        experience: rider.experience,
        type,
      })
    }

    // Check availability (with race condition protection via DB check)
    const availability = await getAvailability(product_id, date)

    if (availability.blocked) {
      return NextResponse.json(
        { error: 'Deze datum is niet beschikbaar' },
        { status: 400 }
      )
    }

    if (numAdults > availability.adults_available) {
      return NextResponse.json(
        { error: `Niet genoeg plekken voor volwassenen. Er zijn nog ${availability.adults_available} plekken.` },
        { status: 400 }
      )
    }

    if (numChildren > availability.children_available) {
      return NextResponse.json(
        { error: `Niet genoeg plekken voor kinderen. Er zijn nog ${availability.children_available} plekken.` },
        { status: 400 }
      )
    }

    if (numAdults + numChildren > availability.total_available) {
      return NextResponse.json(
        { error: `Niet genoeg plekken. Er zijn nog ${availability.total_available} plekken in totaal.` },
        { status: 400 }
      )
    }

    // Calculate total
    const totalAmount = product.price * classifiedRiders.length

    // Create reservation with pending status
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from('reservations')
      .insert({
        product_id,
        date,
        status: 'pending',
        riders: classifiedRiders,
        num_adults: numAdults,
        num_children: numChildren,
        contact_name: contact_name || classifiedRiders[0]?.name,
        contact_email,
        contact_phone,
        total_amount: totalAmount,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (reservationError || !reservation) {
      console.error('Reservation insert error:', reservationError)
      return NextResponse.json(
        { error: 'Kon reservering niet aanmaken' },
        { status: 500 }
      )
    }

    // Create Mollie payment
    const mollieClient = getMollieClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

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
      description: `${product.name} — ${dateFormatted} — ${classifiedRiders.length} ruiter(s)`,
      redirectUrl: `${appUrl}/boek/bevestiging?id=${reservation.id}`,
      webhookUrl: `${appUrl}/api/webhook/mollie`,
      metadata: {
        reservation_id: reservation.id,
      },
    })

    // Update reservation with Mollie payment ID
    await supabaseAdmin
      .from('reservations')
      .update({ mollie_payment_id: payment.id })
      .eq('id', reservation.id)

    // Return checkout URL
    return NextResponse.json({
      reservation_id: reservation.id,
      checkout_url: payment.getCheckoutUrl(),
    })
  } catch (error) {
    console.error('Reserve error:', error)
    return NextResponse.json(
      { error: 'Er ging iets mis. Probeer het opnieuw.' },
      { status: 500 }
    )
  }
}
