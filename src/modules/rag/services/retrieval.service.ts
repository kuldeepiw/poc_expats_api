import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmbeddingService } from './embedding.service';
import { RetrievedChunk } from '../providers/llm/llm.provider';

export interface RetrievalQuery {
  question: string;
  categoryKey?: string | null;
  userState?: string | null;
}

/**
 * The only place that queries the vector store.
 *
 * The database does the searching — the model never sees it. Chunks are
 * retrieved here and pasted into the prompt as plain text.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  async search(query: RetrievalQuery): Promise<RetrievedChunk[]> {
    const vector = this.embeddings.toSqlVector(
      await this.embeddings.embedQuestion(query.question),
    );

    const topK = this.config.get<number>('retrieval.topK')!;
    const threshold = this.config.get<number>('retrieval.categoryFallbackThreshold')!;

    // Category filter first.
    let rows = await this.query(vector, topK, query.categoryKey ?? null, query.userState ?? null);

    // Category is organisation, not correctness. "Can I open a bank account
    // without an RFC?" classifies as daily living while the answer sits in a
    // tax document — a strict filter would return nothing and the user would
    // be told we do not know, when the answer was in the library all along.
    if (query.categoryKey && rows.length < threshold) {
      this.logger.debug(
        `only ${rows.length} chunks in category "${query.categoryKey}" — widening`,
      );
      rows = await this.query(vector, topK, null, query.userState ?? null);
    }

    return rows;
  }

  /**
   * State stays a strict filter throughout: a fee from the wrong state is a
   * wrong answer, not a less relevant one.
   */
  private async query(
    vector: string,
    topK: number,
    categoryKey: string | null,
    userState: string | null,
  ): Promise<RetrievedChunk[]> {
    const rows = await this.dataSource.query(
      `
      SELECT c.id            AS "chunkId",
             d.id            AS "documentId",
             d.title         AS "documentTitle",
             c.content       AS "content",
             d.state_scope   AS "stateScope",
             1 - (c.embedding <=> $1::vector) AS "similarity"
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
       WHERE d.status = 'ready'
         AND d.deleted_at IS NULL
         AND ($2::text IS NULL OR d.category_id = $2)
         AND (d.state_scope IS NULL OR $3::text IS NULL OR d.state_scope = $3)
       ORDER BY c.embedding <=> $1::vector
       LIMIT $4
      `,
      [vector, categoryKey, userState, topK],
    );

    const min = this.config.get<number>('retrieval.minSimilarity')!;
    return rows.filter((r: RetrievedChunk) => r.similarity >= min);
  }
}
