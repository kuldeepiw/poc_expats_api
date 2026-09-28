import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin.guard';

/** Shared-key gated in the POC; a role claim from Firebase in the real product. */
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('unanswered')
  unanswered() {
    return this.admin.unansweredQuestions();
  }

  @Get('categories')
  categories() {
    return this.admin.questionsByCategory();
  }
}
