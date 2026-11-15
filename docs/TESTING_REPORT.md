# ARENA11 Testing & Verification Report

## 1. Automated Server Integration Tests (`npm test`)
Executed inside Linux `node:22-slim` container against PostgreSQL 16 (`arena_test` database) across all 4 suites (`test/api.test.ts`, `test/events.test.ts`, `test/platform.test.ts`, `test/website.test.ts`):

- **Total tests:** 20
- **Passed:** 20
- **Failed:** 0

### Verified Scenarios
1. **Admin Login & RBAC (`api.test.ts`, `platform.test.ts`, `website.test.ts`):**
   - First-run admin setup, login, refresh token rotation, logout, and reuse revocation.
   - Operators (`role = 'operator'`) receive `403` on admin-only routes (`/api/admin/dashboard`, `/api/admin/events/aloha-2026/coupons`).
   - Unauthenticated requests receive `401`.
2. **Customer Mobile OTP Registration (`platform.test.ts`):**
   - Rejects invalid mobile numbers (`400`); normalizes Indian mobile numbers to `+91XXXXXXXXXX`.
   - Enforces 30s resend cooldown (`429`) and stores HMAC-SHA256 hashed OTPs (never plaintext).
   - Rejects wrong OTP (`401`); issues customer JWT (`kind: 'customer'`) on valid OTP.
   - Customer JWTs are rejected (`401`) on staff/admin routes.
3. **Booking Creation & Double-Booking Prevention (`platform.test.ts`):**
   - Reserves slot with `status: 'pending'` and package pricing.
   - Rejects duplicate booking on the same date & time slot (`409` via `bookings_slot_active_unique`).
4. **Online Payment Verification & Duplicate Prevention (`platform.test.ts`):**
   - Creates payment order, verifies HMAC-SHA256 payment signature, marks booking `payment_successful`.
   - Rejects duplicate payment verification on an already-paid order (`409`).
   - Generates downloadable PDF payment receipt (`%PDF-`, `application/pdf`).
5. **Custom Match Timer (Even & Odd Values), HP Reset, Live Ingestion & Winner Rules (`api.test.ts`, `platform.test.ts`):**
   - Supports any whole-number minutes & custom seconds (e.g. `125s`, `240s`).
   - Start, pause, resume, end, and match reset.
   - Single-player and all-player HP reset to `100`, logged in `hp_history`, rejected (`401`) for unauthorized callers.
   - Hardware device HMAC-SHA256 signature verification, duplicate `device_seq` prevention, and Bluetooth vest line ingestion.
   - Winner calculation: Red/Blue by valid kills, `draw` on tie with scoring events, and `null` (no winner invented) when a match ends with zero scoring events.
6. **ALOHA 2026 Event Registration & PDF Export (`events.test.ts`):**
   - `1 vs 1` at `₹400`, admin-managed flat/`%` coupons, atomic `used_count` enforcement, and PDF pass/report generation.

## 2. Build & Live Container Verification
- **Frontend build (`web`):** `tsc -b && vite build` passed cleanly inside Docker (`139 modules transformed`).
- **Backend build (`server`):** `tsc && cp -r src/migrations dist/` passed cleanly inside Docker.
- **Live endpoints (`http://localhost:8080`):**
  - `GET /api/health` → `{"ok":true}`
  - `GET /api/public/bookings/packages` → `200`
  - `GET /api/public/bookings/slots?date=2026-12-01` → `200`
  - `GET /admin/login` → `200`
