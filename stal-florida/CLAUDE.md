# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stal Florida is a horse riding booking system for an equestrian center on Schiermonnikoog (Netherlands). Built with Next.js 14 App Router + TypeScript, Supabase (PostgreSQL), Mollie payments, Resend email, and Spryng SMS. UI is entirely in Dutch.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # ESLint
npm run start    # Start production server
```

No test framework is configured.

## Branch Strategy

`main` deploys to production. `develop` deploys to Vercel preview with separate test environment variables. All new features are developed on `develop` and merged to `main` when ready.

## Code Conventions

Never use `toISOString()` client-side — use local CET formatting via `Intl.DateTimeFormat` with `Europe/Amsterdam`. Never use `downlevelIteration`; iterate over Map/Set with `.forEach()`. Always deliver complete files, not diffs. No dash bullets in documentation or comments.

## Architecture

### API Routes (`/app/api/`)

**Public (no auth):**
- `POST /api/reserve` — Create pending reservation + Mollie payment (rate-limited: 15 req/min)
- `GET /api/availability` — Slot availability for single date or date range
- `GET /api/guides` — Active staff list
- `POST /api/webhook/mollie` — Payment confirmation webhook

**Admin (Bearer token in `Authorization` header):**
- `/api/admin/products`, `/bookings`, `/guides`, `/guide-assignments`, `/block-date`, `/settings`
- Auth via `Authorization: Bearer <ADMIN_PASSWORD>` — validated in `lib/auth.ts` using timing-safe comparison

**Cron (CRON_SECRET header, production only):**
- `GET /api/cron?type=daily` — Cleanup expired reservations + daily SMS/email report (runs 6 AM CET)
- `GET /api/cron?type=weekly` — Weekly revenue report (runs Sunday 6 PM CET)

### Key Library Files (`/lib/`)

- `availability.ts` — Core business logic: calculates available slots accounting for capacity, blocked dates, pending reservations with expiry, and product constraints (age, weight, adult/child separation)
- `validation.ts` — All input sanitization/validation; use these helpers for any user-facing inputs
- `auth.ts` — Admin token verification (timing-safe)
- `supabase.ts` — Two clients: `supabase` (anon key, client-safe) and `supabaseAdmin` (service role, server-only)
- `email.ts` — Email templates via Resend
- `mollie.ts` — Payment client setup
- `rate-limit.ts` — IP-based rate limiting

### Database

Supabase PostgreSQL with RLS enabled. Key tables:
- **products** — Riding packages with capacity (`slots_adult`, `slots_child`, `slots_total`), constraints (age, weight), schedule (`available_days` bitmask, optional `time_slots[]`)
- **reservations** — Bookings with `status`: `pending` (15-min expiry) → `confirmed` / `expired` / `cancelled` / `offline`; riders stored as JSONB array
- **blocked_dates** — Full blackouts or partial capacity reductions per product or global
- **guides** + **guide_assignments** — Staff management, linked to date/timeslot/product

Atomic reservation creation uses Supabase RPC `create_reservation_atomic` to prevent race conditions.

### Booking Flow

1. `/boek` — Product → date/time → rider details → contact info
2. `POST /api/reserve` → validates → creates pending reservation → Mollie checkout URL
3. User pays → Mollie webhook → status updated to `confirmed` → confirmation email sent
4. `/boek/bevestiging` — Confirmation page

### Admin Dashboard (`/app/admin/`)

Client-side React with `Authorization: Bearer` header on all API calls. Token stored in `localStorage`. Tabs: Dashboard, Planning (week view), Bookings, Offline bookings, Products, Staff, Settings, Terms.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # Server-side only
NEXT_PUBLIC_APP_URL              # For Mollie redirect URLs
ADMIN_PASSWORD                   # Admin API Bearer token
CRON_SECRET                      # Vercel Cron authorization (production only)
RESEND_API_KEY
EMAIL_FROM                       # Sender address (fallback: noreply@stalflorida.nl)
MOLLIE_API_KEY                   # test_... for develop, live_... for main
SPRYNG_API_KEY                   # SMS for guide reminders (optional)
```

## Test Environment Setup (Vercel)

Vercel deploys every push to `develop` as a preview deployment. To give preview deployments their own isolated data:

1. Create a second Supabase project (bijv. "stal-florida-test") and run the migrations from `/supabase/` on it.
2. In the Vercel dashboard → Project Settings → Environment Variables, add each variable twice: once scoped to **Production** (pointing to the live Supabase project and live Mollie key) and once scoped to **Preview** (pointing to the test Supabase project and Mollie `test_` key).
3. Set `NEXT_PUBLIC_APP_URL` for Preview to the Vercel preview URL pattern or leave it empty — Mollie redirects will use the auto-generated preview URL.
4. Cron jobs defined in `vercel.json` only run on production deployments, so the test environment will never trigger scheduled tasks automatically.
