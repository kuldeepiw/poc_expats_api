/**
 * Every Claude call in the product goes through this interface.
 *
 * The point is not that we expect to switch providers. It is that when
 * pricing changes, or a newer model ships, or the client asks about
 * self-hosting, that becomes a config change rather than a rewrite spread
 * across the codebase.
 */
export interface LlmProvider {
  readonly name: string;

  /** Small, fast model. Runs on every message, including cache hits. */
  classify(input: ClassifyInput): Promise<ClassifyResult>;

  /** Large model. Runs only on cache misses. */
  answer(input: AnswerInput): Promise<AnswerResult>;

  /**
   * A user's own document. One call does the reading and the translating —
   * running OCR first and translation second would double the cost and throw
   * away the page layout, which is exactly what makes a lab report readable.
   */
  translate(input: TranslateInput): Promise<TranslateResult>;

  /**
   * Works only from the conversation so far — no retrieval, no new facts.
   *
   * Used for "say that in simpler words", "give me that in Hindi", "what did
   * you just mention". Rewording something already verified is not the same
   * as answering a new question, and treating it as one made the assistant
   * refuse ordinary follow-ups.
   */
  converse(input: ConverseInput): Promise<ConverseResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type Intent =
  | 'greeting'
  /**
   * A request about the assistant's own previous answer — rephrase it,
   * shorten it, translate it. Safe to serve from the conversation, because
   * the content was already retrieved and verified when it was first given.
   */
  | 'meta'
  | 'question'
  | 'answering_our_question'
  | 'switching_process'
  | 'off_topic'
  | 'unclear'
  | 'emergency'
  | 'injection_attempt';

export interface ClassifyInput {
  message: string;
  knownContext: Record<string, unknown>;
}

export interface ClassifyResult {
  intent: Intent;
  /**
   * The question rewritten as a complete sentence, for embedding.
   *
   * Users type fragments: "us licenece", "rfc?", "curp cost". Two words carry
   * almost no meaning, so their vector lands nowhere near a paragraph of
   * Spanish prose and retrieval finds nothing — even when the document is
   * sitting right there. Expanding the fragment first is the difference
   * between a working search and one that only answers full sentences.
   *
   * Null when no expansion is needed.
   */
  searchQuery: string | null;
  categoryKey: string | null;
  processKey: string | null;
  /** Only act on a detected process when confidence is high — a rigid process
   *  card full of "not available" reads worse than a normal answer. */
  processConfidence: 'high' | 'low';
  /** Facts the user gave us in this message, to merge into the conversation. */
  extractedContext: Record<string, unknown>;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  similarity: number;
  /** null means the source document applies nationally. */
  stateScope: string | null;
}

export interface AnswerInput {
  question: string;
  chunks: RetrievedChunk[];
  history: { role: 'user' | 'assistant'; content: string }[];
  userState: string | null;
  /** Present only when the user is asking about their own uploaded document.
   *  Private context for this one request — never indexed. */
  userDocumentText?: string | null;
}

/** Every fact carries where it came from. A null value with a null source is
 *  the correct output when the sources do not cover it. */
export interface SourcedFact {
  value: string | null;
  sourceChunkId: string | null;
  /** 'user_document' facts come from the user's own upload and are not
   *  verified against retrieved chunks — they are theirs, not ours. */
  sourceType?: 'knowledge_base' | 'user_document';
}

export interface AnswerResult {
  summary: string;
  steps: string[];
  requiredDocuments: string[];
  totalFee: SourcedFact;
  processingTime: SourcedFact;
  office: SourcedFact;
  confidence: 'high' | 'medium' | 'none';
  usage: { inputTokens: number; outputTokens: number; model: string };
}


export interface TranslateInput {
  /** Extracted text when the file had a text layer. */
  text: string | null;
  /** The photograph or scan when it did not. Goes into this same call. */
  imageBase64?: string | null;
  imageMimeType?: string | null;
  kind: 'medical' | 'general';
}

export interface TranslateResult {
  translatedText: string;
  explanation: string;

  /**
   * Written in Spanish, so the treating doctor can read it directly.
   * Medical documents only.
   */
  doctorSummary: string | null;

  /**
   * Vision models return no confidence score the way a dedicated OCR service
   * does, so the schema asks for this instead. Unreadable words come back as
   * [unclear] markers inline. This is what drives "try another photo".
   */
  legibility: 'high' | 'medium' | 'low';

  usage: { inputTokens: number; outputTokens: number; model: string };
}


export interface ConverseInput {
  /** What the user just asked. */
  request: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface ConverseResult {
  reply: string;
  usage: { inputTokens: number; outputTokens: number; model: string };
}
