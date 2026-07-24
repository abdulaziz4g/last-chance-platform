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
