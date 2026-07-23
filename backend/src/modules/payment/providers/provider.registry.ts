import { Injectable } from '@nestjs/common';
import { ValidationFailedError } from '../../../common/errors/domain-errors';
import { PaymentProviderName } from '../domain/types';
import { PaymentProviderPort } from './payment-provider.interface';
import { MockPaymentProvider } from './mock.provider';
import { StripePaymentProvider } from './stripe.provider';
import { AppConfigService } from '../../../config/config.service';

/**
 * Provider lookup. A provider is "enabled" when its credentials are
 * configured; MOCK is enabled everywhere except production. HyperPay,
 * Moyasar, and Tap implement the same port and register here as they land.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentProviderName, PaymentProviderPort>();

  constructor(
    config: AppConfigService,
    mock: MockPaymentProvider,
    stripe: StripePaymentProvider,
  ) {
    if (config.nodeEnv !== 'production') {
      this.providers.set('MOCK', mock);
    }
    if (stripe.enabled) {
      this.providers.set('STRIPE', stripe);
    }
  }

  get(name: PaymentProviderName): PaymentProviderPort {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ValidationFailedError(
        `Payment provider ${name} is not enabled`,
        { provider: name, enabled: [...this.providers.keys()] },
      );
    }
    return provider;
  }

  enabledNames(): PaymentProviderName[] {
    return [...this.providers.keys()];
  }
}
