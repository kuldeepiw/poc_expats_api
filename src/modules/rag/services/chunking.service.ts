import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Chunk {
  index: number;
  content: string;
  wordCount: number;
}

@Injectable()
export class ChunkingService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Splits text into overlapping windows.
   *
   * The overlap is what stops a fact being cut in half at a boundary:
   * "the fee is 5,200 MXN," | "payable at the bank beforehand" answers
   * nothing usefully in either half.
   */
  split(text: string): Chunk[] {
    const size = this.config.get<number>('chunking.sizeWords')!;
    const overlap = this.config.get<number>('chunking.overlapWords')!;
    const step = Math.max(1, size - overlap);

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const chunks: Chunk[] = [];
    for (let start = 0, index = 0; start < words.length; start += step, index++) {
      const slice = words.slice(start, start + size);
      chunks.push({
        index,
        content: slice.join(' '),
        wordCount: slice.length,
      });
      if (start + size >= words.length) break;
    }
    return chunks;
  }
}
