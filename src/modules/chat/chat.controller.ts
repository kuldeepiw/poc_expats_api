import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('messages')
  send(@CurrentUser() user: AuthedUser, @Body() dto: SendMessageDto) {
    return this.chat.send(user, dto);
  }

  /**
   * The same pipeline, streamed.
   *
   * Streaming is designed in rather than added later because retrofitting it
   * is an interface rewrite. What the user notices is time-to-first-word, not
   * total time — a status line during retrieval makes four seconds feel
   * shorter than a spinner makes two.
   *
   * Events: `status` while working, then `answer`, then `done`.
   */
  @Post('messages/stream')
  async stream(
    @CurrentUser() user: AuthedUser,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send('status', { stage: 'searching', label: 'Searching the document library…' });

      const reply = await this.chat.send(user, dto, (stage, label) =>
        send('status', { stage, label }),
      );

      send('answer', reply);
      send('done', { conversationId: reply.conversationId });
    } catch (error) {
      // A raw exception must never reach the user.
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      send('error', { message });
    } finally {
      res.end();
    }
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthedUser) {
    return this.chat.listConversations(user.id);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.chat.getConversation(user.id, id);
  }
}
