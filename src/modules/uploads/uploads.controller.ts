import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { ConfirmUserUploadDto, RequestUserUploadDto } from './dto/upload.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('upload-url')
  request(@CurrentUser() user: AuthedUser, @Body() dto: RequestUserUploadDto) {
    return this.uploads.requestUpload(user.id, dto);
  }

  @Post('confirm')
  confirm(@CurrentUser() user: AuthedUser, @Body() dto: ConfirmUserUploadDto) {
    return this.uploads.confirmUpload(user.id, dto.uploadId);
  }

  @Get()
  list(@CurrentUser() user: AuthedUser) {
    return this.uploads.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.uploads.findOne(user.id, id);
  }

  /** Users can delete their own file before it expires. */
  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.uploads.remove(user.id, id);
  }
}
