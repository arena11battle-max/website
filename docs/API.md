# ARENA11 API Documentation

Base URL: `http://localhost:8080/api` (or your production domain).

## 1. Staff & Admin Authentication
- `POST /api/auth/setup` — Create initial owner/admin account (first visit only).
- `POST /api/auth/login` — Staff/admin sign-in (`{ email, password }`) → returns `accessToken` + `httpOnly` refresh cookie.
- `POST /api/auth/refresh` — Refresh access token.
- `POST /api/auth/logout` — Revoke refresh token.

## 2. Admin Dashboard & Coupons (`role = admin`)
- `GET /api/admin/dashboard` — Returns `totalMatchesPlayed`, `completedMatches`, `totalBookings`, `todayRevenue`, `pendingPayments`, `totalPlayers`, `recentMatches`, `playerStats`.
- `GET/POST /api/admin/events/aloha-2026/coupons` — List or create discount coupons (`flat` ₹ or `percent` %).
- `PATCH/DELETE /api/admin/events/aloha-2026/coupons/:id` — Pause/activate or delete a coupon.
- `POST /api/admin/bookings/:id/refund` — Mark booking & payment as `refunded` (audited).

## 3. Match Control, Custom Timers & HP Reset (Staff Auth)
- `GET /api/matches` — List matches (filter by `status`: `setup`, `running`, `finished`).
- `POST /api/matches` — Create match with `rounds` (1–10), `roundSeconds` (10–7200, any even/odd whole minutes & seconds), `breakSeconds` (0–1800), and `players` (`playerId`, `team`, `kitId`).
- `POST /api/matches/:id/:action` — `start`, `pause`, `resume`, `next`, `end`.
- `POST /api/matches/:id/reset-hp` — Reset HP to `100` for one player (`{ matchPlayerId }`) or all players (`{}`), logging to `hp_history` and broadcasting over Socket.IO.
- `GET /api/matches/:id/hp-history` — List HP reset history for the match.
- `POST /api/matches/:id/reset` — Reset match to `setup`, voiding events and clearing timer.
- `POST /api/matches/:id/events` — Manual staff hit/kill correction (`source: 'manual'`, audited).
- `POST /api/matches/:id/vest-events` — Browser Bluetooth vest line ingestion (`H,...`, `K,...`, `P,...`).
- `DELETE /api/events/:id` — Void an erroneous event.

## 4. Hardware Bridge Ingestion (HMAC Signed)
See [HARDWARE.md](HARDWARE.md) for the ESP32 → Bridge → `/api/device/*` HMAC-SHA256 protocol (`x-device-id`, `x-timestamp`, `x-signature`).

## 5. Customer Mobile OTP Auth (Separate from Staff Auth)
- `POST /api/customer/auth/send-otp` — Send 6-digit OTP to Indian mobile (`+91`), 30s resend cooldown, 5-min expiry, HMAC-hashed in DB.
- `POST /api/customer/auth/verify-otp` — Verify OTP (`timingSafeEqual`), create/retrieve customer, return customer JWT (`kind: 'customer'`).
- `GET /api/customer/me` — Customer profile + bookings + payment receipts.

## 6. Customer Bookings & Razorpay Payments
- `GET /api/public/bookings/packages` — List packages (`1v1`, `2v2`, `3v3`, `4v4`).
- `GET /api/public/bookings/slots?date=YYYY-MM-DD` — Check slot availability (prevents double booking).
- `POST /api/customer/bookings` — Reserve slot (`status: 'pending'`, enforced by DB unique index `bookings_slot_active_unique`).
- `POST /api/customer/payments/create-order` — Create Razorpay order (or test-mode order when keys are unset in non-production).
- `POST /api/customer/payments/verify` — Verify HMAC-SHA256 payment signature, mark `payment_successful`, prevent duplicate processing.
- `POST /api/customer/payments/fail` — Record failed/cancelled payment.
- `POST /api/webhooks/razorpay` — Verified Razorpay webhook (`x-razorpay-signature`).
- `GET /api/customer/payments/:receiptNo/pdf` — Download PDF payment receipt.

## 7. ALOHA 2026 SRMAP Event Registration
- `GET /api/public/events/aloha-2026` — Event metadata (`1 vs 1`, ₹400).
- `POST /api/public/events/aloha-2026/validate-coupon` — Validate coupon & compute discounted price.
- `POST /api/public/events/aloha-2026/register` — Register (`name`, `clgRegNo`, `mobileNumber`, `email`, optional `couponCode`).
- `GET /api/public/events/aloha-2026/registrations/:reference/pdf` — Download registration pass PDF.
- `GET /api/events/aloha-2026/registrations` & `/pdf` — Staff list & full-table PDF export.
