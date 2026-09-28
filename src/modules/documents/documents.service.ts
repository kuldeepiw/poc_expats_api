import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentEntity } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { CacheService } from '../cache/cache.service';
import { RequestUploadDto } from './dto/create-document.dto';

export const DOCUMENT_QUEUE = 'document-processing';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    @InjectQueue(DOCUMENT_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Step one of the admin flow.
   *
   * The API creates the row and hands back a presigned URL. The file itself
   * goes from the browser straight to storage — the API never holds it.
   */
  async requestUpload(dto: RequestUploadDto) {
    const storageKey = this.storage.buildKey('knowledgeBase', dto.filename);

    const document = await this.documents.save(
      this.documents.create({
        title: dto.title,
        filename: dto.filename,
        storage_key: storageKey,
        file_type: dto.contentType,
        category_id: dto.categoryId,
        state_scope: dto.stateScope ?? null,
        document_date: dto.documentDate ?? null,
        is_official: dto.isOfficial ?? true,
        status: 'queued',
      }),
    );

    const uploadUrl = await this.storage.presignUpload(
      'knowledgeBase',
      storageKey,
      dto.contentType,
    );

    return { documentId: document.id, uploadUrl, storageKey };
  }

  /**
   * Step two: the browser confirms the upload finished, and only then does the
   * job enter the queue. The admin is free at this point — processing takes
   * up to two minutes and nobody waits for it.
   */
  async confirmUpload(documentId: string) {
    const document = await this.documents.findOneBy({ id: documentId });
    if (!document) throw new NotFoundException('Document not found');

    await this.queue.add(
      'process',
      { documentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50 },
    );

    this.logger.log(`queued ${documentId} for processing`);
    return { documentId, status: document.status };
  }

  async list(filters: { categoryId?: string; status?: string }) {
    const query = this.documents
      .createQueryBuilder('d')
      .where('d.deleted_at IS NULL')
      .orderBy('d.created_at', 'DESC');

    if (filters.categoryId) query.andWhere('d.category_id = :c', { c: filters.categoryId });
    if (filters.status) query.andWhere('d.status = :s', { s: filters.status });

    return query.getMany();
  }

  async findOne(id: string) {
    const document = await this.documents.findOneBy({ id });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  /**
   * Deleting a document is three operations, and the first is the one that
   * matters: if the chunks survive, removed information keeps producing
   * answers. The cascade on document_chunks handles it in the same
   * transaction.
   *
   * message_sources is deliberately not cascaded — the audit trail of past
   * answers survives, with null references.
   */
  async remove(id: string) {
    const document = await this.findOne(id);
    await this.storage.remove('knowledgeBase', document.storage_key).catch((error) => {
      this.logger.warn(`storage delete failed for ${document.storage_key}: ${error.message}`);
    });
    await this.documents.delete(id);

    // Removing the chunks is not enough on its own: a cached answer would
    // keep citing a document that no longer exists, which defeats the point
    // of being able to delete a bad one.
    await this.cache.invalidateCategory(document.category_id);

    return { deleted: id };
  }
}
