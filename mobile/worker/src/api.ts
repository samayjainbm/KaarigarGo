import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:3000/api/v1';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export interface ApiUser {
  id: string;
  role: 'CUSTOMER' | 'WORKER' | 'OPS_ADMIN' | 'SUPER_ADMIN';
  name: string | null;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  locale: string;
  status: string;
  workerProfile?: { id: string; kycStatus: string; availabilityStatus: string } | null;
}

export const tokens = {
  get access() {
    return accessToken;
  },
  async load() {
    accessToken = await SecureStore.getItemAsync('kg_access');
    refreshToken = await SecureStore.getItemAsync('kg_refresh');
  },
  async set(a: string, r: string) {
    accessToken = a;
    refreshToken = r;
    await SecureStore.setItemAsync('kg_access', a);
    await SecureStore.setItemAsync('kg_refresh', r);
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await SecureStore.deleteItemAsync('kg_access');
    await SecureStore.deleteItemAsync('kg_refresh');
  },
};

export class ApiError extends Error {
  constructor(public code: number, message: string, public details?: unknown) {
    super(message);
  }
}

interface Opts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  token?: string | null;
}

async function raw(path: string, opts: Opts = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts.token ?? (opts.auth ? accessToken : null);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res
    .json()
    .catch(() => ({ data: null, error: { code: res.status, message: 'Network error' }, meta: null }));
  if (!res.ok || json.error) {
    throw new ApiError(json.error?.code ?? res.status, json.error?.message ?? 'Request failed', json.error?.details);
  }
  return json;
}

export async function api(path: string, opts: Opts = {}): Promise<any> {
  try {
    return await raw(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.code === 401 && opts.auth && refreshToken) {
      try {
        const r = await raw('/auth/refresh', { method: 'POST', body: { refreshToken } });
        await tokens.set(r.data.accessToken, r.data.refreshToken);
        return await raw(path, { ...opts, token: r.data.accessToken });
      } catch {
        await tokens.clear();
        throw e;
      }
    }
    throw e;
  }
}

export const Api = {
  requestOtp: (phone: string, role?: string) =>
    api('/auth/otp/request', { method: 'POST', body: { phone, ...(role ? { role } : {}) } }),
  verifyOtp: (phone: string, code: string, role?: string) =>
    api('/auth/otp/verify', { method: 'POST', body: { phone, code, ...(role ? { role } : {}) } }),
  me: () => api('/me', { auth: true }),
  registerDevice: (body: unknown) => api('/me/devices', { method: 'POST', body, auth: true }),

  categories: () => api('/categories'),
  services: (categoryId?: string) => api(`/services${categoryId ? `?categoryId=${categoryId}` : ''}`),

  createBooking: (body: unknown) => api('/bookings', { method: 'POST', body, auth: true }),
  myBookings: (status?: string) => api(`/bookings${status ? `?status=${status}` : ''}`, { auth: true }),
  booking: (id: string) => api(`/bookings/${id}`, { auth: true }),
  review: (id: string, body: unknown) => api(`/bookings/${id}/review`, { method: 'POST', body, auth: true }),

  paymentOrder: (bookingId: string) => api('/payments/order', { method: 'POST', body: { bookingId }, auth: true }),
  mockPay: (orderId: string) => api(`/payments/order/${orderId}/mock-pay`, { method: 'POST' }),
  upiConfirm: (bookingId: string) => api('/payments/upi/confirm', { method: 'POST', body: { bookingId }, auth: true }),
  wallet: () => api('/wallet', { auth: true }),
  walletTxns: () => api('/wallet/transactions', { auth: true }),

  // Worker
  acceptJob: (id: string) => api(`/bookings/${id}/accept`, { method: 'POST', auth: true }),
  rejectJob: (id: string) => api(`/bookings/${id}/reject`, { method: 'POST', auth: true }),
  jobStatus: (id: string, status: string) =>
    api(`/bookings/${id}/status`, { method: 'POST', body: { status }, auth: true }),
  cashConfirm: (id: string) => api(`/bookings/${id}/cash/confirm`, { method: 'POST', auth: true }),
  workerProfile: () => api('/me', { auth: true }),
  patchWorkerProfile: (body: unknown) => api('/worker/profile', { method: 'PATCH', body, auth: true }),
  earnings: () => api('/worker/earnings', { auth: true }),
  payouts: () => api('/worker/payouts', { auth: true }),
  requestPayout: () => api('/worker/payouts/request', { method: 'POST', body: {}, auth: true }),

  createWorkerProfile: (body: unknown) => api('/worker/profile', { method: 'POST', body, auth: true }),
  addSkill: (body: unknown) => api('/worker/skills', { method: 'POST', body, auth: true }),
  submitKyc: (body: unknown) => api('/worker/kyc', { method: 'POST', body, auth: true }),
};
