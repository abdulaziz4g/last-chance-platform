import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';

/** Global: TokenService is consumed by the app-wide JwtAuthGuard. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, OtpService],
  exports: [TokenService, OtpService],
})
export class AuthModule {}
