import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './services/embedding.service';

/**
 * Checks, at startup, that the configured embedding model is the one the
 * stored chunks were embedded with.
 *
 * This is the single most dangerous failure in the system, and the quietest.
 * Different models place vectors on different scales, so a mismatch means
 * every search returns nothing useful — while the application starts cleanly,
 * logs nothing, and answers every question with "I don't have confirmed
 * information on this". It looks exactly like an empty library.
 *
 * It has already happened once here: chunks embedded with
 * gemini-embedding-001, queries embedded with multilingual-e5-small, and the
 * only symptom was that the product refused everything.
 *
 * The check costs one query at boot and turns an invisible failure into an
 * obvious one.
 */
@Injectable()
export class EmbeddingGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmbeddingGuard.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Thresholds measured on this corpus. They are a property of the embedding
   * model, not a general constant — see configuration.ts.
   */
  private static readonly EXPECTED_THRESHOLD: Record<string, number> = {
    'gemini-embedding-001': 0.65,
    'Xenova/multilingual-e5-small': 0.82,
  };

  private checkThreshold(): void {
    const model = this.embeddings.model;
    const expected = EmbeddingGuard.EXPECTED_THRESHOLD[model];
    const actual = this.config.get<number>('retrieval.minSimilarity')!;

    if (expected === undefined) {
      this.logger.warn(
        `no measured similarity threshold for "${model}" — ${actual} is a guess. ` +
          'Measure a relevant and an unrelated question before trusting it.',
      );
      return;
    }

    if (Math.abs(expected - actual) > 0.02) {
      this.logger.error(
        `RETRIEVAL_MIN_SIMILARITY is ${actual}, but ${expected} was measured for ` +
          `"${model}". Too high and the assistant refuses questions the library ` +
          'can answer; too low and it answers everything. This has already been ' +
          'mistaken for a broken product twice.',
      );
      return;
    }

    this.logger.log(`similarity threshold ${actual} matches "${model}"`);
  }

  async onApplicationBootstrap(): Promise<void> {
    this.checkThreshold();

    const rows: { embedding_model: string | null; count: string }[] =
      await this.dataSource.query(`
        SELECT embedding_model, count(*)::text AS count
          FROM document_chunks
         GROUP BY embedding_model
      `);

    if (rows.length === 0) {
      this.logger.log('no chunks stored yet — embedding model check skipped');
      return;
    }

    const configured = this.embeddings.model;
    const stored = rows.map((r) => r.embedding_model);
    const mismatched = rows.filter((r) => r.embedding_model !== configured);

    if (mismatched.length === 0) {
      this.logger.log(
        `embedding model matches stored chunks (${configured}, ${rows[0].count} chunks)`,
      );
      return;
    }

    const detail = mismatched
      .map((r) => `${r.count} chunks embedded with "${r.embedding_model}"`)
      .join(', ');

    this.logger.error('='.repeat(78));
    this.logger.error('EMBEDDING MODEL MISMATCH — retrieval will return nothing useful');
    this.logger.error(`  configured now : ${configured}`);
    this.logger.error(`  stored chunks  : ${detail}`);
    this.logger.error('');
    this.logger.error('  Every question will be answered "I do not have confirmed');
    this.logger.error('  information on this", because the query vector and the chunk');
    this.logger.error('  vectors are on different scales. Nothing else will look wrong.');
    this.logger.error('');
    this.logger.error('  Fix: either set EMBEDDING_MODEL back to what the chunks used,');
    this.logger.error(`  or re-embed every document with "${configured}".`);
    this.logger.error('='.repeat(78));

    // Deliberately not fatal. An operator may be mid-migration, and refusing
    // to boot would block the very admin screen they need to re-process from.
    if (stored.length > 1) {
      this.logger.error(
        `Chunks are ALSO inconsistent with each other (${stored.join(', ')}) — re-embed everything.`,
      );
    }
  }
}
