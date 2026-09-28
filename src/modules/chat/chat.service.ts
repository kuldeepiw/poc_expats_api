import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnswerIssue, Conversation, Message, MessageSource, UserUpload,
} from '../../database/entities';
import { RetrievalService } from '../rag/services/retrieval.service';
import { LlmService } from '../rag/services/llm.service';
import { GroundingService } from '../rag/services/grounding.service';
import { CacheService } from '../cache/cache.service';
import { AuthedUser } from '../auth/decorators/current-user.decorator';
import { SendMessageDto } from './dto/chat.dto';
import type { AnswerResult, RetrievedChunk } from '../rag/providers/llm/llm.provider';
import { LlmUnavailableError } from '../rag/providers/llm/llm.errors';

const DAILY_MESSAGE_LIMIT = 50;

export type ReplyStatus = 'answered' | 'refused' | 'unavailable';

export interface ChatReply {
  conversationId: string;
  messageId: string | null;
  /**
   * Refused and unavailable both arrive with no sources and confidence
   * "none", but they mean opposite things: one says the library has no
   * answer and the fix is a document, the other says our provider is down
   * and the fix is to try again. Showing the same screen for both sends the
   * admin hunting for a document that already exists.
   */
  status: ReplyStatus;
  answer: AnswerResult;
  sources: { documentId: string; documentTitle: string; similarity: number }[];
  cached: boolean;
  grounding: { strippedFields: string[] };
}

