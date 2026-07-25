import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { ContextModule } from './common/context/context.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { ContextGuard } from './common/context/context.guard';
import { RateLimitGuard } from './common/auth/rate-limit.guard';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { OpenSearchModule } from './infrastructure/search/opensearch.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { SearchModule } from './modules/search/search.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DealsModule } from './modules/deals/deals.module';
import { DocsModule } from './modules/docs/docs.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Modular monolith, microservices-ready: every module under `modules/`
 * communicates with the others only through injected services and published
 * events — never by reaching into another module's repositories. Extracting
 * a module into its own service later is a deployment change, not a rewrite.
 */
@Module({
  imports: [
    ConfigModule,
    ContextModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    OpenSearchModule,
    SettingsModule,
    AuthModule,
    BookingModule,
    PaymentModule,
    ReportingModule,
    RealtimeModule,
    SearchModule,
    InventoryModule,
    DealsModule,
    DocsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Order matters: bind context, throttle cheap, authenticate, authorize.
    { provide: APP_GUARD, useClass: ContextGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
