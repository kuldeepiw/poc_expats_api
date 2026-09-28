import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitFeedbackDto {
  @IsUUID() messageId: string;
  @IsBoolean() isHelpful: boolean;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
