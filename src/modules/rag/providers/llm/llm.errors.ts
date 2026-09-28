/**
 * The model service could not be reached, or gave up.
 *
 * Distinct from "the library has no answer": that is the product working
 * correctly and the user should be told plainly. This is our problem, and the
 * user should be told to try again — never shown a stack trace or a 500.
 */
export class LlmUnavailableError extends Error {
  readonly userMessage =
    'The assistant is temporarily unavailable. Your question was not lost — please try again in a moment.';

  constructor(detail: string) {
    super(detail);
    this.name = 'LlmUnavailableError';
  }
}
