import { Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding.provider';

/**
 * Gemini embeddings, behind the same interface as the local model.
 *
 * `outputDimensionality` lets the model return 384 numbers instead of its
 * native 3072, which means it drops straight into the existing vector(384)
 * column — no migration, only a re-embed.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiEmbeddingProvider.name);
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

  // 429 is left out on purpose: a quota limit is per-model, so retrying the
  // same one cannot succeed.
  private static readonly RETRYABLE = new Set([500, 502, 503, 504]);
  private static readonly MAX_ATTEMPTS = 3;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  /** A question. */
  embed(text: string): Promise<number[]> {
    return this.request(text, 'RETRIEVAL_QUERY');
  }

  /** Stored chunks. The task type matters: asymmetric retrieval models are
   *  trained to embed a question and a passage differently, and using the
   *  wrong one quietly costs accuracy. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      out.push(await this.request(text, 'RETRIEVAL_DOCUMENT'));
    }
    return out;
  }

  private async request(text: string, taskType: string): Promise<number[]> {
    const body = JSON.stringify({
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: this.dimensions,
    });

    let response: Response | null = null;

    for (let attempt = 1; attempt <= GeminiEmbeddingProvider.MAX_ATTEMPTS; attempt++) {
      response = await fetch(`${this.endpoint}/${this.model}:embedContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': this.apiKey },
        body,
      });
      if (response.ok) break;
      if (
        !GeminiEmbeddingProvider.RETRYABLE.has(response.status) ||
        attempt === GeminiEmbeddingProvider.MAX_ATTEMPTS
      ) {
        break;
      }
      const wait = 500 * 2 ** (attempt - 1);
      this.logger.warn(`embedding ${response.status}, retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }

    if (!response?.ok) {
      const detail = response ? await response.text() : 'no response';
      throw new Error(`Gemini embedding failed: ${detail.slice(0, 200)}`);
    }

    const values: number[] = (await response.json())?.embedding?.values ?? [];

    if (values.length !== this.dimensions) {
      throw new Error(
        `${this.model} returned ${values.length} dimensions, expected ${this.dimensions}. ` +
          `Update EMBEDDING_DIMENSIONS and the vector(N) column together, then re-embed.`,
      );
    }

    // Truncated outputs are not unit length, and cosine distance assumes they
    // are. Skipping this silently degrades every similarity score.
    const norm = Math.hypot(...values) || 1;
    return values.map((v) => v / norm);
  }
}
