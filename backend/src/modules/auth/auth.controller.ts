import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Public, RateLimit } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { UnauthorizedError } from '../../common/errors/domain-errors';
import { AuthResult, AuthService } from './auth.service';
import type { AuthClaims } from './token.service';
import type { OtpChallenge } from './otp.service';

const registerSchema = z.object({
  email: z.string().email().max(254),
  // Length over composition rules (NIST 800-63B); breach-list screening is a
  // Phase-7 enhancement.
  password: z.string().min(10).max(128),
  fullName: z.string().min(1).max(200),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// Loose here on purpose: OtpService.normalisePhone handles 05XXXXXXXX,
// 5XXXXXXXX, 966… and +966… and rejects what is left. Duplicating that
// validation in the schema would mean two places to keep in step.
const requestOtpSchema = z.object({
  phone: z.string().min(7).max(20),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(7).max(20),
  code: z.string().regex(/^[0-9]{6}$/, 'Codes are six digits'),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit(10, 60)
  @Post('register')
  @HttpCode(201)
  register(@Body() body: unknown): Promise<AuthResult> {
    const cmd = parseWith(registerSchema, body);
    return this.auth.register(cmd.email, cmd.password, cmd.fullName);
  }

  @Public()
  @RateLimit(10, 60)
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown): Promise<AuthResult> {
    const cmd = parseWith(loginSchema, body);
    return this.auth.login(cmd.email, cmd.password);
  }

  /**
   * Phone sign-in, step 1. The per-phone limits live in OtpService (cooldown
   * and hourly cap); this per-IP limit is the outer wall, stopping one host
   * from walking a range of numbers.
   *
   * Never returns the code, and answers identically whether or not the number
   * is registered — otherwise it becomes an account-enumeration oracle.
   */
  @Public()
  @RateLimit(15, 60)
  @Post('phone/request-otp')
  @HttpCode(200)
  requestOtp(@Body() body: unknown): Promise<OtpChallenge> {
    const cmd = parseWith(requestOtpSchema, body);
    return this.auth.requestPhoneOtp(cmd.phone);
  }

  /** Phone sign-in, step 2. Attempt capping is enforced per code, not per IP. */
  @Public()
  @RateLimit(20, 60)
  @Post('phone/verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() body: unknown): Promise<AuthResult> {
    const cmd = parseWith(verifyOtpSchema, body);
    return this.auth.verifyPhoneOtp(cmd.phone, cmd.code);
  }

  /** Introspection for clients; requires a valid token even in dev. */
  @Get('me')
  me(@Req() req: AuthenticatedRequest): AuthClaims {
    if (!req.authClaims) throw new UnauthorizedError('Bearer token required');
    return req.authClaims;
  }
}
