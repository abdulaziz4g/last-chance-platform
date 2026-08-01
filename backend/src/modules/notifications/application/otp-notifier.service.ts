import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../domain/notification.port';
import { ValidationFailedError } from '../../../common/errors/domain-errors';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'OtpNotifier' });

/**
 * Delivers sign-in codes over the existing NotificationPort.
 *
 * A caller of the messaging infrastructure, not a second copy of it: the port,
 * the MOCK driver and the future Unifonic/Twilio driver are all shared with
 * host notifications. One provider to configure, one to swap.
 *
 * UNLIKE host notifications, delivery here is NOT best-effort. A moderation
 * decision stands whether or not its courtesy message arrives; a sign-in code
 * that was never sent leaves the user staring at an input box for a code that
 * does not exist. So a refusal from the provider surfaces as an error the
 * client can act on.
 */
@Injectable()
export class OtpNotifierService {
  constructor(
    @Inject(NOTIFICATION_PORT) private readonly notifier: NotificationPort,
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const result = await this.notifier.send({
      channel: 'SMS',
      to: phone,
      // Deliberately terse: SMS is billed per segment, and a code buried in
      // marketing copy is harder to read off a lock screen.
      body: `${code} is your Last Chance verification code. It expires in 2 minutes. Never share it.`,
      reference: `auth:otp:${phone.slice(-4)}`,
      data: { kind: 'AUTH_OTP' },
    });

    if (!result.accepted) {
      log.error(
        { phoneSuffix: phone.slice(-4), reason: result.failureReason },
        'OTP delivery refused by provider',
      );
      throw new ValidationFailedError(
        'We could not send a code to that number. Check it and try again.',
        { reason: result.failureReason ?? 'DELIVERY_REFUSED' },
      );
    }
  }
}
