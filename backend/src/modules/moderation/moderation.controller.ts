import { Body, Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ModerationService } from './application/moderation.service';
import { Roles } from '../../common/auth/decorators';
import { RequestContextService } from '../../common/context/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../media/domain/storage.port';
import {
  UnauthorizedError,
  ValidationFailedError,
} from '../../common/errors/domain-errors';
import {
  MODERATION_REASON_CODES,
  MODERATION_STATUSES,
  type ModerationQueueItem,
  type ModerationStatus,
} from './domain/types';

const statusQuery = z.enum(MODERATION_STATUSES).optional();
const reasonSchema = z.enum(MODERATION_REASON_CODES);

const decisionSchema = z.object({
  reasonCode: reasonSchema,
  notes: z.string().max(2000).optional(),
});

const reinstateSchema = z.object({
  notes: z.string().max(2000).optional(),
});

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationFailedError('Invalid moderation request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
};

/**
 * Listing moderation. Admin routes decide; host routes submit and withdraw.
 *
 * Everything under /admin requires the ADMIN platform role via RolesGuard —
 * an approval is a regulatory assertion, so authorisation is not optional and
 * is not left to the UI to enforce.
 */
@Controller()
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly ctx: RequestContextService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /**
   * Streams one regulatory document to a reviewing admin.
   *
   * Deliberately NOT a public URL. Listing photos are served straight off the
   * static mount because they are meant to be seen; a title deed, a lease
   * contract and an owner's tourism permit are not. Routing the bytes through
   * an authenticated handler means possessing the storage key is not the same
   * as being allowed to read the file, and RolesGuard decides instead.
   *
   * Rendered inline so the inspection view can embed it beside the photos —
   * the reviewer is comparing the two, and a download prompt breaks that.
   */
  @Get('admin/moderation/:propertyId/documents/:documentId/file')
  @Roles('ADMIN')
  async documentFile(
    @Param('propertyId') propertyId: string,
    @Param('documentId') documentId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const doc = await this.moderation.documentFor(propertyId, documentId);
    const bytes = doc && (await this.storage.read(doc.storageKey));

    if (!doc || !bytes) {
      void reply.status(404).send({
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      });
      return;
    }

    void reply
      .header('content-type', doc.contentType)
      .header(
        'content-disposition',
        `inline; filename="${doc.fileName.replace(/["\r\n]/g, '')}"`,
      )
      // Regulated paperwork must not linger in a shared cache.
      .header('cache-control', 'private, no-store')
      .send(bytes);
  }

  // ---- admin -------------------------------------------------------------

  /** The pending review queue. Defaults to PENDING_APPROVAL — the working set. */
  @Get('admin/moderation/queue')
  @Roles('ADMIN')
  async queue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: ModerationQueueItem[] }> {
    const parsed = statusQuery.safeParse(status);
    if (!parsed.success) {
      throw new ValidationFailedError('Unknown moderation status', { status });
    }
    const effective: ModerationStatus | null =
      parsed.data ?? (status === 'ALL' ? null : 'PENDING_APPROVAL');
    const items = await this.moderation.queue(effective, Number(limit) || 50);
    return { items };
  }

  /** Everything the document-inspection modal needs, in one round-trip. */
  @Get('admin/moderation/:propertyId')
  @Roles('ADMIN')
  async detail(@Param('propertyId') propertyId: string): Promise<{
    property: ModerationQueueItem;
    documents: unknown[];
    units: unknown[];
    history: unknown[];
    allowedNext: readonly string[];
  }> {
    const property = await this.moderation.getOne(propertyId);
    const [documents, units, history] = await Promise.all([
      this.moderation.documents(propertyId),
      this.moderation.units(propertyId),
      this.moderation.history(propertyId),
    ]);
    return {
      property,
      documents,
      units,
      history,
      allowedNext: this.moderation.allowedNext(property.moderationStatus),
    };
  }

  @Post('admin/moderation/:propertyId/approve')
  @Roles('ADMIN')
  async approve(
    @Param('propertyId') propertyId: string,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    return { moderationStatus: await this.moderation.approve(propertyId) };
  }

  @Post('admin/moderation/:propertyId/reject')
  @Roles('ADMIN')
  async reject(
    @Param('propertyId') propertyId: string,
    @Body() body: unknown,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    const { reasonCode, notes } = parse(decisionSchema, body);
    return {
      moderationStatus: await this.moderation.reject(propertyId, reasonCode, notes),
    };
  }

  @Post('admin/moderation/:propertyId/suspend')
  @Roles('ADMIN')
  async suspend(
    @Param('propertyId') propertyId: string,
    @Body() body: unknown,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    const { reasonCode, notes } = parse(decisionSchema, body);
    return {
      moderationStatus: await this.moderation.suspend(propertyId, reasonCode, notes),
    };
  }

  @Post('admin/moderation/:propertyId/reinstate')
  @Roles('ADMIN')
  async reinstate(
    @Param('propertyId') propertyId: string,
    @Body() body: unknown,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    const { notes } = parse(reinstateSchema, body);
    return { moderationStatus: await this.moderation.reinstate(propertyId, notes) };
  }

  // ---- host --------------------------------------------------------------

  @Post('host/properties/:propertyId/submit')
  @Roles('HOST')
  async submit(
    @Param('propertyId') propertyId: string,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    return {
      moderationStatus: await this.moderation.submit(propertyId, this.actingUser()),
    };
  }

  @Post('host/properties/:propertyId/withdraw')
  @Roles('HOST')
  async withdraw(
    @Param('propertyId') propertyId: string,
  ): Promise<{ moderationStatus: ModerationStatus }> {
    return {
      moderationStatus: await this.moderation.withdraw(propertyId, this.actingUser()),
    };
  }

  /** Host-facing readiness view: what still blocks submission. */
  @Get('host/properties/:propertyId/readiness')
  @Roles('HOST')
  async readiness(@Param('propertyId') propertyId: string): Promise<{
    moderationStatus: ModerationStatus;
    blockers: string[];
    documents: unknown[];
  }> {
    const property = await this.moderation.getOne(propertyId);
    return {
      moderationStatus: property.moderationStatus,
      blockers: property.blockers,
      documents: await this.moderation.documents(propertyId),
    };
  }

  private actingUser(): string {
    const actorId = this.ctx.current()?.actorId;
    if (!actorId) throw new UnauthorizedError();
    return actorId;
  }
}
