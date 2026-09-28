import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_PROVIDER } from '../providers/embedding/embedding.provider';
import type { EmbeddingProvider } from '../providers/embedding/embedding.provider';

/**
 * The only place in the codebase that turns text into a vector.
 *
 * Nothing else may call an embedding provider directly. That rule is what
 * guarantees chunks and questions are always embedded the same way.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
  ) {
    this.logger.log(
      `embeddings: ${provider.name} (${provider.model}), ${provider.dimensions} dimensions`,
    );
  }

  get model(): string {
    return this.provider.model;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }

  /** Used when indexing an admin document. */
  embedChunks(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }

  /** Used when a user asks a question. Same provider, necessarily. */
  embedQuestion(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  /** pgvector literal format. */
  toSqlVector(values: number[]): string {
    return `[${values.join(',')}]`;
  }
}
