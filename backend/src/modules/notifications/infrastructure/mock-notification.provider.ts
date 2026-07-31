import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  NotificationMessage,
  NotificationPort,
  NotificationResult,
} from '../domain/notification.port';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'MockNotificationProvider' });

/**
 * The development driver: logs the message and reports success.
 *
 * It exists so the rejection-notifies-the-host path is real code that runs in
 * every test, rather than a TODO that gets discovered the day Unifonic
 * credentials arrive. Deliberately refuses obviously-undeliverable addresses
 * so callers exercise the failure branch too — a provider that always succeeds
 * teaches you nothing about what happens when one does not.
 */
@Injectable()
export class MockNotificationProvider implements NotificationPort {
  readonly name = 'MOCK';

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const deliverable =
      message.to.trim().length > 0 &&
      (message.channel !== 'SMS' || /^\+[1-9][0-9]{6,14}$/.test(message.to));

    if (!deliverable) {
      log.warn(
        { channel: message.channel, reference: message.reference },
        'Notification refused: unusable destination',
      );
      return {
        provider: this.name,
        providerMessageId: `mock_rejected_${randomUUID()}`,
        channel: message.channel,
        accepted: false,
        failureReason: 'UNUSABLE_DESTINATION',
      };
    }

    log.info(
      {
        channel: message.channel,
        // The destination is a phone number or device token: log that one
        // exists and how it ends, never the whole thing.
        toSuffix: message.to.slice(-4),
        title: message.title,
        body: message.body,
        reference: message.reference,
      },
      'Notification sent (MOCK)',
    );

    return {
      provider: this.name,
      providerMessageId: `mock_${randomUUID()}`,
      channel: message.channel,
      accepted: true,
    };
  }
}
