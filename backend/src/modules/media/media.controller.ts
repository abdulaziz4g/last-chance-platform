import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
// Registers the `file()` decorator onto FastifyRequest's type.
import type { MultipartFile } from '@fastify/multipart';
import { parseWith } from '../../common/validation';
import { Public, RateLimit, Roles } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { ValidationFailedError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/config.service';
import {
  MAX_PHOTO_BYTES,
  UnitPhotoService,
} from './application/unit-photo.service';

const removeSchema = z.object({ url: z.string().min(1).max(2000) });

/** Narrow view of the decorator the multipart plugin adds at registration. */
type WithFile = {
  file?: (options?: {
    limits?: { fileSize?: number };
  }) => Promise<MultipartFile | undefined>;
};

@Controller('units/:id/photos')
export class MediaController {
  constructor(
    private readonly photos: UnitPhotoService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  list(@Param('id', ParseUUIDPipe) id: string): Promise<string[]> {
    return this.photos.list(id);
  }

  /**
   * Multipart upload of one image. Ownership is checked against the unit's
   * property, so a host cannot add photos to someone else's listing.
   */
  @Roles('HOST', 'ADMIN')
  @RateLimit(30, 60)
  @Post()
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ photos: string[] }> {
    const withFile = req as AuthenticatedRequest & WithFile;
    if (typeof withFile.file !== 'function') {
      throw new ValidationFailedError('Expected a multipart upload');
    }
    const part = await withFile.file({ limits: { fileSize: MAX_PHOTO_BYTES } });
    if (!part) throw new ValidationFailedError('No file was uploaded');

    const bytes = await part.toBuffer();
    const photos = await this.photos.upload({
      unitId: id,
      bytes,
      userId: req.authClaims?.sub ?? null,
      isOperator: this.isOperator(req),
    });
    return { photos };
  }

  @Roles('HOST', 'ADMIN')
  @Delete()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ photos: string[] }> {
    const { url } = parseWith(removeSchema, body);
    const photos = await this.photos.remove({
      unitId: id,
      url,
      userId: req.authClaims?.sub ?? null,
      isOperator: this.isOperator(req),
    });
    return { photos };
  }

  /**
   * Admins, plus the tokenless dev-fallback path the console and smokes use.
   * The guard has already rejected tokenless requests in production.
   */
  private isOperator(req: AuthenticatedRequest): boolean {
    if (!req.authClaims) return this.config.authDevFallback;
    return req.authClaims.role === 'ADMIN';
  }
}
