import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { ConfirmUploadDto, ListDocumentsDto, RequestUploadDto } from './dto/create-document.dto';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * Every route here is an admin route: these upload to the shared knowledge
 * base and delete from it. They were unguarded while the POC only ran on
 * localhost.
 */
@UseGuards(AdminGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Returns a presigned URL. The browser PUTs the file to it directly. */
  @Post('upload-url')
  requestUpload(@Body() dto: RequestUploadDto) {
    return this.documents.requestUpload(dto);
  }

  /** Called once the browser's upload finishes. This is what queues the job. */
  @Post('confirm')
  confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.documents.confirmUpload(dto.documentId);
  }

  @Get()
  list(@Query() query: ListDocumentsDto) {
    return this.documents.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documents.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }
}
