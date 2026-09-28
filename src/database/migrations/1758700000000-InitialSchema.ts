import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The eleven tables, plus the vector column and the indexes that matter.
 *
 * Written as raw SQL rather than generated, because two things here cannot be
 * expressed through entity decorators: the vector(N) column type and the HNSW
 * index. Both are load-bearing.
 */
export class InitialSchema1758700000000 implements MigrationInterface {
  name = 'InitialSchema1758700000000';

  /**
   * Must match EMBEDDING_DIMENSIONS in the environment. The column type is
   * fixed at creation, so changing the embedding provider later means
   * altering this column and re-embedding every chunk.
   */
  private readonly dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '384', 10);

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // --- users -------------------------------------------------------------
    // Firebase owns credentials. No password is ever stored here.
    await queryRunner.query(`
      CREATE TABLE users (
        id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        firebase_uid      varchar UNIQUE,
        email             varchar NOT NULL UNIQUE,
        auth_provider     varchar NOT NULL DEFAULT 'password',
        full_name         varchar,
        country_of_origin varchar,
        state             varchar,
        city              varchar,
        is_verified       boolean NOT NULL DEFAULT false,
        is_blocked        boolean NOT NULL DEFAULT false,
        blocked_reason    varchar,
        last_active_at    timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        deleted_at        timestamptz
      )
    `);

    // --- taxonomy ----------------------------------------------------------
    // Categories, processes and states share one table: a new one is a row,
    // not a schema change.
    //
    // 'state' belongs in this list. Leaving it out made every fresh database
    // fail on the seed migration, while databases created before states
    // existed kept working — so it only ever broke a first deployment.
    await queryRunner.query(`
      CREATE TABLE taxonomy (
        id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        type          varchar NOT NULL CHECK (type IN ('category','process','state')),
        key           varchar NOT NULL,
        name          varchar NOT NULL,
        description   varchar,
        search_terms  text[] NOT NULL DEFAULT '{}',
        config        jsonb NOT NULL DEFAULT '{}',
        display_order integer NOT NULL DEFAULT 0,
        is_active     boolean NOT NULL DEFAULT true,
        UNIQUE (type, key)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE admin_users (
        id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role        varchar NOT NULL DEFAULT 'editor',
        permissions jsonb NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  varchar
      )
    `);

    // --- documents ---------------------------------------------------------
    // Admin sources: permanent, shared, searchable.
    await queryRunner.query(`
      CREATE TABLE documents (
        id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        title          varchar NOT NULL,
        filename       varchar NOT NULL,
        storage_key    varchar NOT NULL,
        file_type      varchar NOT NULL,
        file_size      bigint,
        category_id    varchar,
        state_scope    varchar,
        document_date  date,
        is_official    boolean NOT NULL DEFAULT true,
        status         varchar NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','processing','ready','failed')),
        failure_reason text,
        used_ocr       boolean NOT NULL DEFAULT false,
        chunk_count    integer NOT NULL DEFAULT 0,
        uploaded_by    varchar,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        deleted_at     timestamptz
      )
    `);

    // --- document_chunks ---------------------------------------------------
    // ON DELETE CASCADE is not optional. Chunks surviving their document means
    // deleted information keeps producing answers.
    await queryRunner.query(`
      CREATE TABLE document_chunks (
        id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index     integer NOT NULL,
        content         text NOT NULL,
        embedding       vector(${this.dimensions}),
        embedding_model varchar,
        token_count     integer,
        page_number     integer,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE conversations (
        id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title             varchar,
        process_key       varchar,
        collected_context jsonb NOT NULL DEFAULT '{}',
        message_count     integer NOT NULL DEFAULT 0,
        is_archived       boolean NOT NULL DEFAULT false,
        last_message_at   timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        deleted_at        timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE messages (
        id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role               varchar NOT NULL CHECK (role IN ('user','assistant')),
        content            text NOT NULL,
        content_structured jsonb,
        confidence         varchar CHECK (confidence IN ('high','medium','none')),
        metadata           jsonb NOT NULL DEFAULT '{}',
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- message_sources ---------------------------------------------------
    // Deliberately NOT cascaded from document_chunks: the audit trail of past
    // answers has to survive document deletion, or "which document caused this
    // complaint?" becomes unanswerable.
    await queryRunner.query(`
      CREATE TABLE message_sources (
        id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        message_id       uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        chunk_id         uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
        document_id      uuid REFERENCES documents(id) ON DELETE SET NULL,
        similarity_score double precision,
        rank             integer
      )
    `);

    // --- user_uploads ------------------------------------------------------
    // The opposite of documents in every respect: temporary, private, and
    // never embedded or written to document_chunks.
    await queryRunner.query(`
      CREATE TABLE user_uploads (
        id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
        original_filename varchar NOT NULL,
        storage_key       varchar NOT NULL,
        file_type         varchar NOT NULL,
        document_kind     varchar NOT NULL DEFAULT 'general'
                          CHECK (document_kind IN ('medical','general')),
        used_vision       boolean NOT NULL DEFAULT false,
        legibility        varchar CHECK (legibility IN ('high','medium','low')),
        status            varchar NOT NULL DEFAULT 'queued',
        failure_reason    text,
        extracted_text    text,
        translated_text   text,
        explanation       text,
        doctor_summary    text,
        expires_at        timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        deleted_at        timestamptz
      )
    `);

    // --- answer_issues -----------------------------------------------------
    // Thumbs-down feedback and unanswered questions are the same thing
    // operationally, deduplicated so one loud user cannot outrank fifty quiet
    // ones.
    await queryRunner.query(`
      CREATE TABLE answer_issues (
        id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        type                    varchar NOT NULL CHECK (type IN ('feedback','unanswered')),
        message_id              uuid REFERENCES messages(id) ON DELETE SET NULL,
        user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
        question_text           text NOT NULL,
        normalized_text         text NOT NULL,
        is_helpful              boolean,
        comment                 text,
        category_id             varchar,
        user_state              varchar,
        occurrence_count        integer NOT NULL DEFAULT 1,
        first_seen_at           timestamptz NOT NULL DEFAULT now(),
        last_seen_at            timestamptz NOT NULL DEFAULT now(),
        resolved_at             timestamptz,
        resolved_by_document_id uuid REFERENCES documents(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE daily_metrics (
        id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        date             date NOT NULL,
        user_id          uuid REFERENCES users(id) ON DELETE CASCADE,
        questions_asked  integer NOT NULL DEFAULT 0,
        files_uploaded   integer NOT NULL DEFAULT 0,
        tokens_used      bigint NOT NULL DEFAULT 0,
        cost_usd         numeric(10,4) NOT NULL DEFAULT 0,
        cache_hits       integer NOT NULL DEFAULT 0,
        unanswered_count integer NOT NULL DEFAULT 0
      )
    `);

    // --- indexes -----------------------------------------------------------
    // Similarity search degrades badly without HNSW. vector_cosine_ops must
    // match the <=> operator used in RetrievalService.
    await queryRunner.query(`
      CREATE INDEX idx_chunks_embedding_hnsw
        ON document_chunks USING hnsw (embedding vector_cosine_ops)
    `);
    await queryRunner.query(`CREATE INDEX idx_chunks_document ON document_chunks (document_id)`);
    await queryRunner.query(`CREATE INDEX idx_documents_filters ON documents (category_id, state_scope, status)`);
    await queryRunner.query(`CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_conversations_user ON conversations (user_id, last_message_at)`);
    await queryRunner.query(`CREATE INDEX idx_uploads_expiry ON user_uploads (expires_at)`);
    await queryRunner.query(`CREATE INDEX idx_issues_normalized ON answer_issues (normalized_text)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_metrics_user_date ON daily_metrics (user_id, date)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'daily_metrics', 'answer_issues', 'user_uploads', 'message_sources',
      'messages', 'conversations', 'document_chunks', 'documents',
      'admin_users', 'taxonomy', 'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  }
}
