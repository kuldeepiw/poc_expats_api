import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerIssue, Message, MessageSource } from '../../database/entities';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnswerIssue, Message, MessageSource])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
