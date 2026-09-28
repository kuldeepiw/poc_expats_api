import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserUpload } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { RequestUserUploadDto } from './dto/upload.dto';

export const UPLOAD_QUEUE = 'user-upload-processing';

/** How long a user's file is kept. Pending the client's retention decision. */
const RETENTION_DAYS = 30;
const DAILY_UPLOAD_LIMIT = 10;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(UserUpload) private readonly uploads: Repository<UserUpload>,
    private readonly storage: StorageService,
    @InjectQueue(UPLOAD_QUEUE) private readonly queue: Queue,
  ) {}

  async requestUpload(userId: string, dto: RequestUserUploadDto) {
    const since = new Date(Date.now() - 86_400_000);
    const todayCount = await this.uploads
      .createQueryBuilder('u')
      .where('u.user_id = :userId AND u.created_at > :since', { userId, since })
      .getCount();

    if (todayCount >= DAILY_UPLOAD_LIMIT) {
      throw new NotFoundException(
        `You have reached today's limit of ${DAILY_UPLOAD_LIMIT} uploads.`,
      );
    }

    // A separate bucket from the knowledge base, with its own lifecycle and
    // its own policy. These files are private to one person and temporary;
    // admin documents are shared and permanent. Keeping them apart is what
    // makes it impossible for a medical report to end up somewhere it should
    // not.
    const storageKey = this.storage.buildKey('userUploads', dto.filename);

    const upload = await this.uploads.save(
      this.uploads.create({
        user_id: userId,
        conversation_id: dto.conversationId ?? null,
        original_filename: dto.filename,
        storage_key: storageKey,
        file_type: dto.contentType,
        document_kind: dto.documentKind,
        status: 'queued',
        expires_at: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
      }),
    );

    const uploadUrl = await this.storage.presignUpload(
      'userUploads',
      storageKey,
      dto.contentType,
    );

    return { uploadId: upload.id, uploadUrl, expiresAt: upload.expires_at };
  }

  async confirmUpload(userId: string, uploadId: string) {
    const upload = await this.uploads.findOneBy({ id: uploadId, user_id: userId });
    if (!upload) throw new NotFoundException('Upload not found');

    await this.queue.add(
      'translate',
      { uploadId },
      { attempts: 2, backoff: { type: 'fixed', delay: 4000 }, removeOnComplete: 50 },
    );
    return { uploadId, status: 'queued' };
  }

  async findOne(userId: string, id: string) {
    const upload = await this.uploads.findOneBy({ id, user_id: userId });
    if (!upload) throw new NotFoundException('Upload not found');

    return {
      id: upload.id,
      filename: upload.original_filename,
      documentKind: upload.document_kind,
      status: upload.status,
      failureReason: upload.failure_reason,
      legibility: upload.legibility,
      translatedText: upload.translated_text,
      explanation: upload.explanation,
      doctorSummary: upload.doctor_summary,
      expiresAt: upload.expires_at,
      conversationId: upload.conversation_id,
    };
  }

  async list(userId: string) {
    return this.uploads.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 20,
      // Deliberately narrow: the list never returns extracted_text,
      // translated_text or doctor_summary. Medical content is fetched only
      // when the user opens that one result.
      select: {
        id: true,
        original_filename: true,
        document_kind: true,
        status: true,
        legibility: true,
        expires_at: true,
        created_at: true,
      },
    });
  }

  /** The user can delete their own file at any time, ahead of expiry. */
  async remove(userId: string, id: string) {
    const upload = await this.uploads.findOneBy({ id, user_id: userId });
    if (!upload) throw new NotFoundException('Upload not found');

    await this.storage.remove('userUploads', upload.storage_key).catch((error) => {
      this.logger.warn(`storage delete failed: ${error.message}`);
    });
    await this.uploads.delete(id);
    return { deleted: id };
  }
}
