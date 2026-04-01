import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { escapeHtml } from '@/lib/validation'

const resend = new Resend(process.env.RESEND_API_KEY)
const REPORT_EMAIL = 'stalflorida@gmail.com'

function fmt(d: Date) { return d.toISOString().split('T')[0] }

function getMonday(d: Date) {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

async function sendGuideSMS(phone: string, message: string) {
  const apiKey = process.env.SPRYNG_API_KEY
  if (!apiKey) {
    console.log('Spryng not configured, skipping SMS to', phone)
    return
  }
  try {
    // Format phone: remove leading 0, add 31 country code
    let recipient = phone.replace(/[\s\-()]/g, '')
    if (recipient.startsWith('0')) recipient = '31' + recipient.substring(1)
    if (recipient.startsWith('+')) recipient = recipient.substring(1)

    const res = await fetch('https://rest.spryngsms.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        encoding: 'auto',
        body: message,
        route: 'business',
        originator: 'StalFlorida',
        recipients: [recipient],
      }),
    })
    if (!res.ok) {
      console.error('Spryng SMS error:', res.status, await res.text())
    }
  } catch (err) {
    console.error('SMS error to', phone, err)
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'daily'

  try {
    const now = new Date()

    if (type === 'daily') {
      await sendDailyReport(now)
      await sendGuideReminders(now)
    } else if (type === 'weekly') {
      await sendWeeklyReport(now)
    }

    return NextResponse.json({ sent: true, type })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

async function sendDailyReport(now: Date) {
  const today = fmt(now)
  const yesterday = fmt(new Date(now.getTime() - 86400000))

  // Yesterday's sales
  const { data: yesterdaySales } = await supabaseAdmin
    .from('reservations').select('*, products(name, icon, start_time)')
    .eq('confirmed_at', undefined) // we'll filter by date instead
    .gte('created_at', yesterday + 'T00:00:00')
    .lt('created_at', today + 'T00:00:00')
    .in('status', ['confirmed', 'offline'])

  // Today's rides
  const { data: todayRides } = await supabaseAdmin
    .from('reservations').select('*, products(name, icon, start_time)')
    .eq('date', today)
    .in('status', ['confirmed', 'offline'])
    .order('time_slot', { ascending: true })

  const yesterdayRevenue = (yesterdaySales || []).reduce((s, b) => s + parseFloat(b.total_amount), 0)
  const todayRiders = (todayRides || []).reduce((s, b) => s + (b.riders?.length || 0), 0)

  const dateFormatted = new Date(today).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  let ridesHtml = ''
  if (todayRides && todayRides.length > 0) {
    ridesHtml = todayRides.map(b => {
      const time = b.time_slot ? b.time_slot.substring(0, 5) : (b.products?.start_time ? b.products.start_time.substring(0, 5) : '')
      const riderNames = (b.riders || []).map((r: any) => escapeHtml(r.name) + ' (' + r.age + 'jr, ' + r.weight + 'kg)').join(', ')
      const statusLabel = b.status === 'offline' ? ' [offline]' : ''
      return '<tr><td style="padding:8px;border-bottom:1px solid #eee">' + time + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #eee">' + escapeHtml(b.products?.icon + ' ' + b.products?.name) + statusLabel + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #eee">' + riderNames + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #eee">EUR ' + parseFloat(b.total_amount).toFixed(0) + '</td></tr>'
    }).join('')
  } else {
    ridesHtml = '<tr><td colspan="4" style="padding:16px;text-align:center;color:#999">Geen ritten vandaag</td></tr>'
  }

  let salesHtml = ''
  if (yesterdaySales && yesterdaySales.length > 0) {
    salesHtml = yesterdaySales.map(b => {
      const rideDate = new Date(b.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
      return '<tr><td style="padding:6px;border-bottom:1px solid #eee">' + escapeHtml(b.products?.icon + ' ' + b.products?.name) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">' + rideDate + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">' + escapeHtml(b.contact_name || '') + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">EUR ' + parseFloat(b.total_amount).toFixed(0) + '</td></tr>'
    }).join('')
  } else {
    salesHtml = '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999">Geen verkopen gisteren</td></tr>'
  }

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#2D6A7A;color:white;padding:20px;border-radius:12px 12px 0 0">' +
    '<h1 style="margin:0;font-size:20px">Stal Florida - Dagoverzicht</h1>' +
    '<p style="margin:4px 0 0;opacity:0.8">' + dateFormatted + '</p></div>' +
    '<div style="padding:20px;background:#f5f5f5">' +
    '<h2 style="font-size:16px;color:#333">Ritten vandaag (' + todayRiders + ' ruiters)</h2>' +
    '<table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">' +
    '<tr style="background:#f0f0f0"><th style="padding:8px;text-align:left">Tijd</th><th style="padding:8px;text-align:left">Rit</th><th style="padding:8px;text-align:left">Ruiters</th><th style="padding:8px;text-align:left">Bedrag</th></tr>' +
    ridesHtml + '</table>' +
    '<h2 style="font-size:16px;color:#333;margin-top:20px">Verkopen gisteren (EUR ' + yesterdayRevenue.toFixed(0) + ')</h2>' +
    '<table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">' +
    '<tr style="background:#f0f0f0"><th style="padding:6px;text-align:left">Rit</th><th style="padding:6px;text-align:left">Datum</th><th style="padding:6px;text-align:left">Naam</th><th style="padding:6px;text-align:left">Bedrag</th></tr>' +
    salesHtml + '</table>' +
    '</div></div>'

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Stal Florida <boekingen@boerderijflorida.nl>',
    to: REPORT_EMAIL,
    subject: 'Dagoverzicht ' + dateFormatted + ' - ' + todayRiders + ' ruiters',
    html,
  })
}

async function sendWeeklyReport(now: Date) {
  const monday = getMonday(now)
  const lastMonday = new Date(monday); lastMonday.setDate(lastMonday.getDate() - 7)
  const lastSunday = new Date(monday); lastSunday.setDate(lastSunday.getDate() - 1)
  const nextSunday = new Date(monday); nextSunday.setDate(nextSunday.getDate() + 6)

  // Last week's sales
  const { data: lastWeekSales } = await supabaseAdmin
    .from('reservations').select('*, products(name, icon)')
    .gte('date', fmt(lastMonday)).lte('date', fmt(lastSunday))
    .in('status', ['confirmed', 'offline'])

  // Next week's rides
  const { data: nextWeekRides } = await supabaseAdmin
    .from('reservations').select('*, products(name, icon, start_time)')
    .gte('date', fmt(monday)).lte('date', fmt(nextSunday))
    .in('status', ['confirmed', 'offline'])
    .order('date', { ascending: true }).order('time_slot', { ascending: true })

  const lastWeekRevenue = (lastWeekSales || []).reduce((s, b) => s + parseFloat(b.total_amount), 0)
  const lastWeekRiders = (lastWeekSales || []).reduce((s, b) => s + (b.riders?.length || 0), 0)
  const nextWeekRiders = (nextWeekRides || []).reduce((s, b) => s + (b.riders?.length || 0), 0)

  const weekLabel = 'Week ' + fmt(monday) + ' t/m ' + fmt(nextSunday)

  let nextWeekHtml = ''
  if (nextWeekRides && nextWeekRides.length > 0) {
    nextWeekHtml = nextWeekRides.map(b => {
      const dayStr = new Date(b.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
      const time = b.time_slot ? b.time_slot.substring(0, 5) : (b.products?.start_time ? b.products.start_time.substring(0, 5) : '')
      const riderCount = (b.riders || []).length
      return '<tr><td style="padding:6px;border-bottom:1px solid #eee">' + dayStr + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">' + time + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">' + escapeHtml(b.products?.icon + ' ' + b.products?.name) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid #eee">' + riderCount + ' ruiters</td></tr>'
    }).join('')
  } else {
    nextWeekHtml = '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999">Geen ritten komende week</td></tr>'
  }

  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#2D5A3A;color:white;padding:20px;border-radius:12px 12px 0 0">' +
    '<h1 style="margin:0;font-size:20px">Stal Florida - Weekoverzicht</h1>' +
    '<p style="margin:4px 0 0;opacity:0.8">' + weekLabel + '</p></div>' +
    '<div style="padding:20px;background:#f5f5f5">' +
    '<h2 style="font-size:16px;color:#333">Afgelopen week</h2>' +
    '<div style="background:white;padding:16px;border-radius:8px;margin-bottom:16px">' +
    '<p style="margin:0"><strong>' + (lastWeekSales || []).length + '</strong> boekingen - <strong>' + lastWeekRiders + '</strong> ruiters - <strong>EUR ' + lastWeekRevenue.toFixed(0) + '</strong></p></div>' +
    '<h2 style="font-size:16px;color:#333">Komende week (' + nextWeekRiders + ' ruiters)</h2>' +
    '<table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">' +
    '<tr style="background:#f0f0f0"><th style="padding:6px;text-align:left">Dag</th><th style="padding:6px;text-align:left">Tijd</th><th style="padding:6px;text-align:left">Rit</th><th style="padding:6px;text-align:left">Ruiters</th></tr>' +
    nextWeekHtml + '</table>' +
    '</div></div>'

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Stal Florida <boekingen@boerderijflorida.nl>',
    to: REPORT_EMAIL,
    subject: 'Weekoverzicht - ' + lastWeekRiders + ' ruiters, EUR ' + lastWeekRevenue.toFixed(0),
    html,
  })
}

