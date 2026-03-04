import { Resend } from 'resend'
import { escapeHtml } from './validation'

const resend = new Resend(process.env.RESEND_API_KEY)

interface Rider {
  name: string
  age: number
  weight: number
  experience: string
  type: 'adult' | 'child'
}

interface BookingEmailData {
  to: string
  productName: string
  productIcon: string
  date: string
  startTime: string
  arriveTime: string
  duration: number
  riders: Rider[]
  totalAmount: number
  warning?: string
}

export async function sendConfirmationEmail(data: BookingEmailData) {
  const dateFormatted = new Date(data.date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Escape ALL user-provided content
  const safeName = escapeHtml(data.productName)
  const safeIcon = escapeHtml(data.productIcon)
  const safeWarning = data.warning ? escapeHtml(data.warning) : ''

  const ridersHtml = data.riders.map(r => {
    const safeName = escapeHtml(r.name)
    const typeLabel = r.type === 'adult' ? 'Volwassen paard' : 'Kinderpaard'
    return '<div class="rider"><strong>' + safeName + '</strong> - ' + r.age + ' jr - ' + r.weight + ' kg - ' + typeLabel + '</div>'
  }).join('')

  const html = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><style>' +
    'body { font-family: Georgia, serif; color: #1A1A1A; max-width: 600px; margin: 0 auto; padding: 20px; }' +
    '.header { background: #2D6A7A; color: white; padding: 24px; border-radius: 12px 12px 0 0; }' +
    '.header h1 { margin: 0; font-size: 24px; }' +
    '.header p { margin: 4px 0 0; opacity: 0.8; font-size: 14px; }' +
    '.body { background: #F5F2ED; padding: 24px; border-radius: 0 0 12px 12px; }' +
    '.detail { margin: 16px 0; }' +
    '.label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; font-family: Calibri, sans-serif; }' +
    '.value { font-size: 16px; margin-top: 4px; }' +
    '.total { font-size: 28px; font-weight: bold; color: #2D6A7A; }' +
    '.warning { background: #FFF5F0; border-left: 4px solid #7A4A2D; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #7A4A2D; border-radius: 0 8px 8px 0; }' +
    '.footer { margin-top: 24px; padding: 16px; background: #1A1A1A; color: #A09888; border-radius: 12px; font-size: 13px; font-family: Calibri, sans-serif; }' +
    '.rider { background: white; padding: 10px 14px; border-radius: 8px; margin: 4px 0; font-size: 14px; font-family: Calibri, sans-serif; }' +
    '</style></head><body>' +
    '<div class="header">' +
    '<h1>' + safeIcon + ' ' + safeName + '</h1>' +
    '<p>' + escapeHtml(dateFormatted) + '</p>' +
    '</div>' +
    '<div class="body">' +
    '<div class="detail"><div class="label">Starttijd</div>' +
    '<div class="value">' + escapeHtml(data.startTime) + ' uur (' + data.duration + ' minuten)</div></div>' +
    '<div class="detail"><div class="label">Aanwezig om</div>' +
    '<div class="value" style="color: #CC4444; font-weight: bold;">' + escapeHtml(data.arriveTime) + ' uur</div></div>' +
    '<div class="detail"><div class="label">Ruiters</div>' + ridersHtml + '</div>' +
    '<div class="detail"><div class="label">Totaal betaald</div>' +
    '<div class="total">EUR ' + data.totalAmount.toFixed(2) + '</div></div>' +
    (safeWarning ? '<div class="warning">' + safeWarning + '</div>' : '') +
    '</div>' +
    '<div class="footer">' +
    '<strong>Stal Florida</strong><br>' +
    'Reddingsweg 38, Schiermonnikoog<br>' +
    'Tel: 06 41 91 87 02<br><br>' +
    'Deze reservering is niet annuleerbaar.' +
    '</div></body></html>'

  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'Stal Florida <boekingen@boerderijflorida.nl>',
    to: data.to,
    subject: 'Bevestiging ' + safeName + ' - ' + dateFormatted,
    html,
  })
}
