'use client'

export default function VoorwaardenPage() {
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
        <iframe
          src="/voorwaarden.pdf"
          className="w-full border border-gray-200 rounded-xl"
          style={{ height: '80vh' }}
          title="Algemene Voorwaarden Stal Florida"
        />
        <p className="text-sm text-gray-400 mt-4 text-center">
          <a href="/voorwaarden.pdf" download className="underline">Download als PDF</a>
        </p>
      </main>
    </div>
  )
}
