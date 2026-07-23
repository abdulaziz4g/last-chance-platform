import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { UnitNotBookableError } from '../../../common/errors/domain-errors';
import { BookableUnit } from '../domain/types';

interface UnitRow {
  id: string;
  property_id: string;
  supports_hourly: boolean;
  supports_nightly: boolean;
  max_guests: number;
  currency: string;
  base_nightly_rate_minor: number | null;
  base_hourly_rate_minor: number | null;
  min_hourly_duration_minutes: number;
  turnaround_minutes: number;
  unit_status: string;
  property_status: string;
  host_id: string;
  commission_pct_override: number | null;
}

@Injectable()
export class UnitRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Loads a unit with everything the booking flow needs, or throws. */
  async findBookable(unitId: string): Promise<BookableUnit> {
    const res = await this.db.query<UnitRow>(
      `SELECT u.id, u.property_id, u.supports_hourly, u.supports_nightly,
              u.max_guests, u.currency,
              u.base_nightly_rate_minor, u.base_hourly_rate_minor,
              u.min_hourly_duration_minutes, u.turnaround_minutes,
              u.status AS unit_status,
              p.status AS property_status,
              p.host_id,
              h.commission_pct_override
       FROM units u
       JOIN properties p ON p.id = u.property_id
       JOIN host_profiles h ON h.user_id = p.host_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [unitId],
    );

    const row = res.rows[0];
    if (!row) {
      throw new UnitNotBookableError('Unit does not exist', { unitId });
    }
    if (row.unit_status !== 'ACTIVE' || row.property_status !== 'ACTIVE') {
      throw new UnitNotBookableError('Unit is not open for booking', {
        unitId,
        unitStatus: row.unit_status,
        propertyStatus: row.property_status,
      });
    }

    return {
      id: row.id,
      propertyId: row.property_id,
      supportsHourly: row.supports_hourly,
      supportsNightly: row.supports_nightly,
      maxGuests: row.max_guests,
      currency: row.currency,
      baseNightlyRateMinor: row.base_nightly_rate_minor,
      baseHourlyRateMinor: row.base_hourly_rate_minor,
      minHourlyDurationMinutes: row.min_hourly_duration_minutes,
      turnaroundMinutes: row.turnaround_minutes,
      unitStatus: row.unit_status,
      propertyStatus: row.property_status,
      hostId: row.host_id,
      commissionPctOverride: row.commission_pct_override,
    };
  }
}
