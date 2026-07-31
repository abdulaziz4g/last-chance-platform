import { Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  ModerationConflictError,
  RejectionReasonRequiredError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import { ModerationFsmEngine } from './moderation-fsm.engine';
import { ModerationRepository } from '../infrastructure/moderation.repository';
import type {
  ModerationEvent,
  ModerationQueueItem,
  ModerationReasonCode,
  ModerationStatus,
  PropertyDocument,
} from '../domain/types';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'ModerationService' });

/**
 * Listing approval — the regulatory gate between a host's draft and a live
 * listing on the public map.
 *
 * Enforcement is layered exactly like the booking FSM: this service gives
 * clean errors and does the things a trigger cannot (authorisation, blocker
 * computation, notification fan-out), while the database refuses anything
 * illegal regardless of what this code does.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly repo: ModerationRepository,
    private readonly fsm: ModerationFsmEngine,
  ) {}

  queue(status: ModerationStatus | null, limit = 50): Promise<ModerationQueueItem[]> {
    return this.repo.findQueue(status, Math.min(Math.max(limit, 1), 200));
  }

  getOne(propertyId: string): Promise<ModerationQueueItem> {
    return this.repo.findOne(propertyId);
  }

  history(propertyId: string): Promise<ModerationEvent[]> {
    return this.repo.history(propertyId);
  }

  documents(propertyId: string): Promise<PropertyDocument[]> {
    return this.repo.listDocuments(propertyId);
  }

  /**
   * Resolves a document for streaming. Scoped by propertyId as well as its own
   * id, so a document id guessed from one listing cannot be read through
   * another's URL.
   */
  documentFor(
    propertyId: string,
    documentId: string,
  ): Promise<{ storageKey: string; contentType: string; fileName: string } | null> {
    return this.repo.storageKeyFor(propertyId, documentId);
  }

  /** Host submits a completed listing for review. */
  async submit(propertyId: string, actingUserId: string): Promise<ModerationStatus> {
    await this.assertHostOwns(propertyId, actingUserId);

    const detail = await this.repo.findOne(propertyId);
    // Fail here rather than let an admin discover the gaps: a submission that
    // cannot possibly be approved wastes a review slot and a host's day.
    if (detail.blockers.length > 0) {
      throw new ValidationFailedError(
        'The listing is not ready for review',
        { blockers: detail.blockers },
      );
    }
    return this.move(propertyId, 'PENDING_APPROVAL');
  }

  /** Host pulls a submission back to keep editing. */
  async withdraw(propertyId: string, actingUserId: string): Promise<ModerationStatus> {
    await this.assertHostOwns(propertyId, actingUserId);
    return this.move(propertyId, 'DRAFT');
  }

  /**
   * Admin approves. This both clears the regulatory gate AND brings the
   * listing online — the spec's `is_active = true`. Under the two-axis model
   * that is two columns, and forgetting the second one silently approves
   * something nobody can see.
   */
  async approve(propertyId: string): Promise<ModerationStatus> {
    const detail = await this.repo.findOne(propertyId);
    if (detail.blockers.length > 0) {
      throw new ValidationFailedError(
        'Cannot approve a listing with outstanding compliance gaps',
        { blockers: detail.blockers },
      );
    }
    const result = await this.move(propertyId, 'APPROVED', null, null, true);
    log.info({ propertyId }, 'Listing approved and published');
    return result;
  }

  async reject(
    propertyId: string,
    reasonCode: ModerationReasonCode,
    notes?: string,
  ): Promise<ModerationStatus> {
    if (!reasonCode) throw new RejectionReasonRequiredError();
    const result = await this.move(propertyId, 'REJECTED', reasonCode, notes);
    log.info({ propertyId, reasonCode }, 'Listing rejected');
    return result;
  }

  async suspend(
    propertyId: string,
    reasonCode: ModerationReasonCode,
    notes?: string,
  ): Promise<ModerationStatus> {
    const result = await this.move(propertyId, 'SUSPENDED', reasonCode, notes);
    log.warn({ propertyId, reasonCode }, 'Live listing suspended');
    return result;
  }

  async reinstate(propertyId: string, notes?: string): Promise<ModerationStatus> {
    return this.move(propertyId, 'APPROVED', null, notes, true);
  }

  /** Forces a re-review — used when a permit lapses or the host edits a listing materially. */
  async requireReReview(propertyId: string, notes?: string): Promise<ModerationStatus> {
    return this.move(propertyId, 'PENDING_APPROVAL', null, notes);
  }

  allowedNext(from: ModerationStatus): readonly ModerationStatus[] {
    return this.fsm.allowedFrom(from);
  }

  // -------------------------------------------------------------------------

  private async move(
    propertyId: string,
    to: ModerationStatus,
    reasonCode: ModerationReasonCode | null = null,
    notes?: string | null,
    activate = false,
  ): Promise<ModerationStatus> {
    const from = await this.repo.currentStatus(propertyId);
    this.fsm.assertTransition(from, to);

    const applied = await this.repo.transition({
      propertyId,
      from,
      to,
      reasonCode,
      notes,
      activate,
    });

    // Zero rows means the status moved between our read and our write —
    // two admins clicking at once. Surfacing it beats silently reporting
    // success for a transition that never happened.
    if (applied === null) {
      throw new ModerationConflictError(propertyId, from, to);
    }
    return applied;
  }

  private async assertHostOwns(propertyId: string, userId: string): Promise<void> {
    const hostId = await this.repo.hostIdFor(propertyId);
    if (hostId !== userId) {
      throw new ForbiddenError('This listing belongs to another host');
    }
  }
}
