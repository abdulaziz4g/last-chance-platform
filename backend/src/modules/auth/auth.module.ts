import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** Global: TokenService is consumed by the app-wide JwtAuthGuard. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [TokenService],
})
export class AuthModule {}
