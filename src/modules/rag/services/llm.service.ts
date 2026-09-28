import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER } from '../providers/llm/llm.provider';
import type {
  AnswerInput, AnswerResult, ClassifyInput, ClassifyResult, ConverseInput,
  ConverseResult, LlmProvider, TranslateInput, TranslateResult,
} from '../providers/llm/llm.provider';
import { PromptService } from './prompt.service';

/**
 * The only place in the codebase that talks to a language model.
 *
 * Classification runs on every message; answering runs only on cache misses.
 * Keeping them on different models is the single largest cost lever in the
 * product, and it lives here.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prompts: PromptService,
  ) {
    this.logger.log(`llm provider: ${provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  classify(input: ClassifyInput): Promise<ClassifyResult> {
    return this.provider.classify(input);
  }

  async answer(input: AnswerInput): Promise<AnswerResult> {
    const prompt = this.prompts.build(input);
    this.logger.debug(`prompt assembled, ${prompt.length} chars`);
    return this.provider.answer(input);
  }

  /**
   * Flow C. Deliberately separate from answer(): there is nothing to retrieve,
   * because the user's own document is the source.
   */
  translate(input: TranslateInput): Promise<TranslateResult> {
    return this.provider.translate(input);
  }

  /** Follow-ups about the conversation itself. No retrieval. */
  converse(input: ConverseInput): Promise<ConverseResult> {
    return this.provider.converse(input);
  }
}
