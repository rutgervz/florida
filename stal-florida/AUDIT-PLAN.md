# Stal Florida — QA, Security & Stability Plan

Prepared: 11 June 2026
Scope: full read-only audit of the booking system (code, database, payments, scheduled jobs). No code was changed during this audit.
Codebase audited: branch `develop`, with the live production database and Mollie/cron configuration cross-checked.

---

## 1. Summary for the client

The booking system is well-built at its core: payments are verified server-side against Mollie, bookings use an atomic database lock to prevent double-selling, admin login uses a secure comparison, and user input is validated and HTML-escaped before it reaches emails.

However, the audit found a small number of **serious issues that should be fixed before the next release**, in three areas:

1. **Customer data is currently exposed.** Because of two database access rules, the full customer list (names, emails, phone numbers, and rider details including minors) can be downloaded by anyone, and fake "paid" bookings can be created without paying. This is the most urgent item.
2. **Payment edge cases can take money without delivering a booking.** If a customer pays a few minutes late, they can be charged with no booking made and no automatic refund.
3. **Some reports and pages are silently broken.** The daily sales report always shows zero, the weekly report is shifted a week, and the public terms-and-conditions page currently loads empty during checkout.

None of these require a rebuild. They are well-understood, isolated fixes. The plan below groups them by urgency.

**Risk counts:** 5 critical, 8 high, 8 medium, 10 low (across security and reliability).

---

## 2. Critical issues (fix before the next release)

### C1. Entire customer database is publicly downloadable
The database permission on the reservations table allows public read access. The public API key is, by design, visible in the website's code. Anyone can use it to download every reservation: customer names, emails, phone numbers, and rider details including the names, ages and weights of children.
**Impact:** GDPR/AVG breach, exposure of minors' personal data.
**Fix:** Remove the public read rule. The server already uses a separate privileged key for all legitimate access, so this change breaks nothing.
**Effort:** Small (database rule change).

### C2. Anyone can create free "confirmed" bookings
A second database rule allows the public key to insert reservations directly, bypassing payment entirely. An attacker could create free confirmed rides or fill every available slot to block real customers.
**Impact:** Lost revenue, denial of bookings.
**Fix:** Remove the public insert rule (same root cause as C1).
**Effort:** Small.

### C3. Guide phone numbers are exposed the same way
The guides table is publicly readable, including phone numbers, even though the website itself only shows names.
**Fix:** Restrict the readable data to names only.
**Effort:** Small.

### C4. Confirmation emails are silently failing on the test branch
A fix that exists on the production branch has not been carried over to the development branch. On the development branch, online bookings store rider data in the wrong format, the confirmation email crashes silently, and **no confirmation email is sent**. The production database already contains 19 affected records (5 of them confirmed bookings), and the confirmation page crashes for those customers.
**Impact:** Customers pay and receive no confirmation; existing affected records.
**Fix:** Carry the existing production fix over to development, add a shared helper so this cannot regress again, and clean up the 19 affected records.
**Effort:** Small.

### C5. Paying late charges the customer with no booking and no refund
A booking is held for 15 minutes. The Mollie payment screen has no matching time limit, so a customer who pays after 15 minutes is charged, but the booking has already expired. The system silently does nothing — no booking, no confirmation, no refund. There is currently no refund logic anywhere in the system.
**Impact:** Customer charged for nothing; manual refunds required; reputational risk.
**Fix:** Give the payment the same 15-minute limit, and when a late payment does arrive, either re-confirm if a spot is still free or refund automatically and alert the owner.
**Effort:** Medium.

---

## 3. High-priority issues (this sprint)

### H1. Booking can still be over-sold at the expiry boundary
When a late payment is confirmed, the system does not re-check whether a spot is still available, and the cleanup job only runs every 5 minutes. In a narrow window this can place more riders than there are horses.
**Fix:** Re-check capacity (with a lock) before confirming a late payment; refund if full.
**Effort:** Medium.

### H2. Payment confirmations can be permanently lost on a temporary glitch
When the payment-confirmation webhook hits a temporary database or network error, the system tells Mollie "received OK", so Mollie never retries. The customer has paid, but the booking is never confirmed and later expires.
**Fix:** Return an error code on temporary failures so Mollie retries automatically (it retries for up to ~26 hours).
**Effort:** Small to medium.

### H3. The public terms-and-conditions page is currently empty
The most recent change added a login requirement to the settings endpoint, but the public terms page reads from that same endpoint without logging in. It now loads with empty terms — and this page is linked from the payment step.
**Fix:** Serve the terms text through a public route.
**Effort:** Small.

### H4. The daily sales report always shows zero
A leftover line in the daily report query makes it fail, so the owner's daily email always reports "no sales yesterday" and €0, regardless of actual bookings.
**Fix:** Remove the one faulty line.
**Effort:** Small (one line).

