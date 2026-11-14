import { describe, expect, it } from 'vitest';

import { resolveStructuredStyle } from './structured-style';

describe('resolveStructuredStyle', () => {
  it('leaves a text holding a var() raw, for the engine to parse after substituting', () => {
    const style = { transform: 'translateX(var(--d))', filter: 'blur(var(--b))' };
    expect(resolveStructuredStyle(style)).toBe(style);
  });

  it('still resolves a text without a var()', () => {
    const resolved = resolveStructuredStyle({ transform: 'translateX(4px)' });
    expect(resolved).toEqual({ transform: [{ translateX: 4 }] });
  });

  it('resolves the other keys of a style that holds a var() in one of them', () => {
    const resolved = resolveStructuredStyle({
      transform: 'translateX(var(--d))',
      filter: 'blur(2px)',
    });
    expect(resolved).toEqual({
      transform: 'translateX(var(--d))',
      filter: [{ blur: 2 }],
    });
  });
});
