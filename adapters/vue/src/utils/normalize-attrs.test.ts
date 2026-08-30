import { describe, expect, it } from 'vitest';
import { normalizeVueAttrKey, normalizeVueAttrs } from './normalize-attrs';

describe('normalizeVueAttrKey', () => {
  it('camelCases a kebab key and leaves a camel one alone', () => {
    expect(normalizeVueAttrKey('content-container-style')).toBe(
      'contentContainerStyle',
    );
    expect(normalizeVueAttrKey('onPress')).toBe('onPress');
  });

  it('keeps aria-* and data-* kebab', () => {
    expect(normalizeVueAttrKey('aria-label')).toBe('aria-label');
    expect(normalizeVueAttrKey('data-test-id')).toBe('data-test-id');
  });
});

describe('normalizeVueAttrs', () => {
  it('folds kebab keys and carries the values across', () => {
    expect(normalizeVueAttrs({ 'hit-slop': 4, onPress: 1 })).toEqual({
      hitSlop: 4,
      onPress: 1,
    });
  });

  // The whole reason this function stopped returning its input. Vue wraps setupContext.attrs in a
  // Proxy whose get trap calls track() BEFORE every value, in production too, so handing the input
  // back left callers reading through that trap for the rest of the render. Every SFC/TSX bag is
  // already camel, so the early return fired on exactly the bags that are hottest.
  it('returns a plain copy even when no key needed converting', () => {
    const attrs = { onPress: 1, testID: 'x' };
    expect(normalizeVueAttrs(attrs)).not.toBe(attrs);
    expect(normalizeVueAttrs(attrs)).toEqual(attrs);
  });

  it('leaves the source untouched by later reads of the result', () => {
    let reads = 0;
    const source = new Proxy(
      { onPress: 1, testID: 'x', style: {} },
      {
        get(target, key: string) {
          reads += 1;
          return target[key];
        },
      },
    );

    const attrs = normalizeVueAttrs(source);
    const afterCopy = reads;
    void attrs.onPress;
    void attrs.testID;
    void attrs.style;

    expect(reads).toBe(afterCopy);
  });
});
