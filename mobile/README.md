# KaarigarGo — Mobile

Two React Native + Expo apps that talk to the KaarigarGo API:

- **`customer/`** — KaarigarGo (book services, track, pay, review, wallet)
- **`worker/`** — KaarigarGo Pro (jobs feed, accept & progress jobs, earnings, payouts, availability)

Both use **Expo SDK 52 + Expo Router** and share an identical `src/` library
(`api.ts`, `auth.tsx`, `theme.ts`, `ui.tsx`, `format.ts`).

## Run

The backend API must be running first (see the root README).

```bash
cd mobile/customer   # or mobile/worker
npm install
npx expo start       # press a (Android), i (iOS), or scan the QR with Expo Go
```

### ⚠️ Important: the API URL

`app.json → expo.extra.apiUrl` defaults to `http://localhost:3000/api/v1`, which only works
in the **iOS simulator** or a web build. For a **real device (Expo Go)** or **Android
emulator**, `localhost` points at the phone, not your computer — update `apiUrl`:

- **Physical device:** use your computer's LAN IP, e.g. `http://192.168.1.20:3000/api/v1`
  (phone and computer on the same Wi-Fi). Also start the API so it binds all interfaces.
- **Android emulator:** use `http://10.0.2.2:3000/api/v1`.

## Demo logins (dev OTP is shown in-app)

- **Customer app:** `+919000000002`
- **Worker app:** `+919000000003` (seeded, KYC-approved, can go online)

## Screens

**Customer**: onboarding/OTP → tabs **Home** (categories) · **Bookings** · **Wallet** ·
**Profile**; booking flow (`book`), live booking detail with timeline, pay (mock/Razorpay) and review.

**Worker**: OTP (role WORKER) → tabs **Jobs** (new requests + active) · **Earnings**
(balance, request payout, history) · **Profile** (online/offline toggle gated by KYC); job
detail with the full action chain — accept/reject → en route → arrived → complete → collect cash.

## Notes

- Tokens are stored with `expo-secure-store`; the API client auto-refreshes on 401.
- Type-checked with `npm run typecheck` in each app.
- Worker onboarding (creating a brand-new worker profile) uses the seeded pro for the demo;
  a full profile-creation flow is a natural next addition.
