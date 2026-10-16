// The engine's `invariant` is the one RN ships, so a failure is the same exception
import { describe, expect, it } from 'vitest';
import upstream from 'invariant';
import { invariant } from './invariant';

describe('invariant', () => {
  it('is the package React Native uses', () => {
    expect(invariant).toBe(upstream);
  });

  it('throws an Invariant Violation carrying the message', () => {
    expect(() => invariant(false, 'bad state')).toThrow(
      expect.objectContaining({
        name: 'Invariant Violation',
        message: 'bad state',
      }),
    );
  });

  it('passes silently on a true condition', () => {
    expect(() => invariant(true, 'unused')).not.toThrow();
  });
});
