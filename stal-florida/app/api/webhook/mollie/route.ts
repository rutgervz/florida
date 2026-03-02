import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMollieClient } from '@/lib/mollie'
import { sendConfirmationEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const paymentId = body.get('id') as string

    if (!paymentId) {
      return NextResponse.json({ error: 'Missing payment ID' }, { status: 400 })
    }

    // Fetch payment status from Mollie
    const mollieClient = getMollieClient()
    const payment = await mollieClient.payments.get(paymentId)
    const reservationId = (payment.metadata as any)?.reservation_id

    if (!reservationId) {
      console.error('No reservation_id in payment metadata:', paymentId)
      return NextResponse.json({ error: 'No reservation ID' }, { status: 400 })
    }

    // Get reservation
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('*, products(*)')
      .eq('id', reservationId)
      .single()

    if (!reservation) {
      console.error('Reservation not found:', reservationId)
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    // Handle payment status
    if (payment.status === 'paid') {
      // Update reservation to confirmed
      await supabaseAdmin
        .from('reservations')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', reservationId)

      // Send confirmation email
      const product = reservation.products
      if (product && reservation.contact_email) {
        try {
          await sendConfirmationEmail({
            to: reservation.contact_email,
            productName: product.name,
            productIcon: product.icon,
            date: reservation.date,
            startTime: product.start_time?.substring(0, 5),
            arriveTime: product.arrive_time?.substring(0, 5) || product.start_time?.substring(0, 5),
            duration: product.duration_minutes,
            riders: reservation.riders,
            totalAmount: parseFloat(reservation.total_amount),
            warning: product.warning || undefined,
          })
        } catch (emailError) {
          // Log but don't fail - payment is already confirmed
          console.error('Email send error:', emailError)
        }
      }
    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      // Mark reservation as expired (frees up slots)
      await supabaseAdmin
        .from('reservations')
        .update({ status: 'expired' })
        .eq('id', reservationId)
    }

    // Always return 200 to Mollie
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    // Still return 200 to prevent Mollie retries on server errors
    return NextResponse.json({ received: true })
  }
}
