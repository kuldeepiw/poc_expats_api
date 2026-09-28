import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Read-only views for inspecting the system without writing vector SQL by
 * hand.
 *
 * The embedding column is 384 numbers wide, so selecting it in a table
 * browser is unreadable. These views expose what actually needs checking —
 * dimensions, model, counts, health — and leave the raw vector out.
 */
export class InspectionViews1758900000000 implements MigrationInterface {
  name = 'InspectionViews1758900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Is the library healthy? One row per document.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_library AS
      SELECT d.title,
             d.status,
             d.category_id                                   AS category,
             COALESCE(d.state_scope, 'all of Mexico')         AS applies_to,
             d.is_official,
             d.chunk_count,
             count(c.id)                                      AS chunks_actually_stored,
             count(c.embedding)                               AS chunks_with_vectors,
             d.failure_reason,
             d.created_at
        FROM documents d
        LEFT JOIN document_chunks c ON c.document_id = d.id
       WHERE d.deleted_at IS NULL
       GROUP BY d.id
       ORDER BY d.created_at DESC
    `);

    // Chunks, without the unreadable vector. If dimensions or model ever
    // differ between rows, retrieval is broken and this is where it shows.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_chunks AS
      SELECT d.title                        AS document,
             c.chunk_index,
             c.token_count                  AS words,
             c.embedding_model,
             vector_dims(c.embedding)       AS dimensions,
             left(c.content, 120)           AS content_preview
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
       ORDER BY d.title, c.chunk_index
    `);

    // The admin worklist: every row is a document to go and find, ranked by
    // how many people asked rather than by when.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_worklist AS
      SELECT occurrence_count AS asks,
             question_text    AS question,
             category_id      AS category,
             user_state       AS asked_from,
             type,
             last_seen_at
        FROM answer_issues
       WHERE resolved_at IS NULL
       ORDER BY occurrence_count DESC, last_seen_at DESC
    `);

    // Every answer with its cost, confidence and whether grounding stripped
    // anything. Without this, "why was this answer wrong" takes hours.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_answers AS
      SELECT m.created_at,
             u.email                                            AS asked_by,
             q.content                                          AS question,
             m.confidence,
             (m.metadata->>'cached')::boolean                    AS from_cache,
             (m.metadata->>'chunksRetrieved')::int               AS chunks_used,
             m.metadata->>'model'                                AS model,
             m.metadata->'groundingStripped'                     AS grounding_stripped,
             left(m.content, 100)                                AS answer_preview
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        JOIN users u ON u.id = conv.user_id
        LEFT JOIN LATERAL (
              SELECT content FROM messages
               WHERE conversation_id = m.conversation_id
                 AND role = 'user' AND created_at <= m.created_at
               ORDER BY created_at DESC LIMIT 1
        ) q ON true
       WHERE m.role = 'assistant'
       ORDER BY m.created_at DESC
    `);

    // Which document produced which answer, and how close the match was.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_answer_sources AS
      SELECT m.created_at,
             left(m.content, 70)                AS answer_preview,
             COALESCE(d.title, '(document deleted)') AS source_document,
             round(ms.similarity_score::numeric, 4)  AS similarity,
             ms.rank
        FROM message_sources ms
        JOIN messages m ON m.id = ms.message_id
        LEFT JOIN documents d ON d.id = ms.document_id
       ORDER BY m.created_at DESC, ms.rank
    `);

    // Is pgvector itself set up correctly? The operator class on the index
    // must match the operator the query uses, or the index is silently
    // ignored and every search becomes a full scan.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_vector_health AS
      SELECT (SELECT extversion FROM pg_extension WHERE extname = 'vector')  AS pgvector_version,
             (SELECT count(*) FROM document_chunks)                          AS total_chunks,
             (SELECT count(DISTINCT embedding_model) FROM document_chunks)   AS distinct_models,
             (SELECT count(DISTINCT vector_dims(embedding))
                FROM document_chunks WHERE embedding IS NOT NULL)            AS distinct_dimensions,
             (SELECT indexdef FROM pg_indexes
               WHERE indexname = 'idx_chunks_embedding_hnsw')                AS vector_index
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const view of [
      'v_vector_health', 'v_answer_sources', 'v_answers',
      'v_worklist', 'v_chunks', 'v_library',
    ]) {
      await queryRunner.query(`DROP VIEW IF EXISTS ${view}`);
    }
  }
}
