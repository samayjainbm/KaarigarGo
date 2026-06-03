# KaarigarGo — Developer Guide

> A local skilled-labour marketplace (electricians, plumbers, cleaners, carpenters, painters, AC techs, pest control, appliance repair) for the Indian market. Customers book verified local pros on-demand; workers receive jobs, travel, complete work, and get paid; ops/admins manage the platform.
>
> This single document is everything a new developer needs to understand, run, extend, deploy, and reason about the **entire** system — backend, web, both mobile apps, and infrastructure — followed by an exhaustive **edge-case catalog** and an **interview-question bank** with model answers.

---

## Table of contents

1. [System overview & architecture](#1-system-overview--architecture)
2. [Tech stack](#2-tech-stack)
3. [Repository layout](#3-repository-layout)
4. [Backend — NestJS API](#4-backend--nestjs-api)
   - [Conventions](#41-cross-cutting-conventions)
   - [Auth & sessions](#42-auth--sessions)
   - [Data model](#43-data-model)
   - [Full API reference](#44-full-api-reference)
   - [Booking lifecycle (state machine)](#45-booking-lifecycle-state-machine)
   - [Money: commission, wallet, settlement, payments](#46-money-commission-wallet-settlement-payments)
   - [Geospatial (PostGIS)](#47-geospatial-postgis)
   - [Realtime (Socket.IO)](#48-realtime-socketio)
   - [Notifications & push](#49-notifications--push)
   - [Admin & audit](#410-admin--audit)
5. [Web app — Next.js](#5-web-app--nextjs)
6. [Mobile apps — Expo (customer + worker)](#6-mobile-apps--expo-customer--worker)
7. [Infrastructure & deployment](#7-infrastructure--deployment)
8. [Local development setup](#8-local-development-setup)
9. [Build & release (incl. APK gotchas)](#9-build--release)
10. [Environment variable reference](#10-environment-variable-reference)
11. [Security model](#11-security-model)
12. [Edge-case catalog](#12-edge-case-catalog)
13. [Known limitations & deferred work](#13-known-limitations--deferred-work)
14. [Interview question bank](#14-interview-question-bank)

---

## 1. System overview & architecture

Four deployable surfaces share **one backend** and **one database**:

```
                         ┌─────────────────────────────────────────┐
                         │  NestJS API  (api/v1, Socket.IO gateway) │
   Customer app (Expo) ──┤  - REST + WebSocket                      │
   Worker app  (Expo) ───┤  - JWT auth, role guards                 ├── PostgreSQL + PostGIS (Supabase)
   Web (Next.js)  ───────┤  - money/ledger, payments providers      ├── Redis (Upstash): OTP, token revocation
   Admin (in web app) ───┤  - notifications (Expo push)             │
                         └─────────────────────────────────────────┘
                                          │
                              external: Razorpay (optional), exp.host push
```

- **Backend**: a single, minimal **NestJS** app (not a Turborepo monorepo). Prisma is the single source of truth for the schema. Hosted as a Docker container on **Render**.
- **Database**: **PostgreSQL + PostGIS** on **Supabase**. Money is integer paise; geo columns are `geography(Point,4326)`.
- **Cache/ephemeral**: **Redis** on **Upstash** (TLS) — OTP storage, refresh-token revocation ids, rate-limit counters.
- **Web**: **Next.js 15 (App Router) + React 19 + Tailwind**, on **Vercel**. Hosts both the customer-facing site and the `/admin` console.
- **Mobile**: two **Expo SDK 52 + Expo Router** apps — **customer** (`KaarigarGo`) and **worker** (`KaarigarGo Pro`) — sharing an identical `src/`.

**Design principles**
- Money is **always integer minor units (paise)** — never floats.
- Geo always **PostGIS `geography(Point,4326)`**, queried via `$queryRaw` (Prisma can't type geography columns — they're `Unsupported(...)`).
- API responses use a **uniform envelope** `{ data, error, meta }`.
- **Secure by default**: a global auth guard protects everything; routes opt out with `@Public()`.
- Build **phase by phase** — the schema is complete from day one; features layer on without schema churn.

---

## 2. Tech stack

| Layer | Tech | Notes |
|---|---|---|
| API framework | NestJS 11 | Modular, DI, guards, pipes, filters |
| ORM | Prisma 6 | `schema.prisma` is canonical; `$queryRaw` for geo |
| DB | PostgreSQL + PostGIS | Supabase managed |
| Cache | Redis (ioredis) | Upstash, `rediss://` TLS |
| Validation | Zod | `ZodValidationPipe` on every body/query |
| Auth | `@nestjs/jwt` + custom OTP | Access + rotating refresh tokens |
| Realtime | `@nestjs/websockets` + `socket.io` | JWT handshake, booking/user rooms |
| Web | Next.js 15, React 19, TypeScript, Tailwind | App Router, port 3001 |
| Mobile | Expo SDK 52, Expo Router, RN 0.76 (new arch) | TypeScript; SecureStore tokens |
| Payments | Razorpay (REST + HMAC) or Mock | Provider abstraction |
| Push | Expo push (exp.host) | Needs EAS projectId for real delivery |
| Runtime | Node 24, npm | No pnpm; no Turborepo |

Backend has **zero heavy deps**: payments use global `fetch` + `crypto`, no SDK.

---

## 3. Repository layout

```
KaarigarGo/
├── src/                      # NestJS backend
│   ├── main.ts               # bootstrap: setGlobalPrefix('api/v1'), enableCors(), filters, rawBody
│   ├── app.module.ts
│   ├── app.controller.ts     # GET / banner
│   ├── common/
│   │   └── http/envelope.ts  # ok(data, meta?) → { data, error, meta }
│   ├── auth/                 # OTP, JWT, guards, SmsService (DevSmsService)
│   ├── users/                # /me, devices
│   ├── catalog/              # categories, services (public reads)
│   ├── workers/              # public search, profile, skills
│   ├── kyc/                  # worker submit + admin review
│   ├── bookings/             # lifecycle, quotes, track, messages
│   ├── money/                # CommissionService, WalletService, SettlementService
│   ├── payments/             # provider abstraction, wallet/payout controllers, webhook
│   ├── reviews/              # verified reviews, rating recompute
│   ├── disputes/             # raise + admin resolve
│   ├── referrals/            # codes + credits
│   ├── admin/                # analytics, user/worker mgmt, catalog CRUD, payouts, AuditService
│   ├── notifications/        # NotificationsService (persist + Expo push)
│   ├── realtime/             # RealtimeGateway (Socket.IO)
│   └── health/               # GET /health (db + redis checks)
├── prisma/
│   ├── schema.prisma         # single source of truth
│   └── seed.ts               # catalog + demo accounts
├── Dockerfile                # multi-stage; runs `prisma migrate deploy` on boot
├── render.yaml               # Render blueprint (Docker web service)
├── DEPLOY.md                 # deploy runbook
├── web/                      # Next.js app (customer site + /admin)
│   ├── src/app/              # routes: /, /login, /app/*, /admin/*
│   ├── src/lib/api.ts        # fetch wrapper, token in localStorage, auto-refresh on 401
│   ├── src/lib/socket.ts     # socket.io-client, WS base derived from API URL
│   ├── src/components/ui.tsx # design system
│   └── .env.production       # NEXT_PUBLIC_API_URL → Render
└── mobile/
    ├── customer/             # KaarigarGo (customer)
    └── worker/               # KaarigarGo Pro (worker)
        ├── app/              # Expo Router screens (per-app)
        ├── src/              # shared: api.ts, auth.tsx, socket.ts, push.ts, theme.ts, ui.tsx, format.ts
        ├── app.json          # expo config, extra.apiUrl, eas projectId
        ├── eas.json          # build profiles (preview = APK)
        └── android/          # prebuilt native project (gitignored normally; present here)
```

---

## 4. Backend — NestJS API

Base URL: `https://<host>/api/v1` (global prefix set in `main.ts`). Local: `http://localhost:3000/api/v1`.

### 4.1 Cross-cutting conventions

- **Response envelope** — controllers return `ok(data, meta?)` from `src/common/http/envelope.ts`. A global `AllExceptionsFilter` converts thrown errors to `{ data: null, error: { message, ... }, meta: null }`. Success: `{ data, error: null, meta }`.
- **Validation** — every body/query is parsed with a Zod schema via `ZodValidationPipe`. Invalid input → 400 with the Zod issue.
- **Auth guard order** — a global `JwtAuthGuard` runs first (validates the access token, attaches `user`), then `RolesGuard` enforces `@Roles(...)`. Decorators: `@Public()` (skip auth), `@Roles(UserRole.OPS_ADMIN, ...)`, `@CurrentUser()` (inject the authed user).
- **Raw-SQL gotcha** — tables are `snake_case` (`@@map`), but **columns are camelCase**. In `$queryRaw` you must quote camelCase columns: `wp."userId"`. The two geo columns are `@map`'d to snake_case (`base_location`, `location`) and are **not** quoted-camelCase.
- **Money** — every amount field is an `Int` in paise. `₹199 = 19900`.

### 4.2 Auth & sessions

**Flow**: phone → OTP → JWT access + refresh.

1. `POST /auth/otp/request { phone, role? }` → issues a 6-digit code. The code is stored **hashed in Redis** with:
   - **TTL** 300s (5 min)
   - **5-attempt cap** per code
   - **30s resend cooldown**
   - **hourly request cap** per number
   - SMS is sent via `SmsService`, bound to `DevSmsService` (logs the code server-side; no real SMS provider).
   - **Demo mode**: the response includes `devOtp` (the code) so clients can self-serve login without SMS. *(Originally gated to non-prod; now always returned. Swap in a real provider and drop `devOtp` before real users.)*
2. `POST /auth/otp/verify { phone, code, role? }` → on success returns `{ user, isNew, accessToken, refreshToken }`. Creates the user if new.
3. `POST /auth/refresh { refreshToken }` → **rotating** refresh: issues a new access+refresh pair and revokes the old refresh id (id stored in Redis). Reusing a rotated/revoked token fails.
4. `POST /auth/logout { refreshToken, allDevices? }` → revokes the refresh id(s) in Redis. Idempotent.

**Tokens**: access TTL `JWT_ACCESS_TTL` (default 900s), refresh TTL `JWT_REFRESH_TTL` (default 2592000s = 30d). Separate secrets. Refresh ids live in Redis so they're individually revocable.

**Roles**: `CUSTOMER`, `WORKER`, `OPS_ADMIN`, `SUPER_ADMIN`. Same phone can be a customer and worker conceptually, but a `User` has one `role`; the worker app requests role `WORKER` at OTP time.

### 4.3 Data model

Full schema is `prisma/schema.prisma`. Key entities and invariants:

**Identity**
- `User` — `phone` unique, optional `email` unique, `role`, `status` (ACTIVE/SUSPENDED), `locale`. Cascades to profile, addresses, devices, wallets, notifications.
- `WorkerProfile` (1:1 with User) — `baseLocation` (geography), `serviceRadiusKm`, `availabilityStatus` (ONLINE/OFFLINE/BUSY), `kycStatus`, `reliabilityScore` (default 100), `ratingAvg`/`ratingCount`, `completedJobs`, `isFeatured`.
- `WorkerSkill` — unique `(workerId, categoryId)`; `priceType` (FIXED/HOURLY/QUOTE), `basePrice` (paise).

**Catalog**
- `Category` — self-referential tree (`parentId`), `slug` unique, `defaultCommissionPct` (default 15), `isActive`, `sortOrder`.
- `Service` — belongs to a category; `priceModel`, `basePrice`, `defaultDurationMin`.

**KYC / addresses**
- `KycDocument` — per worker, `docType`, `fileUrl`, `status`, reviewer fields.
- `Address` — per user, `location` (geography), `isDefault`.

**Bookings**
- `Booking` — `customerId`, optional `workerId`, `serviceId`, optional `addressId`, `status`, `scheduledAt`, `location`, `priceEstimate`/`finalPrice` (paise), `paymentMode` (ONLINE/CASH), `commissionAmount`, recurring fields.
- `BookingEvent` — append-only audit of state transitions (`type`, `actorId`, `payload` JSON).
- `Quote` — worker-proposed price for QUOTE-type jobs; `status` PROPOSED/ACCEPTED/DECLINED.

**Money**
- `Payment` — per booking; `provider`, `providerOrderId`/`providerPaymentId`, `amount`, `status`, `method`.
- `Wallet` — unique `(userId, ownerType)`; `balance` (paise). One per owner role.
- `WalletTransaction` — **append-only ledger** with `type`, `amount`, `reference`, and `runningBalance` snapshot.
- `Payout` — worker withdrawal; `status` QUEUED/PROCESSING/PAID/FAILED.

**Trust & comms**
- `Review` — tied to a booking; `rating` (int), `isVerified`; recomputes `WorkerProfile.ratingAvg`.
- `Dispute` — `status` OPEN/UNDER_REVIEW/RESOLVED; `evidenceUrls`, resolution fields.
- `Notification` — persisted in-app + channel (PUSH/SMS/WHATSAPP/INAPP).
- `ChatMessage` — per booking; `readAt`.
- `Device` — push token; `fcmToken` unique, `platform`.

**Growth / ops**
- `Referral` — `code` unique, referrer/referee, `rewardAmount`, `status`.
- `CommissionRule` — `scope` GLOBAL/CATEGORY/WORKER_TIER, `pct`, `fixedFee`, `effectiveFrom`.
- `AuditLog` — every mutating admin action: `actorId`, `action`, `entity`, `entityId`, `before`/`after` JSON, `ip`.

### 4.4 Full API reference

All paths are under `/api/v1`. 🔓 = `@Public()`; everything else requires a valid access token. 👮 = admin-role gated.

**System**
- 🔓 `GET /` — service banner
- 🔓 `GET /health` — `{ status, checks: { api, db, redis } }`

**Auth** (`/auth`)
- 🔓 `POST /auth/otp/request` · 🔓 `POST /auth/otp/verify` · 🔓 `POST /auth/refresh` · `POST /auth/logout`

**Me** (`/me`)
- `GET /me` · `PATCH /me` · `POST /me/devices` (register push token)

**Catalog** (public reads)
- 🔓 `GET /categories` · 🔓 `GET /categories/:slug` · 🔓 `GET /services`

**Workers**
- 🔓 `GET /workers/search?lat&lng&categoryId` — PostGIS ranked nearest
- 🔓 `GET /workers/:id` — public profile
- `POST /worker/profile` · `PATCH /worker/profile` (own profile; lat/lng set base location)
- `GET /worker/skills` · `POST /worker/skills` · `DELETE /worker/skills/:id`

**KYC**
- `GET /worker/kyc` · `POST /worker/kyc` (submit)
- 👮 `GET /admin/kyc` · 👮 `POST /admin/kyc/:id/approve` · 👮 `POST /admin/kyc/:id/reject`

**Bookings** (`/bookings`)
- `POST /bookings` (create; auto-assigns nearest worker) · `GET /bookings` · `GET /bookings/:id`
- `POST /bookings/:id/accept` · `/reject` · `/status` · `/cancel`
- `POST /bookings/:id/quote` · `/quote/accept`
- `POST /bookings/:id/track` · `/cash/confirm` · `/sos`
- Chat: `GET /bookings/:id/messages` · `POST /bookings/:id/messages`

**Payments / wallet / payouts**
- `POST /payments/order` · 🔓 `POST /payments/webhook` (raw body, HMAC verified) · `POST /payments/order/:orderId/mock-pay`
- `GET /wallet` · `GET /wallet/transactions`
- `GET /worker/earnings` · `GET /worker/payouts` · `POST /worker/payouts/request`

**Reviews**
- `POST /bookings/:id/review` · 🔓 `GET /workers/:id/reviews`

**Disputes**
- `POST /bookings/:id/dispute` · `GET /disputes/:id`
- 👮 `GET /admin/disputes` · 👮 `POST /admin/disputes/:id/assign` · 👮 `POST /admin/disputes/:id/resolve`

**Referrals** (`/referrals`)
- `GET /referrals/me` · `POST /referrals/apply`

**Admin** (`/admin`, all 👮; every mutation audited)
- `GET /admin/analytics/overview`
- `GET /admin/users` · `POST /admin/users/:id/suspend` · `/reinstate` · `/role`
- `GET /admin/workers` · `POST /admin/workers/:id/feature`
- `GET /admin/bookings` · `GET /admin/audit-logs`
- Catalog CRUD: `POST/PATCH/DELETE /admin/catalog/categories[/:id]`, `POST/PATCH/DELETE /admin/catalog/services[/:id]`
- Commission: `GET /admin/commission-rules` · `POST /admin/commission-rules`
- Payouts: `GET /admin/payouts` · `POST /admin/payouts/:id/approve` · `/mark-paid` · `/retry`

### 4.5 Booking lifecycle (state machine)

`BookingStatus`: `REQUESTED → ACCEPTED → EN_ROUTE → IN_PROGRESS → COMPLETED → SETTLED`, plus terminal/exception states `REJECTED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_WORKER`, `EXPIRED`, `DISPUTED`.

```
REQUESTED ──accept──▶ ACCEPTED ──status──▶ EN_ROUTE ──▶ IN_PROGRESS ──▶ COMPLETED ──settle──▶ SETTLED
    │                    │                                                   │
    │ reject/expire      │ cancel(worker/customer)                           └─ dispute ─▶ DISPUTED
    ▼                    ▼
 REJECTED/EXPIRED   CANCELLED_*
```

- **Create** (`POST /bookings`): computes `priceEstimate`, auto-assigns the **nearest eligible worker** via PostGIS (online, KYC-approved, has the skill, within service radius). Fires a push to that worker. Writes a `BookingEvent`.
- **Accept/Reject** (`/accept`, `/reject`): worker responds. Reject (or timeout) → reassign or `EXPIRED`.
- **Status** (`/status`): worker drives `EN_ROUTE → IN_PROGRESS → COMPLETED`. Each transition pushes the customer and emits a socket event.
- **Quotes**: QUOTE-priced services get a `Quote` (`/quote`) the customer accepts (`/quote/accept`), setting `finalPrice`.
- **Track** (`/track`): location update for live tracking; also via socket `location.ping`.
- **Settlement**: on COMPLETED, `SettlementService` computes commission, credits the worker wallet (escrow for online; cash flow for CASH), moves to `SETTLED`. Fires earnings push.
- **Cash** (`/cash/confirm`): worker confirms cash collected.
- **SOS** (`/sos`): safety signal on an active booking.

### 4.6 Money: commission, wallet, settlement, payments

All in `src/money` and `src/payments`.

- **CommissionService** — resolves the rate with precedence **CATEGORY rule → GLOBAL rule → category's `defaultCommissionPct`**. Computed on integer paise (`Math.round`).
- **WalletService** — **append-only ledger**. Each `WalletTransaction` records `amount`, `type`, and a `runningBalance` snapshot; the `Wallet.balance` is updated in the **same DB transaction** so the ledger and balance never drift.
- **SettlementService** — escrow model for online payments, direct flow for cash. Verified example: ₹199 booking (19900 paise) → 15% commission = 2985 → worker credited 16915.
- **Payments provider abstraction**:
  - `MockPaymentProvider` (default in dev) — `/payments/order/:orderId/mock-pay` simulates success.
  - `RazorpayPaymentProvider` — used when `RAZORPAY_KEY_ID` is set. REST + HMAC signature verification. The webhook needs the **raw body** (`rawBody: true` in `main.ts`) to verify the signature.
- **Payouts** — worker requests withdrawal (`/worker/payouts/request`); admin approves / marks paid / retries. Status QUEUED → PROCESSING → PAID/FAILED.

### 4.7 Geospatial (PostGIS)

- Columns `worker_profiles.base_location`, `addresses.location`, `bookings.location` are `geography(Point, 4326)` (WGS84, lat/lng).
- Prisma maps them as `Unsupported("geography(Point, 4326)")` — you **cannot** read/write them through the normal Prisma client; use `$queryRaw` / `$executeRaw` with `ST_MakePoint`, `ST_SetSRID`, `ST_DWithin`, `ST_Distance`.
- **Distances are in meters** (geography type). Service radius is stored in km → multiply by 1000.
- Nearest-worker search filters by `ST_DWithin(base_location, point, radius_m)` and ranks by distance (plus rating/reliability). A migration (`geo_indexes`) adds GiST indexes.

### 4.8 Realtime (Socket.IO)

`src/realtime/realtime.gateway.ts`, `@WebSocketGateway({ cors: { origin: '*' } })`.

- **Handshake**: JWT passed on connect; invalid → `client.emit('error', { message: 'unauthorized' })` and disconnect.
- **Rooms**: `booking:<id>` (per booking) and `user:<id>` (per user).
- **Inbound** (`@SubscribeMessage`): `booking.join`, `chat.send`, `chat.markRead`, `location.ping`, `presence.heartbeat`.
- **Outbound** (`server.emit`): `chat.message`, `chat.read`, `booking.location_update`, and service-emitted `booking.status_changed` / `payment.updated` (via gateway helpers `emitToBooking` / `emitToUser`).
- Clients keep a **12s polling fallback** because the gateway is single-instance (no Redis adapter) and free-tier hosts drop idle sockets.

### 4.9 Notifications & push

- `NotificationsService` persists a `Notification` row **and** sends an Expo push to the user's `Device` tokens (`Expo[nent]PushToken[...]`) via `exp.host`.
- Wired into bookings (new-job → worker; accepted/en_route/in_progress/completed → customer) and settlement (settled → worker earnings).
- Mobile registers a token after login (`POST /me/devices`). Real delivery needs an **EAS projectId** + a dev/EAS build; in Expo Go it no-ops gracefully.

### 4.10 Admin & audit

- `AuditService` writes an `AuditLog` for **every mutating admin action** (suspend, role change, catalog edit, payout action, dispute resolve), capturing `before`/`after` and actor/IP.
- Analytics overview aggregates KPIs (users, bookings, GMV, etc.). Admin console lives in the web app under `/admin`.

---

## 5. Web app — Next.js

`web/` — Next.js 15 App Router, React 19, TypeScript, Tailwind. Dev port **3001**.

- **API wrapper** `src/lib/api.ts` — `BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'`. Stores tokens in `localStorage`; auto-refreshes on 401.
- **Realtime** `src/lib/socket.ts` — derives the WS base from `NEXT_PUBLIC_API_URL`.
- **Design system** `src/components/ui.tsx` + Tailwind (brand indigo + amber accent).
- **Pages**:
  - Marketing `/`
  - `/login` — OTP; **displays + auto-fills `devOtp`** ("Dev mode — your code is …").
  - Customer `/app` (home w/ live categories), `/app/book`, `/app/bookings[/id]` (polling + pay + review), `/app/wallet`.
  - Admin `/admin` (overview KPIs, bookings monitor, KYC queue, disputes, workers).
- **Build**: `npm run build` (clean, 14 routes). `NEXT_PUBLIC_*` is **embedded at build time** (not secret) — set it before building or in Vercel project env, or the app silently points at localhost.

---

## 6. Mobile apps — Expo (customer + worker)

`mobile/customer` (`KaarigarGo`) and `mobile/worker` (`KaarigarGo Pro`). Expo SDK 52 + Expo Router, **new architecture enabled**. Both share an identical `src/`.

**Shared `src/`**: `api.ts` (SecureStore tokens + auto-refresh), `auth.tsx`, `socket.ts`, `push.ts`, `theme.ts`, `ui.tsx`, `format.ts`.

**API base resolution** (`src/api.ts` / `socket.ts`):
```
process.env.EXPO_PUBLIC_API_URL  ??  Constants.expoConfig.extra.apiUrl  ??  'http://localhost:3000/api/v1'
```
- `eas.json` sets `EXPO_PUBLIC_API_URL` per build profile.
- `app.json → extra.apiUrl` is the fallback (currently the Render URL).
- For local dev on a real device use your **LAN IP**; Android emulator uses **10.0.2.2**.

**Customer app**: OTP login, tabs Home/Bookings/Wallet/Profile, `book` flow, `booking/[id]` detail (poll + socket + pay mock/Razorpay + review).

**Worker app**: OTP (role WORKER), tabs Jobs/Earnings/Profile, `job/[id]` action chain (accept/reject → en_route → arrived → complete → collect cash), availability toggle gated by KYC approval, payout request, onboarding flow (pick category → profile+skill+location → submit KYC), live-location share (`expo-location` → socket `location.ping`).

**Icons**: only `@expo/vector-icons` **Ionicons** is used. The font family requested is **`ionicons` (lowercase)**. The root `app/_layout.tsx` loads it **non-blocking** via `useFonts(Ionicons.font)` and the font is embedded natively at `android/app/src/main/assets/fonts/ionicons.ttf` (see [§9](#9-build--release)).

**Demo logins**: customer `+919000000002`, worker `+919000000003` (any number works in demo mode; the OTP is shown on-screen).

---

## 7. Infrastructure & deployment

| Component | Service | Notes |
|---|---|---|
| Backend container | **Render** (Docker, `render.yaml`) | free tier sleeps ~15 min idle (cold start + socket drops); health check `/api/v1/health`; region singapore |
| Database | **Supabase** Postgres + PostGIS | `DATABASE_URL` set in Render dashboard |
| Redis | **Upstash** | `REDIS_URL` must be `rediss://` (TLS) |
| Web | **Vercel** | project root = `web/`; `NEXT_PUBLIC_API_URL` → Render |
| Mobile | **EAS** or local Gradle | APKs distributed by file/link |
| Push | exp.host | needs EAS projectId |
| Payments | Razorpay (optional) | webhook → `/api/v1/payments/webhook` |

- **Docker**: multi-stage; runs `prisma migrate deploy` on boot, then `node dist/main.js`.
- **Render blueprint** (`render.yaml`): Docker web service; `DATABASE_URL`/`REDIS_URL` are `sync:false` (paste in dashboard); JWT secrets `generateValue:true`; TTLs set.
- **CORS** is open (`app.enableCors()` + gateway `origin:'*'`), so new web/app origins need **no** allow-listing.
- Live API: `https://kaarigargo-api.onrender.com/api/v1`. Live web: `https://kaarigar-go.vercel.app`.

---

## 8. Local development setup

**Prereqs**: Node 24, npm, Docker Desktop (for local DB/Redis) or managed URLs, Android SDK + JDK 17 (for APK builds).

**Backend**
```bash
# 1. env
cp .env.example .env            # set DATABASE_URL, REDIS_URL, JWT secrets
# 2. local infra (if not using managed): docker compose up -d  (postgis + redis)
npm install
npm run prisma:generate
npm run prisma:deploy           # or prisma:migrate for dev
npm run db:seed                 # catalog + demo accounts
npm run start:dev               # http://localhost:3000/api/v1
```
Quick auth test:
```bash
curl -s -X POST localhost:3000/api/v1/auth/otp/request -H 'Content-Type: application/json' \
  -d '{"phone":"+919000000002","role":"CUSTOMER"}'        # returns devOtp
curl -s -X POST localhost:3000/api/v1/auth/otp/verify  -H 'Content-Type: application/json' \
  -d '{"phone":"+919000000002","code":"<devOtp>"}'        # returns accessToken
```

**Web**
```bash
cd web && npm install
# .env.local: NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
npm run dev                     # http://localhost:3001
```

**Mobile**
```bash
cd mobile/customer && npm install
# set app.json extra.apiUrl to your LAN IP (real device) or 10.0.2.2 (emulator)
npx expo start                  # open in Expo Go
```

---

## 9. Build & release

### Backend
Render auto-deploys on push to `main` (Docker build → `prisma migrate deploy` → start). Manual: dashboard → Manual Deploy → latest commit.

### Web
Vercel imports the repo with **root = `web/`**, sets `NEXT_PUBLIC_API_URL`, and builds. Verify the deployed JS references the Render URL (not `localhost`).

### Android APKs (local Gradle) — with hard-won gotchas
Toolchain: JDK 17, Android SDK (NDK 26.1.10909125, CMake 3.22.1). Per app, from `mobile/<app>/android`:
```powershell
$env:EXPO_PUBLIC_API_URL='https://kaarigargo-api.onrender.com/api/v1'
.\gradlew.bat assembleRelease --console=plain
# → app/build/outputs/apk/release/app-release.apk  (debug-signed, ~39 MB, sideloadable)
```
**Four gotchas (each cost a failed build):**
1. **Kotlin/Compose mismatch** — pin the plugin in `android/build.gradle`: `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")` (1.9.25). The `android.kotlinVersion` property alone doesn't reach the classpath → `expo-modules-core:compileReleaseKotlin` fails ("Compose Compiler 1.5.15 requires Kotlin 1.9.25").
2. **Blank vector icons in release** — embed the font natively at `android/app/src/main/assets/fonts/ionicons.ttf` (**lowercase** — `@expo/vector-icons` requests family `ionicons` and Android asset lookup is case-sensitive). Runtime expo-font loading does not work in these local release builds.
3. **Never gate the app on font load** — `useFonts(Ionicons.font)` must be **non-blocking**; a blocking `if (!loaded) return <Loading/>` hangs the whole app when the font fails to load.
4. **Duplicate-resources error after renaming the font on Windows** — delete `mobile/<app>/android/app/build/intermediates/{assets,incremental,merged_assets,merged_res,packaged_res}` then rebuild (native `.cxx` cache survives → ~1 min rebuild).

Also: each `android/` needs `local.properties` (`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`).

### Android APKs (EAS cloud)
`eas login` (or `EXPO_TOKEN`) → `eas init` (writes `projectId`) → `eas build -p android --profile preview` (preview = APK; production = AAB). Managed signing + shareable link; free tier builds one at a time.

---

## 10. Environment variable reference

**Backend**
| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres (Supabase) | PostGIS extension required |
| `REDIS_URL` | Redis (Upstash) | use `rediss://` for TLS |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | token signing | distinct secrets |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | token lifetimes (s) | default 900 / 2592000 |
| `NODE_ENV` | env | `production` on Render |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | enable real payments | absent → MockPaymentProvider |
| `PORT` | listen port | default 3000 |

**Web**: `NEXT_PUBLIC_API_URL` (build-time, embedded, not secret).
**Mobile**: `EXPO_PUBLIC_API_URL` (per EAS profile) → `app.json extra.apiUrl` fallback.

---

## 11. Security model

- **Secure-by-default**: global `JwtAuthGuard`; opt out per route with `@Public()`.
- **OTP**: hashed at rest in Redis, short TTL, attempt cap, resend cooldown, hourly cap.
- **Refresh rotation**: rotated tokens are revoked; reuse fails. Logout revokes server-side.
- **RBAC**: `RolesGuard` + `@Roles`; admin actions audited with actor/IP/before/after.
- **Payments**: webhook HMAC verification over the raw body.
- **Money integrity**: integer paise; ledger + balance updated in one DB transaction.
- ⚠️ **Demo-mode caveats to harden before launch**: `devOtp` is returned in API responses; CORS is `*`; the WS gateway accepts `origin:*`; APKs are debug-signed. Replace `DevSmsService` with a real SMS provider, gate `devOtp`, lock down CORS, and use a managed signing key.

---

## 12. Edge-case catalog

### Auth & OTP
- **Expired / wrong / replayed code** → rejected; 5-attempt cap then must re-request.
- **Resend spam** → 30s cooldown + hourly per-number cap.
- **Refresh-token reuse** (stolen/rotated) → revoked id in Redis → 401; consider treating reuse as a breach signal (revoke all).
- **Suspended user** logs in → `issueTokens` path checks status; `SUSPENDED` → `Account unavailable`.
- **Role mismatch** — customer tries worker-only endpoints → `RolesGuard` 403.
- **Demo-mode exposure** — `devOtp` in response means anyone can log in as any number; acceptable only for demo.
- **Redis down** → OTP issue/verify and refresh revocation fail; health check reports `redis: error`.

### Bookings / lifecycle
- **No eligible worker** (none online / KYC-approved / in radius / with skill) → booking stays `REQUESTED` or `EXPIRED`; customer must be told.
- **Double-accept race** — two workers (or retries) accept the same booking → must guard with a conditional update (`WHERE status = REQUESTED`) so only the first wins.
- **Out-of-order status** — e.g., `IN_PROGRESS` before `EN_ROUTE`, or transitions after a terminal state → must be rejected by the state machine.
- **Cancel timing** — customer cancels after `EN_ROUTE` (worker already traveling) → cancellation policy / fee considerations.
- **Worker rejects/timeout** → reassign to next nearest, or expire.
- **`scheduledAt` in the past** / far future → validate.
- **Recurring bookings** — fields exist; the scheduler is deferred (not implemented).
- **SOS** on a non-active booking → ignore/validate.

### Money / payments
- **Rounding** — commission uses integer math (`Math.round`); ensure worker credit + commission == amount (no lost paise).
- **Ledger/balance drift** — must update `WalletTransaction.runningBalance` and `Wallet.balance` in the **same transaction**; concurrent settlements need row locking or serialization.
- **Payout > balance** — reject; never allow negative balance.
- **Double settlement** — settling an already-`SETTLED` booking must be idempotent (guard on status).
- **Webhook replay / duplicate** — verify HMAC, then dedupe on `providerPaymentId`/event id; settling twice must be prevented.
- **Webhook needs raw body** — JSON-parsed body breaks signature verification (`rawBody:true`).
- **Amount tampering** — never trust client-sent amounts; recompute from booking/service.
- **Payment success but settlement fails** (or vice-versa) — reconcile; payment status vs booking status can race.
- **Cash flow** — worker collects cash → owes commission to platform (wallet debit), unlike online (escrow credit).
- **Currency** — only INR is modeled; multi-currency would need rework.
- **Mock vs Razorpay** — provider switches on `RAZORPAY_KEY_ID`; tests must cover both.

### Geo / PostGIS
- **Null location** — worker without `baseLocation` or address without `location` → excluded from / breaks distance queries; handle nulls.
- **Units** — geography distances are **meters**; radius stored in km (×1000). Mixing up units is a classic bug.
- **SRID** — must be 4326; `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` and beware **lng/lat order**.
- **Raw SQL quoting** — camelCase columns must be quoted (`wp."userId"`); geo `@map` columns are snake_case.
- **Index usage** — ensure GiST index on geography columns or searches table-scan.
- **Antimeridian / poles** — geography handles correctly, but test boundary coords.

### Realtime
- **Unauthorized handshake** → disconnect; client should fall back to polling.
- **Room authorization** — a user must only join `booking:<id>` rooms for their own bookings; otherwise they can eavesdrop on chat/location. Validate membership on `booking.join`.
- **Reconnection / missed events** — 12s polling fallback covers dropped sockets (free-tier hosts kill idle connections).
- **Single instance** — no Redis adapter, so horizontal scaling would break room delivery; add the Socket.IO Redis adapter before scaling out.
- **Message ordering / duplicates** — chat should tolerate out-of-order/duplicate delivery (idempotent render by id).

### KYC / workers
- **Going ONLINE without APPROVED KYC** — blocked; availability toggle is gated.
- **Going ONLINE without a worker profile** — worker app routes to onboarding first.
- **KYC rejected** — must allow re-submit; document status flow.
- **Skill removed mid-booking** — booking already assigned should still complete.

### Reviews / disputes
- **Review before completion** — only allowed on COMPLETED/SETTLED bookings; `isVerified` reflects this.
- **Duplicate review** per booking — prevent.
- **Rating bounds** — enforce 1–5; recompute `ratingAvg`/`ratingCount` atomically.
- **Dispute on settled booking** — resolution may need to claw back / refund from wallet; status → DISPUTED.

### Notifications / devices
- **No EAS projectId** — push no-ops; don't crash.
- **Stale/invalid Expo token** — exp.host returns errors per token; prune dead tokens.
- **Multiple devices** — a user can have many; `fcmToken` is unique; send to all.
- **Re-register same token** — upsert on unique `fcmToken`.

### Admin
- **Self-suspend / demote last super-admin** — guard against locking everyone out.
- **Suspend worker with in-flight bookings** — decide whether active jobs continue.
- **Audit completeness** — every mutation must write an `AuditLog`.

### Deployment / ops
- **Render cold start** — first request after idle takes ~30–60s; sockets drop on sleep.
- **`NEXT_PUBLIC_API_URL` not set at build** — web silently calls `localhost`; verify built bundle.
- **Migration on boot fails** (bad `DATABASE_URL`, missing PostGIS) — container won't start; check logs.
- **Upstash without TLS** (`redis://` vs `rediss://`) — connection fails.
- **Secrets in client** — `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` are embedded in shipped artifacts; never put secrets there.

### Data integrity
- **Unique constraints**: `User.phone`, `User.email`, `Wallet(userId, ownerType)`, `WorkerSkill(workerId, categoryId)`, `Referral.code`, `Device.fcmToken`, `Category.slug`. Handle conflict errors gracefully.
- **Cascade deletes** — deleting a `User` cascades to profile/devices/wallets/etc.; deleting a `Booking` cascades to events/messages/quotes. Production prefers **soft-delete** (suspend) over hard delete.
- **Self-referential category cycles** — guard against a category being its own ancestor.

---

## 13. Known limitations & deferred work

- BullMQ async jobs, recurring-booking scheduler — **deferred**.
- Razorpay Route (split payouts) — not implemented.
- Socket.IO **Redis adapter** — single-instance only; required before scaling out.
- WhatsApp/SMS providers, surge pricing, AI features — not implemented.
- Mobile: full map tracking (`react-native-maps` needs a Maps key + dev build); FCM specifics.
- Demo-mode shortcuts (devOtp, open CORS, debug-signed APKs) must be hardened pre-launch.

---

## 14. Interview question bank

Each question includes the **answer / talking points** grounded in this codebase. Use them to quiz a candidate or to study the system.

### A. System design & architecture
1. **Why a single NestJS app instead of microservices/monorepo here?** — Speed and simplicity for an MVP; one deployable, one DB, one schema. Modules give logical boundaries without distributed-systems overhead. You'd split out payments/notifications/realtime only when scale or team boundaries demand it.
2. **Walk through the lifecycle of a booking end-to-end.** — Customer creates → PostGIS finds nearest eligible worker → push + socket → worker accepts (race-safe update) → status chain EN_ROUTE/IN_PROGRESS/COMPLETED (each pushes customer + emits socket) → settlement computes commission, credits wallet → SETTLED → review.
3. **How would you scale this to 100k concurrent users?** — Add Socket.IO Redis adapter + multiple API instances behind a LB; move push/settlement to a queue (BullMQ); read replicas; connection pooling (PgBouncer/Supabase pooler); cache catalog; shard or partition bookings by time; CDN for web.
4. **Where are the single points of failure?** — Single API instance + single Redis (OTP/sessions) + single DB. Cold-start on free tier. No queue means settlement/push run inline with the request.

### B. Data modeling
5. **Why is money an integer (paise) not a float/decimal?** — Floats lose precision in arithmetic; integer minor units make commission/splits exact. Decimal is also valid but integers are simplest and fast.
6. **Explain the append-only wallet ledger.** — `WalletTransaction` is immutable; each row stores `runningBalance`; `Wallet.balance` is updated in the same transaction. Gives an auditable history and lets you reconstruct/verify balances.
7. **Why `Unsupported("geography(Point,4326)")` and `@map`?** — Prisma can't type PostGIS geography; you mark it Unsupported and use raw SQL. `@@map`/`@map` bridge the snake_case DB naming to camelCase Prisma fields.
8. **What unique constraints prevent bad data, and what do they protect against?** — phone/email (one account), `Wallet(userId, ownerType)` (one wallet per role), `WorkerSkill(workerId, categoryId)` (no dup skill), `Device.fcmToken` (token dedup), `Referral.code`, `Category.slug`.
9. **How would you model a worker who is also a customer?** — Today `User.role` is single-valued; you'd either allow dual wallets (the schema already keys wallet by `ownerType`) or split identity from role into a join table.

### C. Backend / NestJS
10. **How does the response envelope + exception filter work?** — Controllers return `ok(data, meta)`; a global `AllExceptionsFilter` shapes errors into `{ data:null, error, meta:null }`. Uniform client parsing.
11. **Guard order and `@Public`/`@Roles`?** — Global `JwtAuthGuard` then `RolesGuard`. `@Public()` skips auth; `@Roles()` enforces RBAC; `@CurrentUser()` injects the user.
12. **Why Zod pipes over class-validator?** — Single source of truth for runtime + TS types, composable schemas, no decorators/reflection quirks.
13. **The webhook needs `rawBody:true` — why?** — HMAC signature is computed over the exact raw bytes; a re-serialized JSON body won't match.

### D. Auth & security
14. **Walk through OTP security.** — Hashed in Redis, 5-min TTL, 5-attempt cap, 30s resend cooldown, hourly cap. Prevents brute force, replay, and SMS-bombing.
15. **Explain refresh-token rotation and reuse detection.** — Each refresh issues a new pair and revokes the old id (in Redis). A reused old token is revoked → 401; you can treat reuse as theft and revoke the whole family.
16. **What's insecure in demo mode and how do you fix it?** — `devOtp` in responses, open CORS, `origin:*` sockets, debug-signed APKs. Fix: real SMS provider + drop devOtp, restrict CORS/origins, managed signing key, gate by `NODE_ENV`.
17. **How do you stop a user from joining another user's booking room?** — Validate on `booking.join` that the authed user is the booking's customer or assigned worker before `socket.join`.

### E. Money & payments
18. **Show the math for a ₹199 booking at 15% commission.** — 19900 paise × 0.15 = 2985 commission; worker credited 16915. Integer math, `Math.round`.
19. **How is commission resolved?** — Precedence CATEGORY rule → GLOBAL rule → category `defaultCommissionPct`. `effectiveFrom` lets rules be time-bound.
20. **How do you make settlement idempotent?** — Guard on booking status (only settle `COMPLETED`), dedupe webhooks on `providerPaymentId`, and do the credit + status change in one transaction.
21. **Online vs cash settlement difference?** — Online: platform holds funds, credits worker minus commission (escrow). Cash: worker already has the money, so the platform debits commission from the worker wallet.
22. **How would you prevent a double payout?** — Status guard (QUEUED→PROCESSING), check balance ≥ amount within a locking transaction, and an idempotency key on the payout request.

### F. Geospatial
23. **How does nearest-worker search work?** — `ST_DWithin(base_location, ST_SetSRID(ST_MakePoint(lng,lat),4326), radius_m)` filters, then rank by distance + rating/reliability. GiST index makes it fast.
24. **Two classic PostGIS bugs?** — (a) lng/lat **order** in `ST_MakePoint`; (b) **meters vs km** (geography returns meters; radius is km). Also forgetting SRID 4326.
25. **Why geography over geometry?** — Geography computes real distances on the spheroid in meters without picking a projection — ideal for "within X km."

### G. Realtime
26. **Why keep polling if you have sockets?** — Free-tier hosts drop idle sockets and the gateway is single-instance; the 12s poll guarantees eventual consistency.
27. **What breaks if you run two API instances today?** — Socket rooms are in-memory per instance; a message emitted on instance A won't reach a client on instance B. Fix with the Socket.IO Redis adapter.
28. **How do you authenticate a socket connection?** — JWT on the handshake; invalid → emit error + disconnect.

### H. Mobile (Expo / RN)
29. **Why did vector icons render blank in the release APK, and how did you fix it?** — `@expo/vector-icons` requests font family `ionicons` (lowercase); runtime font loading failed in the local release build. Fix: embed `assets/fonts/ionicons.ttf` (lowercase — Android is case-sensitive) and load non-blocking.
30. **Why must `useFonts` be non-blocking here?** — Gating render on `fontsLoaded` hangs the whole app if the font never loads; better to render and let icons fill in (or rely on the native font).
31. **How is the API URL configured across dev/prod?** — `EXPO_PUBLIC_API_URL` (EAS profile) → `app.json extra.apiUrl` → localhost. Real device uses LAN IP; emulator uses 10.0.2.2.
32. **Preview vs production EAS profile?** — `preview` (internal distribution) → APK for sideloading; `production` → AAB for the Play Store.

### I. DevOps / deployment
33. **What happens on a Render deploy?** — Docker build → `prisma migrate deploy` on boot → start. Auto-deploys on push to `main`.
34. **Why might the web app call `localhost` in prod?** — `NEXT_PUBLIC_API_URL` is embedded at **build** time; if it wasn't set during the Vercel build, the bundle hardcodes the fallback. Verify by grepping the built JS.
35. **Why `rediss://` for Upstash?** — TLS is required; plain `redis://` fails to connect.
36. **The first request after a quiet period is slow — why?** — Render free tier sleeps after ~15 min idle; cold start spins the container back up.

### J. Debugging (real incidents from this project)
37. **Build fails: "Compose Compiler 1.5.15 requires Kotlin 1.9.25 but using 1.9.24." Diagnose.** — The `kotlin-gradle-plugin` classpath had no version, so it resolved transitively to 1.9.24; the `android.kotlinVersion` property doesn't reach the classpath. Fix: pin `classpath("…kotlin-gradle-plugin:$kotlinVersion")`.
38. **After renaming a font file, the build fails with "Duplicate resources." Why (on Windows)?** — Case-insensitive FS kept the old `Ionicons.ttf` in build intermediates while the source now has `ionicons.ttf`; AGP sees a case-collision. Fix: clear `intermediates/{assets,merged_assets,incremental,…}`.
39. **Friends can't log in to the deployed app. Walk the diagnosis.** — Backend uses `DevSmsService` (no real SMS) and prod hid `devOtp`, so no one could obtain the code. Confirmed by hitting `/auth/otp/request` (response had no code). Fix for demo: return `devOtp` (app already auto-fills it).

### K. Product / trade-offs
40. **How would you implement surge pricing?** — A pricing rule layer keyed on demand/supply per category+geo+time, applied at estimate time; store the applied multiplier on the booking for transparency.
41. **How do you guarantee a worker isn't double-booked?** — Availability set to BUSY on accept, conditional assignment, and reject overlapping `scheduledAt` windows.
42. **What metrics would you track for marketplace health?** — Request→accept rate, time-to-accept, completion rate, cancellation rate, GMV, take rate, worker utilization, repeat-booking rate, NPS/ratings.

### L. Behavioral / process
43. **You shipped a fix that made things worse (the font gate hung the app). What did you do?** — Reproduced from the screenshot, recognized the regression, gathered hard evidence (inspected the APK contents + library source), found the real cause (lowercase family name + case-sensitive lookup), and fixed it deterministically rather than guessing again.
44. **How do you decide build-it-now vs defer?** — Match scope to the goal (MVP/demo vs launch). Here: minimal backend first, real SMS/queues/scaling deferred until needed, with the schema complete so deferral doesn't cause churn.

---

*Generated as the canonical onboarding + reference doc for KaarigarGo. Keep it in sync with `prisma/schema.prisma` (data model), `src/**/*.controller.ts` (routes), and `DEPLOY.md` (deploy runbook).*
