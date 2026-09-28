import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestUploadDto {
  @IsString() @MaxLength(255) filename: string;
  @IsString() @MaxLength(120) contentType: string;
  @IsString() @MaxLength(200) title: string;

  /** Immigration, tax, healthcare, daily living — a taxonomy key. */
  @IsString() @MaxLength(60) categoryId: string;

  /** Omit for documents that apply nationally. */
  @IsOptional() @IsString() @MaxLength(60) stateScope?: string;

  @IsOptional() @IsDateString() documentDate?: string;

  /** false marks the client's own practical notes rather than a government PDF. */
  @IsOptional() @IsBoolean() isOfficial?: boolean;
}

export class ConfirmUploadDto {
  @IsString() documentId: string;
}

export class ListDocumentsDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(['queued', 'processing', 'ready', 'failed']) status?: string;
}
