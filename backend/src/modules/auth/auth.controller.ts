import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Public, RateLimit } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { UnauthorizedError } from '../../common/errors/domain-errors';
import { AuthResult, AuthService } from './auth.service';
import type { AuthClaims } from './token.service';

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

  /** Introspection for clients; requires a valid token even in dev. */
  @Get('me')
  me(@Req() req: AuthenticatedRequest): AuthClaims {
    if (!req.authClaims) throw new UnauthorizedError('Bearer token required');
    return req.authClaims;
  }
}
