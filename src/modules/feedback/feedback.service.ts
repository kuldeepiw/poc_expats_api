import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnswerIssue, Message, MessageSource } from '../../database/entities';
import { CacheService } from '../cache/cache.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

/**
 * Feedback and unanswered questions share one table, because operationally
 * they are the same thing: this answer had a problem, and some document would
 * fix it.
 *
 * Nothing here retrains anything. A person reads the queue, works out which
 * document is missing, and uploads a better one.
 */
@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(AnswerIssue) private readonly issues: Repository<AnswerIssue>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(MessageSource) private readonly sources: Repository<MessageSource>,
    private readonly cache: CacheService,
  ) {}

  async submit(userId: string, dto: SubmitFeedbackDto) {
    const message = await this.messages.findOneBy({ id: dto.messageId });
    if (!message) throw new NotFoundException('Message not found');

    // A thumbs-up needs no queue entry. Only problems become work.
    if (dto.isHelpful) {
      return { recorded: true, queued: false };
    }

    const question = await this.messages.findOne({
      where: { conversation_id: message.conversation_id, role: 'user' },
      order: { created_at: 'DESC' },
    });

    const questionText = question?.content ?? '';
    const normalised = this.cache.normalise(questionText);

    const existing = await this.issues.findOneBy({
      type: 'feedback',
      normalized_text: normalised,
    });

    if (existing) {
      await this.issues.update(existing.id, {
        occurrence_count: existing.occurrence_count + 1,
        last_seen_at: new Date(),
      });
      return { recorded: true, queued: true };
    }

    await this.issues.save(
      this.issues.create({
        type: 'feedback',
        message_id: message.id,
        user_id: userId,
        question_text: questionText,
        normalized_text: normalised,
        is_helpful: false,
        comment: dto.comment ?? null,
      }),
    );

    return { recorded: true, queued: true };
  }

  /**
   * The admin queue, ranked by how many people were affected — not by
   * recency. Sorting by time would put one loud user above fifty quiet ones.
   */
  async queue() {
    const issues = await this.issues.find({
      where: { resolved_at: undefined },
      order: { occurrence_count: 'DESC', last_seen_at: 'DESC' },
      take: 50,
    });

    // Which document produced the flagged answer. Without this the queue says
    // "this was unhelpful" and the admin has no idea which file to replace.
    return Promise.all(
      issues.map(async (issue) => {
        const sources = issue.message_id
          ? await this.sources.find({ where: { message_id: issue.message_id }, take: 3 })
          : [];
        return {
          id: issue.id,
          type: issue.type,
          question: issue.question_text,
          occurrences: issue.occurrence_count,
          category: issue.category_id,
          userState: issue.user_state,
          comment: issue.comment,
          lastSeen: issue.last_seen_at,
          sourceDocumentIds: sources.map((s) => s.document_id).filter(Boolean),
        };
      }),
    );
  }

  /** Handled items leave the active queue, so it stays meaningful. */
  async resolve(id: string, documentId?: string) {
    await this.issues.update(id, {
      resolved_at: new Date(),
      resolved_by_document_id: documentId ?? null,
    });
    return { resolved: id };
  }
}
