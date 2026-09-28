import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestUserUploadDto {
  @IsString() @MaxLength(255) filename: string;
  @IsString() @MaxLength(120) contentType: string;

  /** Medical files get a different prompt and a Spanish doctor summary. */
  @IsIn(['medical', 'general']) documentKind: 'medical' | 'general';

  /** Links the upload to a chat thread, so the user can ask about it after. */
  @IsOptional() @IsUUID() conversationId?: string;
}

export class ConfirmUserUploadDto {
  @IsUUID() uploadId: string;
}
