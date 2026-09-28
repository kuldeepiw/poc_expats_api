import { Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding.provider';

type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * A real multilingual embedding model, running in-process. No API key, no
 * cost, no network after the first download.
 *
 * Multilingual is not a nice-to-have here. The documents are Spanish and the
 * questions arrive in English, so retrieval has to match across languages:
 * "tax ID" must find "Registro Federal de Contribuyentes". An English-only
 * model fails that silently — it returns nothing, the assistant says it does
 * not know, and the answer was in the library all along.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalEmbeddingProvider.name);
  private extractor: FeatureExtractor | null = null;
  private loading: Promise<FeatureExtractor> | null = null;

  constructor(
    readonly model: string,
    readonly dimensions: number,
  ) {}

  /**
   * E5 models are trained with these prefixes and lose accuracy without them.
   * Stored text is a passage; a question is a query.
   */
  private prefix(text: string, kind: 'query' | 'passage'): string {
    return this.model.includes('e5') ? `${kind}: ${text}` : text;
  }

  private async load(): Promise<FeatureExtractor> {
    if (this.extractor) return this.extractor;
    if (!this.loading) {
      this.loading = (async () => {
        this.logger.log(`loading ${this.model} — first run downloads the weights`);
        const { pipeline } = await import('@huggingface/transformers');
        const pipe = await pipeline('feature-extraction', this.model);
        this.extractor = pipe as unknown as FeatureExtractor;
        this.logger.log(`${this.model} ready`);
        return this.extractor;
      })();
    }
    return this.loading;
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.run([this.prefix(text, 'query')]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.run(texts.map((t) => this.prefix(t, 'passage')));
  }

  private async run(texts: string[]): Promise<number[][]> {
    const extractor = await this.load();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const vectors = output.tolist();

    // Fail loudly rather than write vectors of the wrong length into a
    // vector(N) column, where the error would surface much later and much
    // less clearly.
    if (vectors[0]?.length !== this.dimensions) {
      throw new Error(
        `${this.model} returned ${vectors[0]?.length} dimensions, but ` +
          `EMBEDDING_DIMENSIONS is ${this.dimensions}. Update the config and ` +
          `the vector(N) column together, then re-embed.`,
      );
    }
    return vectors;
  }
}
