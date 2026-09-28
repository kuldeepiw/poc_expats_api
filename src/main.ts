import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Refuses to start a publicly reachable instance that is missing the controls
 * that make it safe to reach. Checking at boot rather than per-request means a
 * misconfigured deploy fails visibly instead of serving an open delete
 * endpoint that looks healthy.
 */
function assertDeploymentIsSafe(config: ConfigService, logger: Logger) {
  if (!config.get<boolean>('isDeployed')) return;

  const problems: string[] = [];
  if (!config.get<string>('auth.adminKey')) {
    problems.push('ADMIN_API_KEY is empty — /api/admin and /api/documents would be open');
  }
  if (config.get<string>('auth.jwtSecret') === 'dev-only-change-me') {
    problems.push('JWT_SECRET is still the development default — anyone can forge a token');
  }
  if (!config.get<string[]>('corsOrigins')?.length) {
    problems.push('CORS_ORIGINS is empty — any website could call this API as your user');
  }
  if (config.get<boolean>('auth.registrationEnabled')) {
    logger.warn('REGISTRATION_ENABLED is true on a deployed instance — anyone can sign up');
  }

  if (problems.length) {
    throw new Error(`Refusing to start:\n  - ${problems.join('\n  - ')}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  assertDeploymentIsSafe(config, logger);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // An explicit allow-list once deployed; reflect-any locally, where the UI
  // runs on a different port and the origin changes with every tunnel.
  const origins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });
  app.setGlobalPrefix('api');

  const port = config.get<number>('port')!;
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port} (/api)`);
  logger.log(
    `registration ${config.get('auth.registrationEnabled') ? 'OPEN' : 'CLOSED'} · ` +
      `admin gate ${config.get('auth.adminKey') ? 'ON' : 'OFF'} · ` +
      `cors ${origins.length ? origins.join(', ') : 'any'}`,
  );
}

void bootstrap();
