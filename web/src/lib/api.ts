const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

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

const ACCESS = 'kg_access';
const REFRESH = 'kg_refresh';
const USER = 'kg_user';

export const session = {
  access: () => (typeof window !== 'undefined' ? localStorage.getItem(ACCESS) : null),
  refresh: () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH) : null),
  user: (): ApiUser | null => {
    if (typeof window === 'undefined') return null;
    const u = localStorage.getItem(USER);
    return u ? (JSON.parse(u) as ApiUser) : null;
  },
  set: (access: string, refresh: string, user?: ApiUser) => {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
    if (user) localStorage.setItem(USER, JSON.stringify(user));
  },
  setUser: (user: ApiUser) => localStorage.setItem(USER, JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(USER);
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
  const token = opts.token ?? (opts.auth ? session.access() : null);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res
    .json()
    .catch(() => ({ data: null, error: { code: res.status, message: res.statusText }, meta: null }));
  if (!res.ok || json.error) {
    throw new ApiError(json.error?.code ?? res.status, json.error?.message ?? 'Request failed', json.error?.details);
  }
  return json;
}

export async function api(path: string, opts: Opts = {}): Promise<any> {
  try {
    return await raw(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.code === 401 && opts.auth && session.refresh()) {
      try {
        const r = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: session.refresh() } });
        session.set(r.data.accessToken, r.data.refreshToken);
        return await raw(path, { ...opts, token: r.data.accessToken });
      } catch {
        session.clear();
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
  updateMe: (body: unknown) => api('/me', { method: 'PATCH', body, auth: true }),

  categories: () => api('/categories'),
  services: (categoryId?: string) => api(`/services${categoryId ? `?categoryId=${categoryId}` : ''}`),
  searchWorkers: (lat: number, lng: number, categoryId?: string) =>
    api(`/workers/search?lat=${lat}&lng=${lng}${categoryId ? `&categoryId=${categoryId}` : ''}`),

  createBooking: (body: unknown) => api('/bookings', { method: 'POST', body, auth: true }),
  myBookings: (status?: string) => api(`/bookings${status ? `?status=${status}` : ''}`, { auth: true }),
  booking: (id: string) => api(`/bookings/${id}`, { auth: true }),
  review: (id: string, body: unknown) => api(`/bookings/${id}/review`, { method: 'POST', body, auth: true }),

  paymentOrder: (bookingId: string) => api('/payments/order', { method: 'POST', body: { bookingId }, auth: true }),
  mockPay: (orderId: string) => api(`/payments/order/${orderId}/mock-pay`, { method: 'POST' }),
  wallet: () => api('/wallet', { auth: true }),

  // Admin
  adminOverview: () => api('/admin/analytics/overview', { auth: true }),
  adminBookings: (status?: string) => api(`/admin/bookings${status ? `?status=${status}` : ''}`, { auth: true }),
  adminKyc: (status = 'PENDING') => api(`/admin/kyc?status=${status}`, { auth: true }),
  approveKyc: (id: string) => api(`/admin/kyc/${id}/approve`, { method: 'POST', auth: true }),
  rejectKyc: (id: string, reason: string) =>
    api(`/admin/kyc/${id}/reject`, { method: 'POST', body: { reason }, auth: true }),
  adminDisputes: (status?: string) => api(`/admin/disputes${status ? `?status=${status}` : ''}`, { auth: true }),
  adminWorkers: () => api('/admin/workers', { auth: true }),
};
