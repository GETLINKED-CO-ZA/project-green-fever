# Project Green Fever: Reporting System

Public-space reporting form for LINK. Static form + one Vercel serverless endpoint, with Supabase (database + private file storage) and Resend (email).

## Files
| Path | Purpose |
|---|---|
| `public/index.html` | The form (HTML, CSS, JS in one file) |
| `api/submit.js` | Server endpoint: validation, anti-spam, storage, emails |
| `lib/validate.js` | Server-side field validation and image type detection |
| `lib/emails.js` | Email A (to LINK) and Email B (to reporter) templates |
| `supabase/schema.sql` | Table, reference numbering, statuses, private bucket |
| `test/smoke.js` | `npm test`: validation, file sniffing, escaping; writes email previews to `/preview` |
| `.env.example` | Environment variable list (no secrets) |

## Services you need (none are pre-configured)
1. **Supabase** (database + private storage). Without it, nothing is stored and the endpoint returns an error. It will not pretend to save.
2. **Resend** (or swap `sendEmail()` in `api/submit.js` for your provider). Verify your sending domain first.
3. **Vercel** project connected to this folder.
4. *(Optional)* Cloudflare Turnstile for stronger bot protection.

## Setup
1. **Supabase:** create a project, open the SQL editor, run `supabase/schema.sql`. Confirm in Storage that bucket `pgf-evidence` exists and is **not** public. Copy the project URL and the `service_role` key (server-only).
2. **Resend:** add and verify your domain, create an API key. Set `PGF_FROM_EMAIL` to an address on that domain.
3. **Vercel:** import the repo (or run `npx vercel` in this folder). Under *Settings → Environment Variables* add every variable from `.env.example` (at least the required ones) for Production and Preview.
4. **Deploy:** `npx vercel --prod`. The form is served at `/`, the endpoint at `/api/submit`.
5. **Review link:** set `PGF_REVIEW_URL` to wherever LINK staff review reports (initially your Supabase *Table Editor* URL for `pgf_reports`). Only staff with Supabase access can open it. No dashboard is included in this version.
6. **Embedding on a LINK site:** link to the deployed page, or iframe it. If the form is served from a *different* origin than the API, set `ALLOWED_ORIGINS`.

## How it behaves
- **Reference numbers** (`PGF-2026-00124`) come from a database sequence, so they are unique. The sequence does not reset each year.
- **Statuses:** Received → Under review → Referred to relevant authority → Action reported → Closed. New reports are `Received`. Nothing changes status automatically; update it in Supabase.
- **Uploads:** type is detected from file contents (not the filename), limited to JPG/PNG/WebP and 4 MB, renamed to a random name, stored in a private bucket. Staff reach photos through a 7-day signed link in Email A. Photos are never embedded in emails.
- **Duplicates:** each form load carries a one-time key. A retry after a timeout returns the original reference without a second record or second email.
- **Anti-spam:** hidden honeypot, minimum fill time, per-IP rate limit (default 5/hour using a salted hash, never the raw IP), optional Turnstile.
- **Email failures:** the report is still saved. `admin_notified` / `confirmation_sent` record what happened. Check `select reference from pgf_reports where admin_notified = false;` and watch Vercel function logs.
- **GPS:** collected only if the reporter taps *Use my current location*.

## Known limits
- Vercel functions accept ~4.5 MB bodies, hence the 4 MB photo limit. For larger files, move to direct-to-storage signed uploads.
- No logo is included. Add the official asset at the marked slot in `index.html` and in the `shell()` header in `lib/emails.js` (email logos must be hosted at a public HTTPS URL).
- The LINKAGE Reader's Voice form was not available when this was built, so styling follows the brand brief. Compare it side by side and adjust the CSS variables at the top of `index.html`.
- Add a link to LINK's full privacy policy beside the privacy notice, and have it reviewed for POPIA before launch.

## Test checklist
**Valid submissions**
- [ ] Minimal report (category, description, location, accuracy ticked) → success with reference; row in `pgf_reports`; Email A received; no Email B.
- [ ] Full report with email + JPG → Email A (photo link opens) and Email B both arrive; subjects match spec.
- [ ] Report using GPS only (empty location text) is accepted.
- [ ] Phone number as contact is accepted; no Email B.

**Missing / invalid fields**
- [ ] Submit empty → inline errors, focus moves to first invalid field, no network call.
- [ ] Untick accuracy → blocked. Invalid email (`a@b`) and short phone → blocked.
- [ ] Bypass the browser (`curl` without required fields) → HTTP 422 with `errors`.

**Uploads**
- [ ] 5 MB image rejected in browser and by server. GIF/PDF rejected.
- [ ] `.exe` or `.svg` renamed to `.jpg` → rejected by the server (`npm test` covers detection; also try it live).
- [ ] Remove button clears the photo; stored filename is random, not the original.

**Duplicates and spam**
- [ ] Double-click SUBMIT → one request, button disabled with "SENDING…".
- [ ] Resend the same request (same `idempotency_key`) → same reference, no extra row or email.
- [ ] Fill the hidden `website` field, or submit in under 3 seconds (via `curl`) → rejected.
- [ ] 6th report within an hour from one connection → 429 message, entries kept.

**Emails**
- [ ] Description containing `<script>` appears as plain text. Email A shows "Not yet verified". Open both in Gmail, Outlook and on mobile.
- [ ] Set an invalid `RESEND_API_KEY` → reporter still gets a reference, row has `admin_notified = false`, error in logs, success page says confirmation could not be sent.

**Server errors**
- [ ] Remove `SUPABASE_URL` → form shows "not submitted" with Try again and keeps entries; no reference shown.
- [ ] Offline / blocked request → same behaviour; after reconnecting, Try again succeeds exactly once.
- [ ] Confirm the bucket is private (a bare storage URL without a signed token fails) and the anon key cannot read `pgf_reports`.
