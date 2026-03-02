# Stal Florida — Reserveringssysteem

Online boekingssysteem voor Stal Florida op Schiermonnikoog.
Gasten boeken en betalen direct online. De stal beheert alles via een admin-paneel.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Betalingen**: Mollie (iDEAL)
- **E-mail**: Resend
- **Hosting**: Vercel

## Setup in 6 stappen

### 1. Clone & installeer

```bash
git clone https://github.com/jouw-username/stal-florida-booking.git
cd stal-florida-booking
npm install
```

### 2. Database inrichten

1. Ga naar [Supabase Dashboard](https://supabase.com/dashboard)
2. Open je project → SQL Editor
3. Plak de inhoud van `supabase/migration.sql` en klik **Run**
4. Dit maakt alle tabellen aan en voegt de strandrit + bosrit toe als startdata

**Cron job voor verlopen reserveringen:**
1. Ga naar Database → Extensions → enable `pg_cron`
2. Voer uit in SQL Editor:
```sql
SELECT cron.schedule('expire-pending', '*/5 * * * *', 'SELECT expire_pending_reservations()');
```

### 3. Environment variables

Kopieer `.env.example` naar `.env.local` en vul in:

```bash
cp .env.example .env.local
```

**Waar vind je de waarden:**

| Variable | Waar te vinden |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (GEHEIM!) |
| `MOLLIE_API_KEY` | Mollie Dashboard → Developers → API keys → Live |
| `MOLLIE_TEST_API_KEY` | Mollie Dashboard → Developers → API keys → Test |
| `RESEND_API_KEY` | Resend Dashboard → API Keys |
| `ADMIN_PASSWORD` | Kies zelf een sterk wachtwoord |

### 4. Lokaal testen

```bash
npm run dev
```

Open http://localhost:3000 voor de boekingsflow.

**Mollie testen:** Zorg dat `MOLLIE_LIVE=false` in `.env.local`. Mollie test mode accepteert nep-betalingen.

**Webhook lokaal testen:** Gebruik [ngrok](https://ngrok.com) om je localhost bereikbaar te maken:
```bash
ngrok http 3000
```
Zet de ngrok URL als `NEXT_PUBLIC_APP_URL` in `.env.local`.

### 5. Deploy naar Vercel

1. Push naar GitHub
2. Ga naar [vercel.com](https://vercel.com) → New Project → Import je repo
3. Voeg ALLE environment variables toe (Settings → Environment Variables)
4. Zet `MOLLIE_LIVE=true` voor productie
5. Zet `NEXT_PUBLIC_APP_URL=https://reserveren.boerderijflorida.nl`
6. Deploy

### 6. DNS instellen (TransIP)

1. Ga naar TransIP → Domeinen → boerderijflorida.nl → DNS
2. Voeg toe:

| Type | Naam | Waarde |
|---|---|---|
| CNAME | reserveren | cname.vercel-dns.com |

3. In Vercel: Settings → Domains → Add `reserveren.boerderijflorida.nl`
4. Vercel regelt automatisch het SSL certificaat

### 7. Resend domein verifiëren

1. Ga naar Resend → Domains → Add Domain → `boerderijflorida.nl`
2. Voeg de DNS records toe die Resend je geeft (MX + TXT) in TransIP
3. Klik op Verify in Resend

## Admin paneel

Ga naar `/admin` en log in met het `ADMIN_PASSWORD`.

**Functies:**
- Planning weekoverzicht
- Producten beheren (toevoegen, bewerken, activeren/deactiveren)
- Reserveringen inzien
- Dagen blokkeren

## Kosten

| Component | Kosten |
|---|---|
| Vercel | Gratis (Hobby plan) |
| Supabase | Gratis (tot 500MB) |
| Resend | Gratis (tot 3000 emails/maand) |
| Mollie | €0,29 per iDEAL transactie |

## Architectuur

```
Gast boekt → POST /api/reserve
  → Check beschikbaarheid (Supabase)
  → Maak reservering (status: pending, verloopt na 15 min)
  → Maak Mollie payment
  → Redirect naar Mollie checkout

Gast betaalt → Mollie webhook → POST /api/webhook/mollie
  → Betaling geslaagd? → status: confirmed + bevestigingsmail
  → Betaling mislukt? → status: expired (plekken vrijgegeven)

Cron job (elke 5 min)
  → Verloopt pending reserveringen > 15 min (plekken vrijgegeven)
```
