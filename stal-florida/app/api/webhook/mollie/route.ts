import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMollieClient } from '@/lib/mollie'
import { sendConfirmationEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const paymentId = body.get('id') as string

    if (!paymentId || typeof paymentId !== 'string' || paymentId.length > 100) {
      return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 })
    }

    // Fetch payment from Mollie to verify authenticity
    // This is the recommended way to validate webhooks:
    // we don't trust the webhook payload, we fetch the payment from Mollie directly
    const mollieClient = getMollieClient()
    let payment
    try {
      payment = await mollieClient.payments.get(paymentId)
    } catch (mollieError) {
      console.error('Could not fetch payment from Mollie:', paymentId, mollieError)
      return NextResponse.json({ received: true })
    }

    const reservationId = (payment.metadata as any)?.reservation_id
    if (!reservationId || typeof reservationId !== 'string') {
      console.error('No reservation_id in payment metadata:', paymentId)
      return NextResponse.json({ received: true })
    }

    // Get reservation
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('*, products(*)')
      .eq('id', reservationId)
      .single()

    if (!reservation) {
      console.error('Reservation not found:', reservationId)
      return NextResponse.json({ received: true })
    }

    // Verify the payment amount matches the reservation (prevent manipulation)
    const paymentAmount = parseFloat(payment.amount.value)
    const reservationAmount = parseFloat(reservation.total_amount)
    if (Math.abs(paymentAmount - reservationAmount) > 0.01) {
      console.error('Amount mismatch:', { paymentAmount, reservationAmount, reservationId })
      return NextResponse.json({ received: true })
    }

    // Handle payment status
    if (payment.status === 'paid') {
      // Only update if still pending (idempotency)
      if (reservation.status === 'pending') {
        await supabaseAdmin
          .from('reservations')
          .update({
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', reservationId)
          .eq('status', 'pending') // extra safety: only update if still pending

        // Send confirmation email
        const product = reservation.products
        if (product && reservation.contact_email) {
          try {
            await sendConfirmationEmail({
              to: reservation.contact_email,
              productName: product.name,
              productIcon: product.icon,
              date: reservation.date,
              startTime: product.start_time ? product.start_time.substring(0, 5) : '',
              arriveTime: product.arrive_time ? product.arrive_time.substring(0, 5) : (product.start_time ? product.start_time.substring(0, 5) : ''),
              duration: product.duration_minutes,
              riders: reservation.riders,
              totalAmount: reservationAmount,
              warning: product.warning || undefined,
            })
          } catch (emailError) {
            console.error('Email send error:', emailError)
          }
        }
      }
    } else if (['failed', 'canceled', 'expired'].includes(payment.status)) {
      // Only expire if still pending
      if (reservation.status === 'pending') {
        await supabaseAdmin
          .from('reservations')
          .update({ status: 'expired' })
          .eq('id', reservationId)
          .eq('status', 'pending')
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
