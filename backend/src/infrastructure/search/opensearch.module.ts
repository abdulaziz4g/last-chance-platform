import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { AppConfigService } from '../../config/config.service';

export const OPENSEARCH_CLIENT = Symbol('OPENSEARCH_CLIENT');

/**
 * OpenSearch client provider. In production this points at a managed domain
 * (AWS OpenSearch / self-hosted cluster) with TLS + SigV4/basic auth injected
 * from secrets; dev talks to the single-node container over plain HTTP.
 */
@Global()
@Module({
  providers: [
    {
      provide: OPENSEARCH_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Client({
          node: config.openSearchUrl,
          // Search is a best-effort read path — fail fast and let the caller
          // degrade rather than hang a request thread.
          requestTimeout: 5_000,
          maxRetries: 2,
        }),
    },
  ],
  exports: [OPENSEARCH_CLIENT],
})
export class OpenSearchModule implements OnApplicationShutdown {
  constructor(@Inject(OPENSEARCH_CLIENT) private readonly client: Client) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
