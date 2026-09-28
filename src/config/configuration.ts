/**
 * Every value that could reasonably change lives here, never inline in code.
 *
 * EMBEDDING_DIMENSIONS is the most dangerous one: it must match the
 * vector(N) column on document_chunks. Changing the embedding provider means
 * altering that column and re-embedding every chunk.
 */
export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),

  database: {
    url: process.env.DATABASE_URL ?? 'postgres://expats:expats@localhost:5435/expats',
    /**
     * Hosted Postgres (Supabase, Neon, RDS) requires TLS; the local container
     * does not offer it. Their certificates are signed by roots Node does not
     * ship, so verification is off — the connection is still encrypted.
     */
    ssl: process.env.DATABASE_SSL === 'true',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6381',
  },

  auth: {
    /** POC only. Production verifies a Firebase token instead of signing our own. */
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
    jwtExpiry: process.env.JWT_EXPIRY ?? '7d',

    /**
     * Open by default so local development is not annoying. Set to 'false' on
     * any deployment the public can reach: a demo that anyone can sign up to
     * is a demo that anyone can run up the LLM bill on.
     */
    registrationEnabled: (process.env.REGISTRATION_ENABLED ?? 'true') !== 'false',

    /**
     * Gate for the admin routes. The POC has no role column — production uses
     * Firebase custom claims — so a shared key stands in. Empty means the gate
     * is OPEN, which is only safe on localhost; AdminGuard refuses to start a
     * deployed instance in that state (see admin.guard.ts).
     */
    adminKey: process.env.ADMIN_API_KEY ?? '',
  },

  /**
   * Comma-separated list of browser origins allowed to call this API.
   * Empty means reflect any origin, which is fine locally and wrong in public.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /** Set by the host (Render sets RENDER=true). Turns on the stricter checks. */
  isDeployed: process.env.DEPLOYED === 'true' || process.env.RENDER === 'true',

  llm: {
    provider: process.env.LLM_PROVIDER ?? 'mock',
    answerModel: process.env.LLM_MODEL_ANSWER ?? '',
    classifyModel: process.env.LLM_MODEL_CLASSIFY ?? '',
    region: process.env.AWS_REGION ?? 'us-east-1',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    // `||` not `??`: an empty env value is a string, and `??` would keep it,
    // producing a confusing 404 from the model endpoint.
    answerModel: process.env.GEMINI_MODEL_ANSWER || 'gemini-3.6-flash',
    /**
     * Tried in order when the primary is overloaded or out of quota.
     * Free-tier limits are per model, so a different model is the only thing
     * that helps — retrying the same one cannot succeed.
     */
    fallbackModels: (process.env.GEMINI_MODEL_FALLBACKS ||
      'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    // Defaults matter: when the env var is missing this is what actually
    // runs. Classification is a recognition task on every single message, so
    // the default must be a small model — not the large one, which is both
    // expensive and the first to be rate-limited.
    classifyModel: process.env.GEMINI_MODEL_CLASSIFY || 'gemini-3.5-flash-lite',
  },

  embedding: {
    provider: process.env.EMBEDDING_PROVIDER ?? 'local',
    model: process.env.EMBEDDING_MODEL ?? 'Xenova/multilingual-e5-small',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '384', 10),
  },

  storage: {
    /** MinIO locally, real S3 in production — same SDK, same code. */
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    /** MinIO needs path-style addressing; real S3 does not. */
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    buckets: {
      knowledgeBase: process.env.S3_BUCKET_KB ?? 'expats-knowledge-base',
      userUploads: process.env.S3_BUCKET_UPLOADS ?? 'expats-user-uploads',
    },
    presignExpirySeconds: parseInt(process.env.S3_PRESIGN_EXPIRY ?? '900', 10),
  },

  chunking: {
    sizeWords: parseInt(process.env.CHUNK_SIZE_WORDS ?? '500', 10),
    overlapWords: parseInt(process.env.CHUNK_OVERLAP_WORDS ?? '50', 10),
  },

  retrieval: {
    topK: parseInt(process.env.RETRIEVAL_TOP_K ?? '5', 10),
    /** Below this many good chunks, retry without the category filter. */
    categoryFallbackThreshold: parseInt(process.env.RETRIEVAL_FALLBACK_MIN ?? '3', 10),
    /**
     * Calibrate this to the embedding model — it is not portable, and a
     * borrowed value is worse than no value.
     *
     * Measured on this corpus:
     *
     *   model                        relevant   unrelated   usable gap
     *   multilingual-e5-small        ~0.85      ~0.75       0.10   -> 0.82
     *   gemini-embedding-001 (384d)  ~0.74      ~0.56       0.18   -> 0.65
     *
     * Set too low, the assistant answers everything and never says "I don't
     * know". Set too high, it refuses questions the library can answer.
     * Re-measure against the client's 30-50 test questions before launch,
     * and again after any embedding-model change.
     */
    minSimilarity: parseFloat(process.env.RETRIEVAL_MIN_SIMILARITY ?? '0.65'),
  },

  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_HOURS ?? '24', 10) * 3600,
  },
});
