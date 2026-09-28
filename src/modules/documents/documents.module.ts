import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DocumentChunk, DocumentEntity } from '../../database/entities';
import { RagModule } from '../rag/rag.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService, DOCUMENT_QUEUE } from './documents.service';
import { DocumentProcessor } from './document.processor';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, DocumentChunk]),
    BullModule.registerQueue({ name: DOCUMENT_QUEUE }),
    RagModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentProcessor, ExtractionService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
