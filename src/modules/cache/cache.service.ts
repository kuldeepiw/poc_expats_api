import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

/**
 * The answer cache, and the single largest cost lever in the product.
 *
 * A hit returns in milliseconds and costs nothing. Everything else here
 * exists to make hits more likely without ever serving a stale or wrong
 * answer — which is the failure that matters, because a confidently wrong
 * cached fee is exactly what this product exists to prevent.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly ttl: number;

  /**
   * Bump when the prompt rules change in a way that should invalidate every
   * cached answer. Model names are picked up automatically below.
   */
  private static readonly PROMPT_VERSION = 'v2';

  /**
   * A fingerprint of everything that decides what an answer looks like.
   *
   * It is part of every key, so changing the model, the prompt version or the
   * retrieval depth leaves the old entries orphaned and unreachable rather
   * than silently served. Without this, editing a prompt means 24 hours of
   * answers produced by the previous one — which is exactly how "I fixed that,
   * why is it still wrong?" happens.
   */
  private readonly fingerprint: string;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(config.get<string>('redis.url')!, { maxRetriesPerRequest: 2 });
    this.ttl = config.get<number>('cache.ttlSeconds')!;

    this.fingerprint = createHash('sha256')
      .update(
        [
          CacheService.PROMPT_VERSION,
          config.get<string>('llm.provider'),
          config.get<string>('gemini.answerModel') ?? '',
          config.get<string>('embedding.model'),
          String(config.get<number>('embedding.dimensions')),
          String(config.get<number>('retrieval.topK')),
          String(config.get<number>('retrieval.minSimilarity')),
        ].join('|'),
      )
      .digest('hex')
      .slice(0, 8);

    this.logger.log(`answer cache fingerprint ${this.fingerprint}, ttl ${this.ttl}s`);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Normalising before hashing is what makes caching work at all. Without it
   * "How do I get an RFC?", "how do i get an rfc" and "Hi, can you tell me
   * how to get an RFC?" are three separate entries and the hit rate collapses.
   */
  normalise(question: string): string {
    return question
      .toLowerCase()
      .replace(/[¿?¡!.,;:'"()]/g, ' ')
      .replace(/^\s*(hi|hello|hey|hola)\s+/, '')
      .replace(/^\s*(please|could you|can you|would you)\s+(please\s+)?/, '')
      .replace(/^\s*(tell me|explain|help me|i want to know|i need to know)\s+/, '')
      .replace(
        /^\s*(how do i|how can i|how would i|what is|what are|what do i|where do i|where can i|when do i|do i need to|do i have to|can i|could i|am i able to|is it possible to|i want to|i need to)\s+/,
        '',
      )
      .replace(/\s+(please|thanks|thank you)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Only answers that are the same for everyone may be cached.
   *
   * "Personalised by state" means a state-scoped document was actually used —
   * not merely that the user has a state. Every user has one, so that reading
   * would disable the cache entirely.
   */
  isCacheable(input: {
    usedStateScopedSource: boolean;
    usedHistory: boolean;
    usedUserDocument: boolean;
  }): boolean {
    return !input.usedStateScopedSource && !input.usedHistory && !input.usedUserDocument;
  }

  private key(normalised: string, categoryKey: string | null): string {
    const hash = createHash('sha256')
      .update(`${categoryKey ?? '*'}::${normalised}`)
      .digest('hex')
      .slice(0, 32);
    return `answer:${this.fingerprint}:${hash}`;
  }

  /** Keys belonging to one category, so invalidation can be precise. */
  private indexKey(categoryKey: string | null): string {
    return `answer-index:${this.fingerprint}:${categoryKey ?? 'uncategorised'}`;
  }

  async get<T>(normalised: string, categoryKey: string | null): Promise<T | null> {
    const raw = await this.redis.get(this.key(normalised, categoryKey));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set(normalised: string, categoryKey: string | null, value: unknown): Promise<void> {
    const key = this.key(normalised, categoryKey);
    const index = this.indexKey(categoryKey);

    await this.redis
      .multi()
      .set(key, JSON.stringify(value), 'EX', this.ttl)
      // The index tracks which keys belong to this category so a document
      // change can clear exactly those, instead of everyone's cache.
      .sadd(index, key)
      .expire(index, this.ttl * 2)
      .exec();
  }

  /**
   * Called when a document becomes ready, or is deleted.
   *
   * Both directions matter and both are easy to miss:
   *
   * - After an upload, a cached "we don't have information on this" keeps
   *   being served after the very document that answers it has arrived. The
   *   admin uploads, nothing appears to change, and the improvement loop looks
   *   broken.
   * - After a delete, a cached answer keeps citing a document that no longer
   *   exists — which defeats the point of being able to remove a bad one.
   */
  async invalidateCategory(categoryKey: string | null): Promise<number> {
    const index = this.indexKey(categoryKey);
    const keys = await this.redis.smembers(index);

    // Uncategorised answers may have drawn on any document, so they go too.
    const uncategorised = await this.redis.smembers(this.indexKey(null));
    const all = [...new Set([...keys, ...uncategorised])];

    if (all.length === 0) {
      this.logger.log(`cache: nothing to clear for "${categoryKey ?? 'uncategorised'}"`);
      return 0;
    }

    const removed = await this.redis.del(...all);
    await this.redis.del(index, this.indexKey(null));
    this.logger.log(`cache: cleared ${removed} entries for "${categoryKey ?? 'uncategorised'}"`);
    return removed;
  }

  /** Escape hatch for operations, and for tests. */
  async invalidateAll(): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'answer*', 'COUNT', 200);
      cursor = next;
      if (keys.length) removed += await this.redis.del(...keys);
    } while (cursor !== '0');

    this.logger.warn(`cache: cleared everything (${removed} entries)`);
    return removed;
  }

  /** Per-user daily counter, used for rate limiting. */
  async incrementDaily(userId: string): Promise<number> {
    const key = `rate:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86400);
    return count;
  }
}
