import type { DatabaseService } from '../../src/infrastructure/database/database.service';

/**
 * Test fixture helper: take a freshly-inserted property all the way to APPROVED
 * so its units are bookable and visible.
 *
 * Since migration 0016 a listing is not sellable just because it exists. That
 * is the point — but it means every fixture that wants a bookable unit has to
 * clear the regulatory gate first, and there is no shortcut worth having:
 *   - the CHECK refuses APPROVED without a National Address and permit, and
 *   - the FSM trigger (LC410) refuses DRAFT -> APPROVED directly.
 * So this walks the real path: fill the compliance pack, submit, approve.
 *
 * Deliberately NOT a SQL helper function in the schema. A `fn_dev_approve()`
 * living in the production database is exactly the kind of convenience that
 * eventually gets called by something that is not a test.
 */
export async function approveListing(
  db: DatabaseService,
  propertyId: string,
  opts: { permitNumber?: string } = {},
): Promise<void> {
  await db.query(
    `UPDATE properties
        SET national_short_address    = 'TEST1234',
            building_number           = '0001',
            additional_number         = '0002',
            district                  = 'Test District',
            tourism_permit_number     = $2,
            tourism_permit_expires_at = current_date + 365,
            status                    = 'ACTIVE'
      WHERE id = $1`,
    [propertyId, opts.permitNumber ?? `MT-TEST-${propertyId.slice(0, 8)}`],
  );

  // Two hops, because the FSM has no edge from DRAFT straight to APPROVED.
  await db.query(
    `UPDATE properties SET moderation_status = 'PENDING_APPROVAL' WHERE id = $1`,
    [propertyId],
  );
  await db.query(
    `UPDATE properties SET moderation_status = 'APPROVED' WHERE id = $1`,
    [propertyId],
  );
}
