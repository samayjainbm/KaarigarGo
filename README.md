# KaarigarGo — Backend API

Backend for **KaarigarGo**, a local skilled-labour marketplace (electricians, plumbers,
cleaners, carpenters, and more) connecting customers with verified service professionals.

This repository is the **minimal Phase 0 backend**: a single NestJS API with a Prisma
data model, PostgreSQL + PostGIS, and Redis. Mobile apps (React Native + Expo), the admin
dashboard, and the public website are planned for later phases.

## Stack

| Layer        | Choice                          |
| ------------ | ------------------------------- |
| Language     | TypeScript                      |
| API          | NestJS 11                       |
| Database     | PostgreSQL 16 + PostGIS         |
| ORM          | Prisma 6 (raw SQL for geo)      |
| Cache / KV   | Redis 7 (via ioredis)           |
| Validation   | Zod                             |

## Prerequisites

- **Node.js** 20+ (tested on 24)
- **Docker Desktop** (for local Postgres + Redis) — https://www.docker.com/products/docker-desktop/
- npm (ships with Node)

## Getting started

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Start Postgres + PostGIS and Redis
docker compose up -d

# 3. Create the database schema
npm run prisma:migrate          # first run will prompt for a migration name, e.g. "init"

# 4. Seed catalog + sample users
npm run db:seed

# 5. Run the API (watch mode)
npm run start:dev
```

The API listens on `http://localhost:3000/api/v1`.

- `GET /api/v1`         → service banner
- `GET /api/v1/health`  → liveness + DB/Redis checks

## Environment

Local defaults live in `.env` (already matches `docker-compose.yml`). See `.env.example`
for the full list of integration secrets (Maps, payments, notifications, etc.) to fill in
as later phases land.

## Data model

The full schema lives in [`prisma/schema.prisma`](prisma/schema.prisma) and is the single
source of truth: users, worker profiles & skills, catalog (categories/services), bookings
and their event timeline, quotes, payments, wallets & ledger, payouts, reviews, disputes,
notifications, chat, referrals, commission rules, audit logs, and devices.

Notes:
- **Money** is stored in integer **paise** (minor units). Never use floats for currency.
- **Geospatial** columns (`worker_profiles.base_location`, `bookings.location`,
  `addresses.location`) use PostGIS `geography(Point, 4326)`. Prisma can't query these
  directly — use `$queryRaw` / `$executeRaw`. GiST indexes are created by the seed script.

## API endpoints

All responses use the `{ data, error, meta }` envelope. Protected routes need an
`Authorization: Bearer <accessToken>` header.

**Auth (public)**
- `POST /auth/otp/request` — `{ phone, role? }` → sends an OTP. In non-production the
  response includes `devOtp` so you can test without an SMS provider.
- `POST /auth/otp/verify` — `{ phone, code, role? }` → creates the user on first login and
  returns `{ user, accessToken, refreshToken }`.
- `POST /auth/refresh` — `{ refreshToken }` → rotates and returns a new token pair.
- `POST /auth/logout` — `{ refreshToken, allDevices? }` → revokes refresh token(s).

**Account (auth required)**
- `GET /me` — current user (includes worker profile summary if any).
- `PATCH /me` — update `name`, `email`, `avatarUrl`, `locale`.
- `POST /me/devices` — `{ fcmToken, platform }` → register a device for push.

**Worker (role: WORKER)**
- `POST /worker/profile` — create profile (`bio`, `yearsExperience`, `serviceRadiusKm`, `lat`, `lng`).
- `PATCH /worker/profile` — update profile + `availabilityStatus`; `lat`/`lng` set the PostGIS base location.

### Quick auth test

```bash
# 1) request an OTP (dev returns the code)
curl -s -X POST localhost:3000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"+918888800001","role":"CUSTOMER"}'

# 2) verify it (use the devOtp from step 1) → returns accessToken
curl -s -X POST localhost:3000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' -d '{"phone":"+918888800001","code":"<devOtp>"}'

# 3) call a protected route
curl -s localhost:3000/api/v1/me -H 'Authorization: Bearer <accessToken>'
```

Security notes: OTPs are stored **hashed** in Redis with a 5-min TTL, 5-attempt cap, a 30s
resend cooldown, and an hourly request cap per number. Refresh tokens are rotating and
individually revocable (their ids live in Redis). Swap `DevSmsService` for MSG91/Twilio in
`AuthModule` when wiring real SMS (complete India DLT template registration first).

### Catalog & discovery (Phase 2)
- `GET /categories`, `GET /categories/:slug`, `GET /services?categoryId=` — public
- `GET /workers/search?lat=&lng=&categoryId=&limit=` — PostGIS ranked (distance → rating → reliability), public
- `GET /workers/:id` — public profile with reviews
- `GET/POST/DELETE /worker/skills` — worker manages their skills (role WORKER)

