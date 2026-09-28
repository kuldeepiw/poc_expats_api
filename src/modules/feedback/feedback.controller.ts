import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/decorators/current-user.decorator';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  submit(@CurrentUser() user: AuthedUser, @Body() dto: SubmitFeedbackDto) {
    return this.feedback.submit(user.id, dto);
  }

  /** Admin queue — shared-key gated in the POC, a role claim in production. */
  @UseGuards(AdminGuard)
  @Get('queue')
  queue() {
    return this.feedback.queue();
  }

  @UseGuards(AdminGuard)
  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() body: { documentId?: string }) {
    return this.feedback.resolve(id, body?.documentId);
  }
}
