import { getSession } from './session';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  if (session) return { authorization: `Bearer ${session.token}` };
  return { 'x-actor-type': 'ADMIN' };
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function apiPostSafe<T>(
  path: string,
  body: unknown,
): Promise<SafeResult<T>> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg: string;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message ?? parsed.error ?? text;
    } catch {
      msg = text || `Request failed (${res.status})`;
    }
    return { ok: false, error: typeof msg === 'string' ? msg : String(msg) };
  }
  return { ok: true, data: (await res.json()) as T };
}

export interface AdminOverview {
  activeHolds: number;
  confirmedUpcoming: number;
  bookings24h: number;
  captured24hMinor: number;
  payoutsPaidMinor: number;
  failedWebhooks: number;
}

export interface BookingRow {
  id: string;
  bookingCode: string;
  status: string;
  bookingType: string;
  checkInUtc: string;
  checkOutUtc: string;
  totalAmountMinor: number;
  currency: string;
  createdAt: string;
  unitName: string;
  propertyName: string;
  guestName: string;
}

export interface PaymentRow {
  id: string;
  status: string;
  provider: string;
  method: string;
  amountMinor: number;
  currency: string;
  refundedAmountMinor: number;
  capturedAt: string | null;
  createdAt: string;
  bookingCode: string;
}

export interface PayoutRow {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  provider: string | null;
  providerTransferId: string | null;
  paidAt: string | null;
  createdAt: string;
  bookingCode: string;
  hostName: string;
}

export interface LedgerBalance {
  account: string;
  currency: string;
  balanceMinor: number;
  entries: number;
}

export interface LedgerEntryRow {
  id: number;
  groupId: string;
  account: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: number;
  currency: string;
  description: string;
  createdAt: string;
  bookingCode: string | null;
}

export interface WebhookRow {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: string;
  signatureValid: boolean;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
}

export interface HostUnit {
  id: string;
  name: string;
  status: string;
  currency: string;
  hourlyRateMinor: number | null;
  nightlyRateMinor: number | null;
  supportsHourly: boolean;
  supportsNightly: boolean;
  propertyName: string;
}

export interface HostOverview {
  hostId: string;
  displayName: string;
  ratingAvg: number | null;
  ratingCount: number;
  units: HostUnit[];
  earningsPaidMinor: number;
  earningsPendingMinor: number;
  upcomingStays: number;
  bookings: BookingRow[];
}

export const getAdminOverview = (): Promise<AdminOverview> =>
  api('/admin/overview');
export const getAdminBookings = (limit = 50): Promise<BookingRow[]> =>
  api(`/admin/bookings?limit=${limit}`);
export const getAdminPayments = (limit = 50): Promise<PaymentRow[]> =>
  api(`/admin/payments?limit=${limit}`);
export const getAdminPayouts = (limit = 50): Promise<PayoutRow[]> =>
  api(`/admin/payouts?limit=${limit}`);
export const getAdminLedger = (
  limit = 50,
): Promise<{ balances: LedgerBalance[]; entries: LedgerEntryRow[] }> =>
  api(`/admin/ledger?limit=${limit}`);
export const getAdminWebhooks = (limit = 50): Promise<WebhookRow[]> =>
  api(`/admin/webhooks?limit=${limit}`);
export const getHostOverview = (): Promise<HostOverview | null> =>
  api('/host/overview');
export const getHostBookings = (limit = 50): Promise<BookingRow[]> =>
  api(`/host/bookings?limit=${limit}`);

// ---- discovery (public search) --------------------------------------------

