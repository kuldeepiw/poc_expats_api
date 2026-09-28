import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { UserUpload } from '../../database/entities';
import { RagModule } from '../rag/rag.module';
import { DocumentsModule } from '../documents/documents.module';
import { ExtractionService } from '../documents/extraction.service';
import { UploadsController } from './uploads.controller';
import { UploadsService, UPLOAD_QUEUE } from './uploads.service';
import { UploadProcessor } from './upload.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserUpload]),
    BullModule.registerQueue({ name: UPLOAD_QUEUE }),
    RagModule,
    DocumentsModule,
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadProcessor, ExtractionService],
})
export class UploadsModule {}
