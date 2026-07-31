/**
 * Moderation vocabulary and view types.
 *
 * Deliberately separate from `lib/api.ts`: that module imports `lib/session`,
 * which imports `next/headers` and is therefore server-only. A client
 * component that needs the reason-code list would drag the whole server chain
 * into the browser bundle and fail to compile — so the shared vocabulary lives
 * here, importable from either side, and api.ts re-exports it for callers that
 * already have it in scope.
 */

export type ModerationStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

/** Mirrors the moderation_reason_code enum (migration 0016). */
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

export interface ModerationQueueItem {
  propertyId: string;
  name: string;
  slug: string;
  propertyType: string;
  city: string;
  district: string | null;
  countryCode: string;
  moderationStatus: ModerationStatus;
  submittedAt: string | null;
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
  blockers: string[];
}

export interface PropertyDocument {
  id: string;
  propertyId: string;
  documentType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  issuedOn: string | null;
  expiresOn: string | null;
  uploadedBy: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
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
  createdAt: string;
}

export interface ModerationDetail {
  property: ModerationQueueItem;
  documents: PropertyDocument[];
  history: ModerationEvent[];
  allowedNext: ModerationStatus[];
}

/**
 * Documents are streamed through an authenticated same-origin proxy, never a
 * public path — a title deed at a guessable URL would defeat the whole gate.
 */
export const moderationDocumentHref = (
  propertyId: string,
  documentId: string,
): string => `/admin/moderation/${propertyId}/document/${documentId}`;
