import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export type BucketName = 'knowledgeBase' | 'userUploads';

/**
 * The only place in the codebase that touches object storage.
 *
 * Runs against MinIO locally and real S3 in production with no code change —
 * only the endpoint and credentials differ.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      region: config.get<string>('storage.region'),
      endpoint: config.get<string>('storage.endpoint'),
      forcePathStyle: config.get<boolean>('storage.forcePathStyle'),
      credentials: {
        accessKeyId: config.get<string>('storage.accessKeyId')!,
        secretAccessKey: config.get<string>('storage.secretAccessKey')!,
      },
    });
    this.logger.log(
      `storage: ${config.get<string>('storage.endpoint') ?? 'aws s3'}`,
    );
  }

  private bucket(name: BucketName): string {
    return this.config.get<string>(`storage.buckets.${name}`)!;
  }

  /** Keys are namespaced so the two lifecycles never share a prefix. */
  buildKey(bucket: BucketName, filename: string): string {
    const prefix = bucket === 'knowledgeBase' ? 'documents' : 'uploads';
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safe}`;
  }

  /**
   * The browser uploads straight to storage with this URL.
   *
   * A 50MB PDF never passes through the API server, so several admins
   * uploading at once does not consume application memory or bandwidth.
   */
  async presignUpload(
    bucket: BucketName,
    key: string,
    contentType: string,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: this.config.get<number>('storage.presignExpirySeconds')! },
    );
  }

  async presignDownload(bucket: BucketName, key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
      { expiresIn: this.config.get<number>('storage.presignExpirySeconds')! },
    );
  }

  /** Used by the worker, which processes files the API never holds. */
  async download(bucket: BucketName, key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async remove(bucket: BucketName, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
    );
  }
}
