'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface ReservationData {
  id: string
  status: string
  date: string
  riders: any[]
  total_amount: number
  contact_email: string
  products: {
    name: string
    icon: string
    start_time: string
    arrive_time: string
    duration_minutes: number
  }
}

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('id')
  const [reservation, setReservation] = useState<ReservationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (!reservationId) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/reservations?id=eq.${reservationId}&select=*,products(name,icon,start_time,arrive_time,duration_minutes)`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
        )
        const data = await res.json()
        if (data?.[0]) {
          setReservation(data[0])
          setLoading(false)
          if (data[0].status === 'confirmed' || data[0].status === 'expired') {
            setPolling(false)
            clearInterval(interval)
          }
        }
      } catch (err) {
        console.error(err)
      }
    }, 2000)

    setTimeout(() => {
      setPolling(false)
      clearInterval(interval)
    }, 60000)

    return () => clearInterval(interval)
  }, [reservationId])

  if (loading) {
    return (
      <div classNam
