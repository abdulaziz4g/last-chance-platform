import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'SettingsService' });

/**
 * In-memory snapshot of `platform_settings` loaded at boot. Values here are
 * operational levers (hold duration, default commission) — a change requires
 * a rolling restart or the refresh() admin endpoint (Phase 4). Snapshotting
 * is intentional: request paths must never pay a settings query, and bookings
 * copy the values they were created under anyway (Phase 1 design).
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private values = new Map<string, unknown>();

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const res = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM platform_settings',
    );
    this.values = new Map(res.rows.map((r) => [r.key, r.value]));
    log.info({ count: this.values.size }, 'Platform settings loaded');
  }

  getNumber(key: string, fallback: number): number {
    const v = this.values.get(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  get holdMinutes(): number {
    return this.getNumber('payment_hold_minutes', 10);
  }

  get defaultCommissionPct(): number {
    return this.getNumber('default_commission_pct', 15);
  }

  get maxHourlyBookingHours(): number {
    return this.getNumber('max_hourly_booking_hours', 12);
  }
}