### Bookings, chat & realtime (Phase 3)
- `POST /bookings` — instant or scheduled; auto-assigns nearest available worker (or pass `workerId`)
- `GET /bookings`, `GET /bookings/:id` (with event timeline)
- `POST /bookings/:id/accept | reject | status | cancel` — lifecycle (status: EN_ROUTE → IN_PROGRESS → COMPLETED)
- `POST /bookings/:id/quote` + `POST /bookings/:id/quote/accept` — quote flow
- `POST /bookings/:id/track` — worker location ping (EN_ROUTE)
- `GET/POST /bookings/:id/messages` — chat
- **WebSocket** (Socket.IO, JWT handshake): `booking.join`, `chat.send`, `chat.markRead`, `location.ping`; server emits `booking.status_changed`, `chat.message`, `booking.location_update`, `payment.updated`, `dispute.updated`, `kyc.updated`, `safety.sos`

### Payments, wallet, payouts (Phase 4)
- `POST /payments/order` — create provider order (Razorpay when keys set, else dev **mock**)
- `POST /payments/webhook` — signature-verified provider webhook
- `POST /payments/order/:orderId/mock-pay` — dev-only payment trigger
- `POST /bookings/:id/cash/confirm` — cash settlement
- `GET /wallet`, `GET /wallet/transactions` — ledger
- `GET /worker/earnings`, `GET /worker/payouts`, `POST /worker/payouts/request`

### Trust & quality (Phase 5)
- `POST /worker/kyc`, `GET /worker/kyc` — submit/list KYC doc refs (worker must pass KYC to go online)
- `POST /bookings/:id/review`, `GET /workers/:id/reviews` — verified reviews; recompute worker rating
- `POST /bookings/:id/dispute`, `GET /disputes/:id` — disputes
- `POST /bookings/:id/sos` — in-job safety alert

### Admin (Phase 6, role OPS_ADMIN / SUPER_ADMIN)
- `GET /admin/analytics/overview` — GMV, revenue, bookings by status, workers, disputes
- `GET /admin/users`, `POST /admin/users/:id/suspend | reinstate`, `POST /admin/users/:id/role` (SUPER_ADMIN)
- `GET /admin/workers`, `POST /admin/workers/:id/feature`
- `GET /admin/bookings` — live monitor with filters
- `GET /admin/kyc`, `POST /admin/kyc/:id/approve | reject`
- `GET /admin/disputes`, `POST /admin/disputes/:id/assign | resolve` (refund/credit to wallet)
- `POST/PATCH/DELETE /admin/catalog/categories|services` — catalog CRUD
- `GET/POST /admin/commission-rules`
- `GET /admin/payouts`, `POST /admin/payouts/:id/approve | mark-paid | retry`
- `GET /admin/audit-logs` — every mutating admin action is audited

### Referrals (Phase 8)
- `GET /referrals/me` — your reusable code
- `POST /referrals/apply` — apply a code; credits both parties

## Useful scripts

| Script                   | What it does                              |
| ------------------------ | ----------------------------------------- |
| `npm run start:dev`      | API in watch mode                         |
| `npm run build`          | Compile to `dist/`                        |
| `npm run prisma:migrate` | Create/apply a dev migration              |
| `npm run prisma:studio`  | Open Prisma Studio                        |
| `npm run db:seed`        | Seed catalog + sample users               |
| `npm run db:reset`       | Drop, re-migrate, and re-seed the DB      |

## Sample seeded accounts

| Role        | Phone           |
| ----------- | --------------- |
| Super admin | `+919000000001` |
| Customer    | `+919000000002` |
| Worker      | `+919000000003` |

## Roadmap

Built per the LabourLink/KaarigarGo master spec, phase by phase:

- **Phase 0 — Foundations** ✅
- **Phase 1 — Auth & profiles** (phone OTP, JWT access/refresh, RBAC, `/me`, devices, worker profile) ✅
- **Phase 2 — Catalog & geo discovery** (catalog reads, PostGIS worker search, public profile, skills) ✅
- **Phase 3 — Booking core + realtime + chat** (lifecycle, Socket.IO gateway, quotes, live tracking) ✅
- **Phase 4 — Payments, wallet, payouts** (escrow settlement, commission engine, cash mode, ledger) ✅
- **Phase 5 — Trust & quality** (KYC + approval, reviews, disputes, SOS, reliability score) ✅
- **Phase 6 — Admin & analytics** (overview, user/worker mgmt, catalog CRUD, commission rules, payouts, audit log) ✅
- **Phase 8 — Growth** (referrals with wallet credits; recurring fields in schema) ✅ _partial_
- Phase 7 — Public website (Next.js) — _frontend, separate from this backend_

### Deferred / noted for later

Background jobs (BullMQ) for async settlement & payout processing; Razorpay Route split
settlement; Socket.IO Redis adapter for multi-instance scale; recurring-booking scheduler;
WhatsApp channel; surge pricing; AI features; and the client apps (customer + worker mobile,
admin + public web). Settlement currently runs inline on completion; payouts are admin-driven.
