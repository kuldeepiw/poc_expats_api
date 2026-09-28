import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { DocumentChunk, DocumentEntity } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { ChunkingService } from '../rag/services/chunking.service';
import { EmbeddingService } from '../rag/services/embedding.service';
import { ExtractionService } from './extraction.service';
import { CacheService } from '../cache/cache.service';
import { DOCUMENT_QUEUE } from './documents.service';

/**
 * Flow A, end to end.
 *
 *   download -> extract -> chunk -> embed -> store -> ready
 *
 * No language model is involved anywhere in this flow. Nothing is trained.
 * The document simply becomes searchable — which is why a bad one can be
 * deleted and stop affecting answers within minutes.
 */
@Processor(DOCUMENT_QUEUE)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(DocumentChunk) private readonly chunks: Repository<DocumentChunk>,
    private readonly storage: StorageService,
    private readonly extraction: ExtractionService,
    private readonly chunking: ChunkingService,
    private readonly embeddings: EmbeddingService,
    private readonly cache: CacheService,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const { documentId } = job.data;
    const document = await this.documents.findOneBy({ id: documentId });
    if (!document) {
      this.logger.warn(`document ${documentId} vanished before processing`);
      return;
    }

    try {
      await this.documents.update(documentId, { status: 'processing' });

      const file = await this.storage.download('knowledgeBase', document.storage_key);
      const extracted = await this.extraction.extract(file, document.file_type);

      const pieces = this.chunking.split(extracted.text);
      if (pieces.length === 0) throw new Error('Extraction produced no chunks');

      const vectors = await this.embeddings.embedChunks(pieces.map((p) => p.content));

      // Replace rather than append, so reprocessing a document does not
      // duplicate its chunks.
      await this.chunks.delete({ document_id: documentId });
      await this.chunks.save(
        pieces.map((piece, i) =>
          this.chunks.create({
            document_id: documentId,
            chunk_index: piece.index,
            content: piece.content,
            embedding: this.embeddings.toSqlVector(vectors[i]),
            // Recorded per chunk so a future model change is detectable
            // rather than silently returning nonsense.
            embedding_model: this.embeddings.model,
            token_count: piece.wordCount,
          }),
        ),
      );

      await this.documents.update(documentId, {
        status: 'ready',
        chunk_count: pieces.length,
        used_ocr: extracted.usedOcr,
        failure_reason: null,
      });

      // The document is live — but users would keep receiving the cached
      // "we don't have information on this" until these entries expire.
      // Clearing them here is what makes the improvement loop visible: upload
      // a document, ask again, get a real answer.
      await this.cache.invalidateCategory(document.category_id);

      this.logger.log(`${document.title}: ${pieces.length} chunks ready`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`processing failed for ${documentId}: ${reason}`);
      await this.documents.update(documentId, {
        status: 'failed',
        failure_reason: reason,
      });
      throw error;
    }
  }
}
