import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Stands in for the role check the real product gets from Firebase custom
 * claims. The POC has no role column, and adding one would mean a migration
 * on a database this project deliberately changes by hand.
 *
 * The routes behind this guard can delete the knowledge base and queue
 * embedding work, so "unauthenticated" is not an option once the API is
 * reachable from the internet.
 *
 * The startup check that refuses to boot a deployed instance without a key
 * lives in main.ts — a guard's lifecycle hooks do not reliably run.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('auth.adminKey') ?? '';

    // Local development with no key configured: let everything through, which
    // is what the guard did before it existed.
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const supplied =
      (req.headers['x-admin-key'] as string | undefined) ??
      (typeof req.query?.adminKey === 'string' ? req.query.adminKey : undefined);

    if (supplied !== expected) {
      throw new ForbiddenException('Admin key missing or incorrect');
    }
    return true;
  }
}
