import { describe, expect, it } from 'vitest';
import { AuthError } from './errors';

describe('AuthError', () => {
  it('adds a message to invalid_scope', () => {
    const error = new AuthError({ error: 'invalid_scope' });
    expect(error.message).toMatch(/The requested scope is invalid/);
    expect(error.description).toMatch(/The requested scope is invalid/);
  });
});
