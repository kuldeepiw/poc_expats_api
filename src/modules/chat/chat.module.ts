import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AnswerIssue, Conversation, Message, MessageSource, UserUpload,
} from '../../database/entities';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, MessageSource, AnswerIssue, UserUpload]),
    RagModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
