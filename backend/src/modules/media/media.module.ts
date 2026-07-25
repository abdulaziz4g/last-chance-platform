import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { UnitPhotoService } from './application/unit-photo.service';
import { UnitPhotoRepository } from './infrastructure/unit-photo.repository';
import { LocalDiskStorage } from './infrastructure/local-disk.storage';
import { STORAGE_PORT } from './domain/storage.port';

/**
 * Swap the STORAGE_PORT provider for an S3 driver to move uploads off the
 * local filesystem; nothing else in the module needs to change.
 */
@Module({
  controllers: [MediaController],
  providers: [
    UnitPhotoService,
    UnitPhotoRepository,
    LocalDiskStorage,
    { provide: STORAGE_PORT, useExisting: LocalDiskStorage },
  ],
  exports: [UnitPhotoService],
})
export class MediaModule {}
