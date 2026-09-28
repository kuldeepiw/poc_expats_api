import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
  @IsOptional() @IsString() @MaxLength(120) fullName?: string;

  /** Required at first sign-in in the real product: every answer filters on it. */
  @IsOptional() @IsString() @MaxLength(60) state?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class SetStateDto {
  @IsString() @MaxLength(60) state: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
}
