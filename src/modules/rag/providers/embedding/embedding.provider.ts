/**
 * Turns text into a vector.
 *
 * The single most dangerous configuration value in the project lives behind
 * this interface: the same model must be used when indexing chunks and when
 * embedding questions. Different models place vectors on different scales,
 * nothing matches, and no error is ever raised.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;

  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
