/**
 * Moderation vocabulary — mirrors the PostgreSQL enums in migration 0016.
 * The database is the source of truth; these exist so the compiler checks
 * the mirror everywhere it is used.
 */

export const MODERATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_REASON_CODES = [
  'DOCUMENT_ILLEGIBLE',
  'DOCUMENT_EXPIRED',
  'DEED_NAME_MISMATCH',
  'PERMIT_INVALID',
  'PERMIT_NOT_FOUND',
  'NATIONAL_ADDRESS_MISMATCH',
  'LOCATION_MISMATCH',
  'PHOTOS_INSUFFICIENT',
  'PROHIBITED_CONTENT',
  'DUPLICATE_LISTING',
  'OTHER',
] as const;
export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];

export const PROPERTY_DOCUMENT_TYPES = [
  'TITLE_DEED',
  'LEASE_CONTRACT',
  'TOURISM_PERMIT',
  'NATIONAL_ADDRESS_CERT',
  'OTHER',
] as const;
export type PropertyDocumentType = (typeof PROPERTY_DOCUMENT_TYPES)[number];

export interface PropertyDocument {
  id: string;
  propertyId: string;
  documentType: PropertyDocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  issuedOn: string | null;
  expiresOn: string | null;
  uploadedBy: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

/** A listing as the admin review queue sees it. */
export interface ModerationQueueItem {
  propertyId: string;
  name: string;
  slug: string;
  propertyType: string;
  city: string;
  district: string | null;
  countryCode: string;
  moderationStatus: ModerationStatus;
  submittedAt: Date | null;
  hostId: string;
  hostDisplayName: string;
  hostKycStatus: string;
  nationalShortAddress: string | null;
  buildingNumber: string | null;
  additionalNumber: string | null;
  tourismPermitNumber: string | null;
  tourismPermitExpiresAt: string | null;
  unitCount: number;
  documentCount: number;
  /** Compliance gaps that would block approval — computed, never stored. */
  blockers: string[];
}

/** A unit as the inspection view shows it, beside the paperwork. */
export interface PropertyUnitSummary {
  unitId: string;
  name: string;
  unitType: string;
  status: string;
  maxGuests: number;
  currency: string;
  hourlyRateMinor: number | null;
  nightlyRateMinor: number | null;
  photos: string[];
}

export interface ModerationEvent {
  id: string;
  propertyId: string;
  fromStatus: ModerationStatus | null;
  toStatus: ModerationStatus;
  actorType: string;
  actorId: string | null;
  reasonCode: ModerationReasonCode | null;
  notes: string | null;
  createdAt: Date;
}
