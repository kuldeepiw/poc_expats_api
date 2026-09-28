import { Injectable, Logger } from '@nestjs/common';
import { AnswerResult, RetrievedChunk, SourcedFact } from '../providers/llm/llm.provider';

export interface GroundingReport {
  answer: AnswerResult;
  strippedFields: string[];
  /** True when every fact-bearing field failed. That is not a normal
   *  "I don't know" — it means retrieval or the prompt is broken. */
  totalFailure: boolean;
}

/**
 * Layer 3 of grounding enforcement: verify in code, do not trust the citation.
 *
 * Layer 1 is prohibitions in the system prompt.
 * Layer 2 is requiring a source id on every fact.
 * Layer 4 is the interface rendering a null as "not available".
 *
 * This layer is the only one that cannot be talked around, because it is
 * arithmetic rather than instruction-following.
 */
@Injectable()
export class GroundingService {
  private readonly logger = new Logger(GroundingService.name);

  private static readonly FACT_FIELDS = [
    'totalFee',
    'processingTime',
    'office',
  ] as const;

  verify(answer: AnswerResult, retrieved: RetrievedChunk[]): GroundingReport {
    const byId = new Map(retrieved.map((c) => [c.chunkId, c]));
    const stripped: string[] = [];
    const verified: AnswerResult = { ...answer };

    for (const field of GroundingService.FACT_FIELDS) {
      const fact = answer[field];
      if (!fact || fact.value === null) continue;

      // A fact taken from the user's own uploaded document is theirs.
      // Checking it against our chunks would be meaningless.
      if (fact.sourceType === 'user_document') continue;

      if (!this.isGrounded(fact, byId)) {
        verified[field] = { value: null, sourceChunkId: null };
        stripped.push(field);
      }
    }

    if (stripped.length > 0) {
      this.logger.warn(`grounding stripped: ${stripped.join(', ')}`);
    }

    const claimed = GroundingService.FACT_FIELDS.filter(
      (f) => answer[f]?.value !== null,
    ).length;
    const totalFailure = claimed > 0 && stripped.length === claimed;

    if (totalFailure) {
      // Distinct from an honest "nothing found" — this is a defect, and it
      // will hide inside normal-looking behaviour unless logged separately.
      this.logger.error(
        'grounding nulled every claimed fact — retrieval or prompt is broken',
      );
    }

    return {
      answer: { ...verified, confidence: stripped.length ? 'none' : verified.confidence },
      strippedFields: stripped,
      totalFailure,
    };
  }

  private isGrounded(fact: SourcedFact, byId: Map<string, RetrievedChunk>): boolean {
    // Check one: does the cited chunk exist in what we actually retrieved?
    if (!fact.sourceChunkId) return false;
    const chunk = byId.get(fact.sourceChunkId);
    if (!chunk) return false;

    // Check two: for a numeric value, does the number literally appear in
    // that chunk's text? Prose is deliberately exempt — rephrasing prose is
    // the whole point of the product.
    const numbers = (fact.value ?? '').match(/[\d][\d.,]*/g);
    if (!numbers) return true;

    const haystack = chunk.content.replace(/[\s,]/g, '');
    return numbers.every((n) => haystack.includes(n.replace(/[\s,]/g, '')));
  }
}
