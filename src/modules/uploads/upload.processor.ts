import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { UserUpload } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from '../documents/extraction.service';
import { LlmService } from '../rag/services/llm.service';
import { UPLOAD_QUEUE } from './uploads.service';

/**
 * Flow C.
 *
 *   download -> extract -> translate -> store -> delete on expiry
 *
 * This flow never touches pgvector and never calls the embedding API. A
 * user's lab report is private and used once; indexing it would serve no
 * purpose and would create a real privacy risk — another user asking about
 * cholesterol could be shown a stranger's blood results.
 */
@Processor(UPLOAD_QUEUE)
export class UploadProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadProcessor.name);

  constructor(
    @InjectRepository(UserUpload) private readonly uploads: Repository<UserUpload>,
    private readonly storage: StorageService,
    private readonly extraction: ExtractionService,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ uploadId: string }>): Promise<void> {
    const { uploadId } = job.data;
    const upload = await this.uploads.findOneBy({ id: uploadId });
    if (!upload) return;

    try {
      await this.uploads.update(uploadId, { status: 'processing' });

      const file = await this.storage.download('userUploads', upload.storage_key);
      const extracted = await this.extraction.extract(file, upload.file_type);

      // One call reads and translates. Splitting it would double the cost and
      // lose the page layout — the columns, the reference ranges beside each
      // value, the header — which is what makes a lab report readable at all.
      const result = await this.llm.translate({
        text: extracted.text,
        imageBase64: extracted.imageBase64,
        imageMimeType: extracted.imageMimeType,
        kind: upload.document_kind,
      });

      // The user is told to retake the photo rather than shown partial,
      // garbled text presented as a translation.
      if (result.legibility === 'low') {
        await this.uploads.update(uploadId, {
          status: 'failed',
          legibility: 'low',
          failure_reason:
            'We could not read this clearly. Please try another photo in better light.',
        });
        return;
      }

      await this.uploads.update(uploadId, {
        status: 'ready',
        used_vision: Boolean(extracted.usedOcr),
        legibility: result.legibility,
        // Kept so the user can ask follow-up questions about this document.
        // It goes into a prompt as private context for one request — it is
        // never embedded and never written to document_chunks.
        extracted_text: extracted.text,
        translated_text: result.translatedText,
        explanation: result.explanation,
        doctor_summary: result.doctorSummary,
        failure_reason: null,
      });

      this.logger.log(`translated ${upload.original_filename} (${upload.document_kind})`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`upload ${uploadId} failed: ${reason}`);
      await this.uploads.update(uploadId, { status: 'failed', failure_reason: reason });
      throw error;
    }
  }
}