export interface SearchResultItem {
  unitId: string;
  propertyId: string;
  unitName: string;
  propertyName: string;
  propertyType: string;
  city: string;
  distanceKm: number | null;
  currency: string;
  hourlyRateMinor: number | null;
  nightlyRateMinor: number | null;
  maxGuests: number;
  amenities: string[];
  ratingAvg: number | null;
  ratingCount: number;
  instantBook: boolean;
  available: boolean | null;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResults {
  total: number;
  page: number;
  pageSize: number;
  availabilityChecked: boolean;
  items: SearchResultItem[];
  facets: {
    propertyType: FacetBucket[];
    amenities: FacetBucket[];
    city: FacetBucket[];
  };
}

export interface SearchParams {
  text?: string;
  city?: string;
  mode?: 'HOURLY' | 'NIGHTLY';
  guests?: number;
  amenities?: string[];
  lat?: number;
  lon?: number;
  radiusKm?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'distance';
}

export const searchUnits = (params: SearchParams): Promise<SearchResults> =>
  apiPost('/search/units', params);

// ---- flash deals ----------------------------------------------------------

export interface FlashDealView {
  id: string;
  unitId: string;
  propertyId: string;
  propertyName: string;
  unitName: string;
  city: string;
  title: string;
  discountPct: number;
  status: string;
  startsAt: string;
  endsAt: string;
  quantityTotal: number;
  quantityClaimed: number;
  quantityRemaining: number;
  currency: string;
  baseHourlyRateMinor: number | null;
  baseNightlyRateMinor: number | null;
  secondsRemaining: number;
}

export const getActiveDeals = (): Promise<FlashDealView[]> => api('/deals/active');

// ---- booking flow -----------------------------------------------------------

export interface Booking {
  id: string;
  bookingCode: string;
  guestId: string;
  unitId: string;
  propertyId: string;
  bookingType: 'HOURLY' | 'NIGHTLY';
  status: string;
  source: string;
  checkInUtc: string;
  checkOutUtc: string;
  guestsCount: number;
  holdExpiresAt: string | null;
  currency: string;
  baseAmountMinor: number;
  cleaningFeeMinor: number;
  serviceFeeMinor: number;
  taxesMinor: number;
  discountMinor: number;
  totalAmountMinor: number;
  commissionPct: number;
  commissionMinor: number;
  hostPayoutMinor: number;
  flashDealId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HoldParams {
  guestId: string;
  unitId: string;
  bookingType: 'HOURLY' | 'NIGHTLY';
  checkInUtc: string;
  checkOutUtc: string;
  guestsCount: number;
}

export const createHold = (params: HoldParams): Promise<Booking> =>
  apiPost('/bookings/hold', params);

export const getBooking = (id: string): Promise<Booking> =>
  api(`/bookings/${id}`);

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  method: string;
  status: string;
  amountMinor: number;
  currency: string;
  capturedAt: string | null;
  createdAt: string;
}

export interface InitiatePaymentResult {
  payment: Payment;
  clientAction: Record<string, unknown> | null;
}

export const initiatePayment = (params: {
  bookingId: string;
  provider: string;
  method: string;
}): Promise<InitiatePaymentResult> => apiPost('/payments/initiate', params);

export const simulateCapture = (paymentId: string): Promise<{ accepted: boolean }> =>
  apiPost(`/payments/${paymentId}/simulate-capture`, {});

export const getPayment = (id: string): Promise<Payment> =>
  api(`/payments/${id}`);

// ---- guest bookings ---------------------------------------------------------

export const getGuestBookings = (limit = 50): Promise<Booking[]> =>
  api(`/bookings/mine?limit=${limit}`);

// ---- deal claiming ----------------------------------------------------------

export interface ClaimParams {
  guestId: string;
  bookingType: 'HOURLY' | 'NIGHTLY';
  checkInUtc: string;
  checkOutUtc: string;
  guestsCount: number;
}

export const claimDeal = (dealId: string, params: ClaimParams): Promise<Booking> =>
  apiPost(`/deals/${dealId}/claim`, params);

// ---- host deal creation -----------------------------------------------------

export interface CreateDealParams {
  unitId: string;
  title: string;
  discountPct: number;
  startsAt: string;
  endsAt: string;
  quantityTotal: number;
  applicableStayFrom?: string | null;
  applicableStayTo?: string | null;
}

export interface FlashDeal {
  id: string;
  unitId: string;
  hostId: string;
  title: string;
  discountPct: number;
  status: string;
  startsAt: string;
  endsAt: string;
  quantityTotal: number;
  quantityClaimed: number;
  createdAt: string;
}

export const createDeal = (params: CreateDealParams): Promise<FlashDeal> =>
  apiPost('/deals', params);
