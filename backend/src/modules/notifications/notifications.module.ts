import { Global, Module } from '@nestjs/common';
import { HostNotifierService } from './application/host-notifier.service';
import { OtpNotifierService } from './application/otp-notifier.service';
import { MockNotificationProvider } from './infrastructure/mock-notification.provider';
import { NOTIFICATION_PORT } from './domain/notification.port';

/**
 * Swap the NOTIFICATION_PORT provider for a Unifonic or Twilio driver to send
 * real messages; nothing else in the codebase changes. Global because
 * notification is a cross-cutting concern several modules will want, and
 * threading it through imports one module at a time buys nothing.
 */
@Global()
@Module({
  providers: [
    MockNotificationProvider,
    { provide: NOTIFICATION_PORT, useExisting: MockNotificationProvider },
    HostNotifierService,
    OtpNotifierService,
  ],
  exports: [HostNotifierService, OtpNotifierService, NOTIFICATION_PORT],
})
export class NotificationsModule {}
