/**
 * Outbound messaging to humans.
 *
 * Modelled on PaymentProviderRegistry: an interface plus a deterministic MOCK
 * driver that ships today, so the whole flow is exercisable end to end without
 * an account anywhere. Unifonic and Twilio implement the same two methods and
 * swap in at the module provider — nothing above this interface knows which is
 * in use, which is the point of having it.
 */

export type NotificationChannel = 'SMS' | 'PUSH' | 'EMAIL';

export interface NotificationMessage {
  channel: NotificationChannel;
  /** E.164 for SMS, device token for PUSH, address for EMAIL. */
  to: string;
  /** Short title — push notification headline, ignored for SMS. */
  title?: string;
  body: string;
  /** Correlates the send with the domain event that caused it. */
  reference?: string;
  /** Structured payload for a push client to route on. */
  data?: Record<string, string>;
}

export interface NotificationResult {
  provider: string;
  providerMessageId: string;
  channel: NotificationChannel;
  accepted: boolean;
  /** Present when the provider refused it. */
  failureReason?: string;
}

export interface NotificationPort {
  readonly name: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
