'use client'

import { useState, useEffect } from 'react'

export default function VoorwaardenPage() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/voorwaarden')
      .then(r => r.json())
      .then(data => { setText(data.voorwaarden || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-gray-900 text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <span className="font-serif text-lg">Stal Florida</span>
          <a href="/boek" className="text-sm text-gray-400 hover:text-white">Terug naar boeken</a>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-serif mb-6">Algemene Voorwaarden</h1>
        {loading ? (
          <p className="text-gray-400">Laden...</p>
        ) : (
          <div className="prose prose-gray max-w-none">
            {text.split('\n').map((line, i) => (
              line.trim() === '' ? <br key={i} /> :
              line.match(/^\d+\./) ? <h3 key={i} className="text-lg font-serif mt-6 mb-2">{line}</h3> :
              line === line.toUpperCase() && line.length > 5 ? <h2 key={i} className="text-xl font-serif mt-8 mb-3">{line}</h2> :
              <p key={i} className="text-gray-600 mb-2">{line}</p>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
