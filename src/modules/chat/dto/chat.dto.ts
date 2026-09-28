import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * The whole request contract.
 *
 * Note what is absent: user id, state, category, conversation history and the
 * rate-limit count. All of those the backend derives — anything the browser
 * sends can be edited, and history supplied by the client is a prompt
 * injection vector.
 */
export class SendMessageDto {
  @IsOptional() @IsUUID() conversationId?: string;

  @IsString() @MinLength(2) @MaxLength(2000) message: string;

  /** Only when the user explicitly chose a process card. */
  @IsOptional() @IsString() @MaxLength(60) processKey?: string;

  /** Only when asking about their own uploaded document. */
  @IsOptional() @IsUUID() uploadId?: string;
}
