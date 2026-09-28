import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthedUser {
  id: string;
  email: string;
  state: string | null;
}

/**
 * The user always comes from the verified token, never from the request body.
 * Anything the browser sends can be edited.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthedUser =>
    context.switchToHttp().getRequest().user,
);
