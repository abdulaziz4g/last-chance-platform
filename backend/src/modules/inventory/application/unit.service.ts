import { Injectable } from '@nestjs/common';
import { UnitNotFoundError } from '../../../common/errors/domain-errors';
import { UnitRepository } from '../infrastructure/unit.repository';
import type { UnitDetail } from '../domain/types';

@Injectable()
export class UnitService {
  constructor(private readonly units: UnitRepository) {}

  async getPublicDetail(unitId: string): Promise<UnitDetail> {
    const detail = await this.units.findPublicDetail(unitId);
    if (!detail) throw new UnitNotFoundError(unitId);
    return detail;
  }
}
