import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ChunkingService } from './services/chunking.service';
import { EmbeddingService } from './services/embedding.service';
import { GroundingService } from './services/grounding.service';
import { LlmService } from './services/llm.service';
import { PromptService } from './services/prompt.service';
import { RetrievalService } from './services/retrieval.service';
import { EmbeddingGuard } from './embedding-guard.service';

import { LLM_PROVIDER } from './providers/llm/llm.provider';
import { MockLlmProvider } from './providers/llm/mock-llm.provider';
import { GeminiLlmProvider } from './providers/llm/gemini-llm.provider';
import { EMBEDDING_PROVIDER } from './providers/embedding/embedding.provider';
import { DeterministicEmbeddingProvider } from './providers/embedding/deterministic-embedding.provider';
import { LocalEmbeddingProvider } from './providers/embedding/local-embedding.provider';
import { GeminiEmbeddingProvider } from './providers/embedding/gemini-embedding.provider';

/**
 * The RAG pipeline, in one module.
 *
 *   chunk  ->  embed  ->  search  ->  prompt  ->  generate  ->  verify
 *
 * Providers are swapped here and nowhere else. Moving from the mock to
 * Bedrock, or from the placeholder embeddings to a real model, is a change to
 * this file plus a config value — not a change to any consumer.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        switch (config.get<string>('llm.provider')) {
          // case 'bedrock': return new BedrockLlmProvider(config);
          case 'gemini':
            return new GeminiLlmProvider(
              config.get<string>('gemini.apiKey')!,
              config.get<string>('gemini.answerModel')!,
              config.get<string>('gemini.classifyModel')!,
              config.get<string[]>('gemini.fallbackModels') ?? [],
            );
          default:
            return new MockLlmProvider();
        }
      },
    },
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dimensions = config.get<number>('embedding.dimensions')!;
        const model = config.get<string>('embedding.model')!;
        switch (config.get<string>('embedding.provider')) {
          // case 'bedrock': return new BedrockEmbeddingProvider(config);
          case 'gemini':
            return new GeminiEmbeddingProvider(
              config.get<string>('gemini.apiKey')!,
              model,
              dimensions,
            );
          case 'local':
            return new LocalEmbeddingProvider(model, dimensions);
          default:
            // Not semantic. Exercises the plumbing only.
            return new DeterministicEmbeddingProvider(dimensions);
        }
      },
    },
    ChunkingService,
    EmbeddingService,
    RetrievalService,
    PromptService,
    LlmService,
    GroundingService,
    EmbeddingGuard,
  ],
  exports: [
    ChunkingService,
    EmbeddingService,
    RetrievalService,
    LlmService,
    GroundingService,
  ],
})
export class RagModule {}