/**
 * Flow B, in order.
 *
 *   rate limit -> cache -> classify -> embed -> search -> prompt
 *   -> generate -> verify -> persist -> cache
 *
 * The database does the searching; the model writes the words. They never
 * meet: chunks are retrieved here and handed to the model as plain text.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(MessageSource) private readonly sources: Repository<MessageSource>,
    @InjectRepository(AnswerIssue) private readonly issues: Repository<AnswerIssue>,
    @InjectRepository(UserUpload) private readonly uploads: Repository<UserUpload>,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
    private readonly grounding: GroundingService,
    private readonly cache: CacheService,
  ) {}

  async send(
    user: AuthedUser,
    dto: SendMessageDto,
    onProgress?: (stage: string, label: string) => void,
  ): Promise<ChatReply> {
    const progress = onProgress ?? (() => undefined);
    // 1. Rate limit. One user must not be able to run up the AI bill.
    const used = await this.cache.incrementDaily(user.id);
    if (used > DAILY_MESSAGE_LIMIT) {
      throw new ForbiddenException(
        `You have reached today's limit of ${DAILY_MESSAGE_LIMIT} questions. It resets at midnight.`,
      );
    }

    const conversation = await this.resolveConversation(user.id, dto);
    const normalised = this.cache.normalise(dto.message);

    // 2. Classification and, below, embedding both operate on the raw
    // question and do not depend on each other.
    const classification = await this.llm.classify({
      message: dto.message,
      knownContext: conversation.collected_context,
    });

    // A follow-up about our own previous answer: reword it, shorten it,
    // translate it, recall it. No retrieval — the content was already
    // retrieved and verified when it was first given, and searching again
    // would find documents that do not answer "say that in simpler words".
    if (classification.intent === 'meta') {
      const history = await this.recentHistory(conversation.id);

      if (history.length === 0) {
        return this.persist(
          conversation, dto.message,
          this.plain('There is nothing earlier in this conversation yet. Ask me a question first.'),
          [], false, [],
        );
      }

      try {
        const { reply } = await this.llm.converse({ request: dto.message, history });
        return this.persist(conversation, dto.message, this.plain(reply), [], false, []);
      } catch (error) {
        if (error instanceof LlmUnavailableError) {
          return this.persist(
            conversation, dto.message, this.unavailable(error.userMessage),
            [], false, [], 'unavailable',
          );
        }
        throw error;
      }
    }

    const fixed = this.fixedResponse(classification.intent);
    if (fixed) {
      return this.persist(conversation, dto.message, fixed, [], false, []);
    }

    const categoryKey = classification.categoryKey;

    // 3. Cache. A hit costs nothing and returns in milliseconds — but only
    // answers that are the same for everyone are ever stored.
    // Only a running conversation or the user's own file rules out a cache
    // read up front. Whether a state-scoped source was used is not known
    // until after retrieval, and is checked before writing.
    const personalised = conversation.message_count > 0 || Boolean(dto.uploadId);
    if (!personalised) {
      const hit = await this.cache.get<ChatReply>(normalised, categoryKey);
      if (hit) {
        progress('cached', 'Found a previous answer');

        // A cached refusal still means somebody hit a gap in the library.
        // Without this the worklist under-counts exactly the questions that
        // are asked most, because the second and later askers are served
        // from cache and never counted. The ranking is the whole point of
        // that screen, so it has to reflect people, not cache misses.
        if (hit.answer.confidence === 'none' && hit.sources.length === 0) {
          await this.logUnanswered(user, dto.message, normalised, categoryKey);
        }

        // A cache hit is still a turn in this user's conversation. Returning
        // it without persisting would leave the exchange missing from their
        // history, and would make the cache invisible to the dashboard — and
        // cache hit rate is one of the two numbers that panel exists for.
        // The cached reply carries its own status. Letting persist() default
        // it turns a cached refusal into an "answered" one, and the interface
        // then renders refusal text under an ordinary answer heading.
        return this.persist(
          conversation, dto.message, hit.answer, [], true, [], hit.status,
        ).then((saved) => ({ ...saved, sources: hit.sources }));
      }
    }

    // 4. Retrieve. State is a strict filter; category is soft — see
    // RetrievalService for why.
    // Search on the expanded question, answer the one the user actually
    // asked. A fragment like "us licenece" retrieves nothing on its own.
    const searchText = classification.searchQuery ?? dto.message;
    if (classification.searchQuery && classification.searchQuery !== dto.message) {
      this.logger.debug(`search expanded: "${dto.message}" -> "${searchText}"`);
    }

    const chunks = await this.retrieval.search({
      question: searchText,
      categoryKey,
      userState: user.state,
    });

    // The user's own uploaded document, when they are asking about it.
    // Private context for this one request — never embedded, never indexed.
    const userDocumentText = dto.uploadId
      ? (await this.uploads.findOneBy({ id: dto.uploadId, user_id: user.id }))?.extracted_text ?? null
      : null;

    if (chunks.length === 0 && !userDocumentText) {
      await this.logUnanswered(user, dto.message, normalised, categoryKey);
      const refused = await this.persist(
        conversation, dto.message, this.refusal(), [], false, [], 'refused',
      );

      // Refusals are cached deliberately. At launch, with a thin library,
      // this is the most common answer there is — and it is identical for
      // everyone, since no sources were involved. Not caching it means paying
      // for a classification, an embedding and a search every single time.
      //
      // This is only safe because DocumentProcessor clears the cache when a
      // document becomes ready. Without that, a user would keep being told
      // "we don't have information on this" after the very document that
      // answers it had been uploaded.
      await this.cache.set(normalised, categoryKey, { ...refused, cached: false });
      return refused;
    }

    // 5. Generate.
    progress('writing', 'Writing the answer…');
    const history = await this.recentHistory(conversation.id);

    let raw: AnswerResult;
    try {
      raw = await this.llm.answer({
        question: dto.message,
        chunks,
        history,
        userState: user.state,
        userDocumentText,
      });
    } catch (error) {
      // A provider outage is our problem, not the user's. They get a plain
      // message and their question back — never a stack trace, and never a
      // 500 that looks like the product is broken.
      if (error instanceof LlmUnavailableError) {
        this.logger.error(`llm unavailable: ${error.message}`);
        return this.persist(
          conversation, dto.message, this.unavailable(error.userMessage), [], false, [],
          'unavailable',
        );
      }
      throw error;
    }

    // 6. Verify. We do not trust the model's own citations.
    const report = this.grounding.verify(raw, chunks);

    // Chunks came back but did not answer the question. That is still a gap —
    // the library has something near the topic and nothing on the point — and
    // it belongs on the worklist just as much as finding nothing at all.
    if (report.answer.confidence === 'none') {
      await this.logUnanswered(user, dto.message, normalised, categoryKey);
    }

    const reply = await this.persist(
      conversation, dto.message, report.answer, chunks, false, report.strippedFields,
    );

    // 7. Cache, if it is safe to.
    if (
      this.cache.isCacheable({
        usedStateScopedSource: chunks.some((c) => c.stateScope !== null),
        usedHistory: history.length > 0,
        usedUserDocument: Boolean(userDocumentText),
      })
    ) {
      await this.cache.set(normalised, categoryKey, { ...reply, cached: false });
    }

    return reply;
  }

  async listConversations(userId: string) {
    return this.conversations.find({
      where: { user_id: userId },
      order: { last_message_at: 'DESC' },
      take: 50,
    });
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.conversations.findOneBy({ id, user_id: userId });
    if (!conversation) return null;
    const messages = await this.messages.find({
      where: { conversation_id: id },
      order: { created_at: 'ASC' },
    });
    return { conversation, messages };
  }

  // ---------------------------------------------------------------- helpers

  private async resolveConversation(userId: string, dto: SendMessageDto): Promise<Conversation> {
    if (dto.conversationId) {
      const existing = await this.conversations.findOneBy({
        id: dto.conversationId,
        user_id: userId,
      });
      if (existing) {
        // An explicit process choice wins; otherwise the thread keeps the one
        // it already had, so follow-ups inherit it without being re-sent.
        if (dto.processKey && dto.processKey !== existing.process_key) {
          existing.process_key = dto.processKey;
          await this.conversations.save(existing);
        }
        return existing;
      }
    }

    return this.conversations.save(
      this.conversations.create({
        user_id: userId,
        title: dto.message.slice(0, 60),
        process_key: dto.processKey ?? null,
        collected_context: {},
      }),
    );
  }

  private async recentHistory(conversationId: string) {
    const rows = await this.messages.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'DESC' },
      take: 10,
    });
    return rows
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Cases that must never reach retrieval. A healthcare product that hands a
   * medical crisis to an AI answer is a liability.
   */
  private fixedResponse(intent: string): AnswerResult | null {
    const blank = {
      steps: [] as string[],
      requiredDocuments: [] as string[],
      totalFee: { value: null, sourceChunkId: null },
      processingTime: { value: null, sourceChunkId: null },
      office: { value: null, sourceChunkId: null },
      confidence: 'none' as const,
      usage: { inputTokens: 0, outputTokens: 0, model: 'fixed-response' },
    };

    switch (intent) {
      case 'greeting':
        // Never reaches retrieval, and never becomes a row on the admin's
        // worklist. "hello" reaching that screen as the most-asked missing
        // topic is exactly how a genuinely useful ranking becomes noise.
        return {
          ...blank,
          summary:
            'Hello. Ask me anything about living in Mexico — immigration and residency, taxes and the RFC, healthcare, or everyday things like banking, utilities and driving. I answer from official documents, and I will tell you when I do not have one.',
        };
      case 'emergency':
        return {
          ...blank,
          summary:
            'If this is a medical emergency, call 911 in Mexico now, or go to the nearest emergency room. This service cannot help with emergencies.',
        };
      case 'off_topic':
        return {
          ...blank,
          summary:
            'That is outside what this assistant covers. It answers questions about immigration, taxes, healthcare and daily life in Mexico.',
        };
      case 'injection_attempt':
        return {
          ...blank,
          summary:
            'I can only answer from the documents in our library, using the rules this service operates under.',
        };
      default:
        return null;
    }
  }

  /**
   * A prose reply with no fact fields.
   *
   * Confidence is 'medium', not 'none': the content came from an answer that
   * already passed grounding. Marking it 'none' would render it as a refusal,
   * which is the opposite of what happened.
   */
  private plain(summary: string): AnswerResult {
    return {
      summary,
      steps: [],
      requiredDocuments: [],
      totalFee: { value: null, sourceChunkId: null },
      processingTime: { value: null, sourceChunkId: null },
      office: { value: null, sourceChunkId: null },
      confidence: 'medium',
      usage: { inputTokens: 0, outputTokens: 0, model: 'conversation' },
    };
  }

  /** Distinct from a refusal: the library may well have the answer. */
  private unavailable(message: string): AnswerResult {
    return {
      summary: message,
      steps: [],
      requiredDocuments: [],
      totalFee: { value: null, sourceChunkId: null },
      processingTime: { value: null, sourceChunkId: null },
      office: { value: null, sourceChunkId: null },
      confidence: 'none',
      usage: { inputTokens: 0, outputTokens: 0, model: 'unavailable' },
    };
  }

  private refusal(): AnswerResult {
    return {
      summary:
        'I do not have confirmed information on this yet. Our document library does not cover it. Rather than guess, please check with the relevant official body — your question has been logged so we can add the right document.',
      steps: [],
      requiredDocuments: [],
      totalFee: { value: null, sourceChunkId: null },
      processingTime: { value: null, sourceChunkId: null },
      office: { value: null, sourceChunkId: null },
      confidence: 'none',
      usage: { inputTokens: 0, outputTokens: 0, model: 'refusal' },
    };
  }

  /**
   * Every refusal becomes a row on the admin's worklist. This is the only
   * mechanism by which the library improves.
   */
  private async logUnanswered(
    user: AuthedUser, question: string, normalised: string, categoryKey: string | null,
  ) {
    const existing = await this.issues.findOneBy({
      type: 'unanswered',
      normalized_text: normalised,
    });

    if (existing) {
      // Deduplicated and counted, so one loud user cannot outrank fifty quiet ones.
      await this.issues.update(existing.id, {
        occurrence_count: existing.occurrence_count + 1,
        last_seen_at: new Date(),
      });
      return;
    }

    await this.issues.save(
      this.issues.create({
        type: 'unanswered',
        user_id: user.id,
        question_text: question,
        normalized_text: normalised,
        category_id: categoryKey,
        user_state: user.state,
      }),
    );
  }

  private async persist(
    conversation: Conversation,
    question: string,
    answer: AnswerResult,
    chunks: RetrievedChunk[],
    cached: boolean,
    strippedFields: string[],
    status: ReplyStatus = 'answered',
  ): Promise<ChatReply> {
    await this.messages.save(
      this.messages.create({
        conversation_id: conversation.id,
        role: 'user',
        content: question,
      }),
    );

    const assistant = await this.messages.save(
      this.messages.create({
        conversation_id: conversation.id,
        role: 'assistant',
        content: answer.summary,
        content_structured: answer as unknown as Record<string, unknown>,
        confidence: answer.confidence,
        // Diagnostics only — never filtered on, which is why it is JSONB.
        metadata: {
          model: answer.usage.model,
          inputTokens: answer.usage.inputTokens,
          outputTokens: answer.usage.outputTokens,
          chunksRetrieved: chunks.length,
          groundingStripped: strippedFields,
          cached,
        },
      }),
    );

    if (chunks.length > 0) {
      await this.sources.save(
        chunks.map((chunk, index) =>
          this.sources.create({
            message_id: assistant.id,
            chunk_id: chunk.chunkId,
            document_id: chunk.documentId,
            similarity_score: chunk.similarity,
            rank: index + 1,
          }),
        ),
      );
    }

    await this.conversations.update(conversation.id, {
      message_count: conversation.message_count + 2,
      last_message_at: new Date(),
    });

    return {
      conversationId: conversation.id,
      messageId: assistant.id,
      status,
      answer,
      sources: chunks.map((c) => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        similarity: c.similarity,
      })),
      cached,
      grounding: { strippedFields },
    };
  }
}
