import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { RagModule } from './modules/rag/rag.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { AdminModule } from './modules/admin/admin.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { CacheModule } from './modules/cache/cache.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),

    // Document processing takes up to two minutes. It cannot run inside an
    // HTTP request, so a queue is not optional.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('redis.url')!);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            // Dropping these was harmless against the local container, which
            // has no password and no TLS. Every hosted Redis has both, and the
            // failure is an auth error at job time, not at startup.
            username: decodeURIComponent(url.username) || undefined,
            password: decodeURIComponent(url.password) || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            // BullMQ workers block on reads; ioredis' default retry cap makes
            // it throw instead of waiting.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    DatabaseModule,
    CacheModule,
    StorageModule,
    AuthModule,
    RagModule,
    DocumentsModule,
    ChatModule,
    UploadsModule,
    FeedbackModule,
    AdminModule,
    TaxonomyModule,
    HealthModule,
  ],
})
export class AppModule {}
