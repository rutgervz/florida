import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stal Florida — Paardrijden op Schiermonnikoog',
  description: 'Boek je strandrit of bosrit bij Stal Florida op Schiermonnikoog. Online reserveren en direct betalen.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="bg-cream min-h-screen">
        {children}
      </body>
    </html>
  )
}
