import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/** Stable validation codes; the client chooses the language and field labels. */
export function validationException(errors: ValidationError[]) {
  const details: { field: string; code: string }[] = [];
  const messages: string[] = [];
  function flatten(items: ValidationError[], prefix = '') {
    for (const error of items) {
      const field = prefix ? `${prefix}.${error.property}` : error.property;
      for (const [code, text] of Object.entries(error.constraints ?? {})) {
        details.push({ field, code });
        messages.push(text);
      }
      flatten(error.children ?? [], field);
    }
  }
  flatten(errors);
  return new BadRequestException({ code: 'VALIDATION_FAILED', message: messages, details });
}