async function sendGuideReminders(now: Date) {
  const today = fmt(now)

  // Get today's guide assignments with product info
  const { data: assignments } = await supabaseAdmin
    .from('guide_assignments')
    .select('product_id, date, time_slot, guides(name, phone), products(name, icon, start_time)')
    .eq('date', today)

  if (!assignments || assignments.length === 0) return

  // Group by guide
  const guideRides: Record<string, { name: string; phone: string; rides: string[] }> = {}

  for (const a of assignments) {
    const guide = a.guides as any
    const product = a.products as any
    if (!guide || !guide.phone || !product) continue

    if (!guideRides[guide.phone]) {
      guideRides[guide.phone] = { name: guide.name, phone: guide.phone, rides: [] }
    }

    const time = a.time_slot ? a.time_slot.substring(0, 5) : (product.start_time ? product.start_time.substring(0, 5) : '')
    guideRides[guide.phone].rides.push(time + ' ' + product.icon + ' ' + product.name)
  }

  const dateLabel = new Date(today).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  for (const g of Object.values(guideRides)) {
    const msg = 'Hoi ' + g.name + '! Je ritten vandaag (' + dateLabel + '):\n' + g.rides.join('\n') + '\n\nStal Florida'
    await sendGuideSMS(g.phone, msg)
  }
}
