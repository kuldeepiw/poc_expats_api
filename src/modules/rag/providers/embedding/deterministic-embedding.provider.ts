import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EmbeddingProvider } from './embedding.provider';

/**
 * A placeholder that produces a stable vector for a given string.
 *
 * It exercises the storage and search plumbing end to end, but it is NOT
 * semantic: "tax ID" will not match "Registro Federal de Contribuyentes".
 *
 * Replace it with a real multilingual model before judging retrieval quality.
 * That matters more here than in most RAG products, because the documents are
 * Spanish and the questions arrive in English — retrieval has to work across
 * languages, and that is worth testing before anything is built on top of it.
 */
@Injectable()
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'deterministic-placeholder';
  readonly model = 'deterministic-placeholder';

  constructor(readonly dimensions: number) {}

  async embed(text: string): Promise<number[]> {
    const normalised = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const out = new Array<number>(this.dimensions);
    let digest = createHash('sha256').update(normalised).digest();

    for (let i = 0; i < this.dimensions; i++) {
      if (i > 0 && i % digest.length === 0) {
        digest = createHash('sha256').update(digest).digest();
      }
      out[i] = digest[i % digest.length] / 255 - 0.5;
    }

    const norm = Math.hypot(...out) || 1;
    return out.map((v) => v / norm);
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
