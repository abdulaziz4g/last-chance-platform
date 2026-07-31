import { Injectable } from '@nestjs/common';
import { ValidationFailedError } from '../../../common/errors/domain-errors';
import { MapSearchRepository } from '../infrastructure/map-search.repository';
import type { MapPin, MapSearchQuery } from '../domain/map-types';
import { BOOKING_TYPES, type BookingType } from '../../booking/domain/types';

/**
 * Guard rails for viewport queries. A map client that drags fast can otherwise
 * ask for the whole planet at once; these caps keep a single pan gesture from
 * turning into a full-table geo scan.
 */
const MAX_SPAN_DEGREES = 5;
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 120;

@Injectable()
export class MapSearchService {
  constructor(private readonly repo: MapSearchRepository) {}

  async search(raw: Record<string, string | undefined>): Promise<{
    pins: MapPin[];
    truncated: boolean;
  }> {
    const query = this.parse(raw);
    const pins = await this.repo.search(query);
    return {
      pins,
      // Lets the client tell the user "zoom in to see everything" instead of
      // silently showing an arbitrary subset of what is really there.
      truncated: pins.length >= query.limit,
    };
  }

  private parse(raw: Record<string, string | undefined>): MapSearchQuery {
    const num = (key: string): number => {
      const value = Number(raw[key]);
      if (!Number.isFinite(value)) {
        throw new ValidationFailedError(`${key} must be a number`, { [key]: raw[key] });
      }
      return value;
    };

    const minLng = num('min_lng');
    const minLat = num('min_lat');
    const maxLng = num('max_lng');
    const maxLat = num('max_lat');

    if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
      throw new ValidationFailedError('Bounding box is outside valid WGS84 range');
    }
    if (maxLng <= minLng || maxLat <= minLat) {
      throw new ValidationFailedError(
        'Bounding box must have max_lng > min_lng and max_lat > min_lat',
      );
    }
    if (maxLng - minLng > MAX_SPAN_DEGREES || maxLat - minLat > MAX_SPAN_DEGREES) {
      throw new ValidationFailedError(
        `Viewport is too large; span must be under ${MAX_SPAN_DEGREES}° per axis`,
        { maxSpanDegrees: MAX_SPAN_DEGREES },
      );
    }

    const bookingType = (raw['booking_type'] ?? 'NIGHTLY').toUpperCase();
    if (!BOOKING_TYPES.includes(bookingType as BookingType)) {
      throw new ValidationFailedError('booking_type must be HOURLY or NIGHTLY', {
        bookingType: raw['booking_type'],
      });
    }

    const checkInUtc = this.date(raw['check_in_utc'], 'check_in_utc');
    const checkOutUtc = this.date(raw['check_out_utc'], 'check_out_utc');
    // Half a date range silently disables the availability filter, which would
    // show the guest pins they cannot book. Demand both or neither.
    if ((checkInUtc === null) !== (checkOutUtc === null)) {
      throw new ValidationFailedError(
        'check_in_utc and check_out_utc must be supplied together',
      );
    }
    if (checkInUtc && checkOutUtc && checkOutUtc <= checkInUtc) {
      throw new ValidationFailedError('check_out_utc must be after check_in_utc');
    }

    const guestsRaw = raw['guests'];
    const guests = guestsRaw === undefined ? null : Number(guestsRaw);
    if (guests !== null && (!Number.isInteger(guests) || guests < 1)) {
      throw new ValidationFailedError('guests must be a positive integer');
    }

    const limitRaw = Number(raw['limit']);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    return {
      minLng,
      minLat,
      maxLng,
      maxLat,
      bookingType: bookingType as BookingType,
      checkInUtc,
      checkOutUtc,
      guests,
      limit,
    };
  }

  private date(value: string | undefined, field: string): Date | null {
    if (value === undefined || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationFailedError(`${field} must be an ISO-8601 instant`, {
        [field]: value,
      });
    }
    return parsed;
  }
}
