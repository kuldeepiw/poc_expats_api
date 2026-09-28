import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The dashboard.
   *
   * Totals are reporting numbers — they tell the admin how things are going.
   * The unanswered list is the only number that tells them what to *do*, so
   * it is returned alongside rather than buried on another screen.
   */
  async dashboard() {
    const [counts] = await this.dataSource.query(`
      SELECT
        (SELECT count(*) FROM users WHERE deleted_at IS NULL)                        AS users,
        (SELECT count(*) FROM messages WHERE role = 'user')                          AS questions,
        (SELECT count(*) FROM documents WHERE status = 'ready' AND deleted_at IS NULL) AS documents_live,
        (SELECT count(*) FROM documents WHERE status = 'processing' OR status = 'queued') AS documents_processing,
        (SELECT count(*) FROM documents WHERE status = 'failed')                     AS documents_failed,
        (SELECT count(*) FROM document_chunks)                                       AS chunks,
        (SELECT count(*) FROM answer_issues WHERE type = 'unanswered' AND resolved_at IS NULL) AS unanswered,
        (SELECT count(*) FROM answer_issues WHERE type = 'feedback' AND resolved_at IS NULL)   AS flagged
    `);

    // Cache hit rate and spend are causally linked, so they belong together.
    const [cache] = await this.dataSource.query(`
      SELECT
        count(*) FILTER (WHERE (metadata->>'cached')::boolean IS TRUE) AS hits,
        count(*)                                                       AS total
        FROM messages WHERE role = 'assistant'
    `);

    const total = Number(cache.total) || 0;
    const hits = Number(cache.hits) || 0;

    return {
      users: Number(counts.users),
      questions: Number(counts.questions),
      documentsLive: Number(counts.documents_live),
      documentsProcessing: Number(counts.documents_processing),
      documentsFailed: Number(counts.documents_failed),
      chunks: Number(counts.chunks),
      unanswered: Number(counts.unanswered),
      flagged: Number(counts.flagged),
      cacheHitRate: total ? Math.round((hits / total) * 100) : 0,
      cacheHits: hits,
      answersServed: total,
    };
  }

  /**
   * The worklist. Each row is a document to go and find.
   *
   * Ranked by how many people asked, not by when — recency would surface one
   * loud user above fifty quiet ones.
   */
  async unansweredQuestions() {
    return this.dataSource.query(`
      SELECT id,
             question_text    AS question,
             occurrence_count AS asks,
             category_id      AS category,
             user_state       AS "userState",
             last_seen_at     AS "lastSeen"
        FROM answer_issues
       WHERE type = 'unanswered' AND resolved_at IS NULL
       ORDER BY occurrence_count DESC, last_seen_at DESC
       LIMIT 20
    `);
  }

  /** Where questions land, so gaps in the library are visible by topic. */
  async questionsByCategory() {
    return this.dataSource.query(`
      SELECT COALESCE(category_id, 'uncategorised') AS category,
             sum(occurrence_count)::int            AS asks
        FROM answer_issues
       GROUP BY 1 ORDER BY 2 DESC
    `);
  }
}
