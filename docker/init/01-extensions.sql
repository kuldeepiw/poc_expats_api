-- Runs once, on first database creation.
-- pgvector powers similarity search over document_chunks.embedding.
CREATE EXTENSION IF NOT EXISTS vector;