### H5. The weekly report is shifted one week into the past
The weekly email labels last week's finished rides as "the coming week" and reports revenue from the week before. Staffing decisions are made from rides that already happened.
**Fix:** Correct the week calculation.
**Effort:** Small.

### H6. Payments can fail in one environment due to configuration mismatch
The payment code reads environment settings that are not documented and differ from what the documentation describes. An environment set up per the documentation will fail every payment.
**Fix:** Align the code with the documented single payment key, and update the documentation.
**Effort:** Small.

### H7. A fallback path can bypass the anti-double-booking protection
If the main booking function errors for any non-capacity reason, the code falls back to a direct insert with no capacity check or lock — exactly the situation the protected path exists to prevent. It also hides configuration errors.
**Fix:** Remove the fallback; report the error instead.
**Effort:** Small.

### H8. The database structure is not fully reproducible from the code
The core booking function and several columns exist only in the live database, not in the committed setup files. Following the documented setup steps produces a broken database (failed bookings, errors on key admin actions).
**Fix:** Export the real database structure and functions into committed setup files.
**Effort:** Medium.

---

## 4. Medium-priority issues (plan in)

- **M1. Login is brute-force-able.** The rate limit can be bypassed by spoofing a header, and it resets frequently because it is stored per-server-instance. Combined with the login design (below), a weak admin password is a real risk. Fix: use a trusted source for the visitor address and a shared store; keep a strong password.
- **M2. Login design hands out the master password as the access token.** The login returns the admin password itself as the session token, with no expiry and no way to revoke it if leaked. Fix: issue a separate, expiring token.
- **M3. Guide sign-up/withdrawal has no identity check.** Anyone can sign any guide up for, or remove them from, any ride. Fix: require a per-guide token or move behind admin login.
- **M4. Scheduled-jobs endpoint can be reached if its secret is unset.** A missing secret makes the endpoint open, including a function that sends SMS to every guide. Fix: refuse to run if the secret is not configured.
- **M5. Reservation lookup exposes rider details by ID with no login,** and the ID travels in the URL where it can leak via browser history/referrers. Fix: treat the ID as a private key and minimise the data returned.
- **M6. Child-capacity limit is not enforced.** It is possible to book more children than there are child ponies for some products. Fix: enforce the same limit everywhere.
- **M7. Offline (admin) bookings skip validation and time-slot checks,** which can over-sell a specific time slot. Fix: validate the time slot and run the same checks as the public flow.
- **M8. Daily report uses mismatched time zones,** so late-night bookings land in the wrong day. Fix: use Amsterdam time boundaries consistently.

---

## 5. Lower-priority and housekeeping (nice to have)

- Refunds and chargebacks are ignored — a refunded booking stays "confirmed" and the owner is not told.
- Duplicate payment notifications can occasionally send two confirmation emails.
- Scheduled job times are 1–2 hours later than documented (guide SMS reminders go out late).
- Several date calculations assume the server's time zone; correct on the current hosting but fragile, and they conflict with the project's own time-zone rule.
- No dependency lock file is committed, so each deployment re-resolves library versions — a bad third-party release could break production with no code change. **Recommend fixing early; low effort, removes a class of surprise outages.**
- 4 known security advisories in dependencies (3 high), mostly resolved by upgrading the payment library and Next.js. Not urgent on the current hosting, but should be scheduled.
- The admin dashboard is one large file that parses booking data unsafely while rendering — a single bad record can blank the whole dashboard. Recommend splitting and hardening.
- No automated tests and the linter is not configured. Recommend adding tests for the booking-capacity and validation logic (the parts that lose money when wrong) and a working lint setup for CI.

---

## 6. Recommended sequence

**Step 1 — Before the next release (1–2 days):**
C1, C2, C3 (database access rules), C4 (confirmation emails), H3 (terms page), H4 (daily report), H6 (payment config). These are mostly small, high-impact fixes.

**Step 2 — Payment robustness (2–4 days):**
C5, H1, H2, H7 (late payments, refunds, retries, over-sell protection).

**Step 3 — Hardening (3–5 days):**
M1–M8, commit a dependency lock file, export the real database structure (H8), add automated tests for the critical logic.

**Step 4 — Scheduled maintenance:**
Dependency upgrades (payment library, Next.js), admin dashboard refactor, time-zone clean-up.

---

## 7. What was verified as working correctly

So the client has a balanced picture, the following were checked and found sound:

- Payments are genuinely verified server-side against Mollie (the system cannot be tricked into confirming an unpaid booking via a forged notification).
- The core booking function correctly locks each product to prevent simultaneous double-selling.
- Admin login uses a secure, timing-safe password comparison.
- User input is validated and HTML-escaped before being placed into emails (no email-injection found).
- Every admin endpoint checks authentication on every method.
- Failed-payment cleanup correctly releases the held spot.

---

*This document is a point-in-time assessment of the code and configuration as of 11 June 2026. Item references (C#, H#, M#) map to the detailed engineering findings and can be turned into individual tickets on request.*
