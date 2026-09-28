import { Injectable, Logger } from '@nestjs/common';
import {
  AnswerInput, AnswerResult, ClassifyInput, ClassifyResult, ConverseInput,
  ConverseResult, LlmProvider, TranslateInput, TranslateResult,
} from './llm.provider';

/**
 * Stands in while the AWS account cannot invoke Bedrock.
 *
 * It returns a realistically shaped response so that streaming, grounding
 * verification, caching, persistence and the UI can all be built and tested.
 * Replacing it with the Bedrock provider is a config change.
 *
 * It deliberately never invents a fee: with no chunks it returns nulls and
 * confidence 'none', which is the behaviour the real system must have.
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockLlmProvider.name);

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const text = input.message.toLowerCase();

    const greeting = /^\s*(hi|hey|hello|hola|thanks|thank you|good (morning|afternoon|evening))\b[\s!.?]*$/.test(text);
    const emergency = /emergency|ambulance|chest pain|suicide|bleeding/.test(text);
    const injection = /ignore (all |previous )?instructions|system prompt/.test(text);

    return {
      intent: greeting
        ? 'greeting'
        : emergency
          ? 'emergency'
          : injection
            ? 'injection_attempt'
            : 'question',
      categoryKey: /rfc|sat|tax|impuesto/.test(text) ? 'tax' : null,
      processKey: /rfc/.test(text) ? 'rfc_registration' : null,
      processConfidence: 'low',
      searchQuery: null,
      extractedContext: {},
    };
  }

  async answer(input: AnswerInput): Promise<AnswerResult> {
    this.logger.debug(`mock answer over ${input.chunks.length} chunks`);

    // A question about the user's own uploaded document. Their document is
    // the source — the knowledge base may add nothing, and that is fine.
    if (input.userDocumentText) {
      const fromDocument = input.userDocumentText.slice(0, 200);
      return {
        summary:
          `[MOCK] From your document: ${fromDocument}...` +
          (input.chunks.length
            ? ` And from ${input.chunks[0].documentTitle}: ${input.chunks[0].content.slice(0, 120)}...`
            : ''),
        steps: [],
        requiredDocuments: [],
        // Facts taken from the user's own document are marked as such, so
        // grounding verification skips them — they are theirs, not ours, and
        // checking them against our chunks would be meaningless.
        totalFee: { value: null, sourceChunkId: null, sourceType: 'user_document' },
        processingTime: { value: null, sourceChunkId: null, sourceType: 'user_document' },
        office: { value: null, sourceChunkId: null, sourceType: 'user_document' },
        confidence: 'medium',
        usage: { inputTokens: 0, outputTokens: 0, model: this.name },
      };
    }

    if (input.chunks.length === 0) {
      return {
        summary:
          'I do not have confirmed information on this yet. Our document library does not cover it, so rather than guess, please check with the relevant official body.',
        steps: [],
        requiredDocuments: [],
        totalFee: { value: null, sourceChunkId: null },
        processingTime: { value: null, sourceChunkId: null },
        office: { value: null, sourceChunkId: null },
        confidence: 'none',
        usage: { inputTokens: 0, outputTokens: 0, model: this.name },
      };
    }

    const first = input.chunks[0];
    return {
      summary: `[MOCK] Based on ${first.documentTitle}: ${first.content.slice(0, 180)}...`,
      steps: ['[MOCK] Step one', '[MOCK] Step two'],
      requiredDocuments: ['[MOCK] Passport'],
      totalFee: { value: null, sourceChunkId: null, sourceType: 'knowledge_base' },
      processingTime: { value: null, sourceChunkId: null, sourceType: 'knowledge_base' },
      office: { value: null, sourceChunkId: null, sourceType: 'knowledge_base' },
      confidence: 'medium',
      usage: { inputTokens: 0, outputTokens: 0, model: this.name },
    };
  }

  async translate(input: TranslateInput): Promise<TranslateResult> {
    const source = input.imageBase64
      ? '(image supplied — a real provider would read it)'
      : (input.text ?? '').slice(0, 300);

    return {
      translatedText: `[MOCK translation of ${input.kind} document]\n${source}`,
      explanation:
        input.kind === 'medical'
          ? '[MOCK] Terminology would be explained here in plain English. No diagnosis is offered — only a doctor can interpret these results.'
          : '[MOCK] A one-line summary of what this document requires of you.',
      // Spanish, because its only reader is the Mexican doctor.
      doctorSummary:
        input.kind === 'medical'
          ? '[MOCK] Resumen clinico en espanol para el medico tratante.'
          : null,
      legibility:
        input.imageBase64 || (input.text && input.text.length > 40) ? 'high' : 'low',
      usage: { inputTokens: 0, outputTokens: 0, model: this.name },
    };
  }

  async converse(input: ConverseInput): Promise<ConverseResult> {
    const last = [...input.history].reverse().find((h) => h.role === 'assistant');
    return {
      reply: `[MOCK] From my earlier answer: ${last?.content.slice(0, 160) ?? '(nothing yet)'}`,
      usage: { inputTokens: 0, outputTokens: 0, model: this.name },
    };
  }
}
