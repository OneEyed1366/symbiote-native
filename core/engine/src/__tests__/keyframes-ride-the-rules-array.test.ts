import { afterEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, keyframesNamed, registerRules } from '../index';

const FADE = { from: { opacity: 0 }, to: { opacity: 1 } };

afterEach(() => clearGlobalStyles());

function carrier(style: Record<string, object>) {
  return { tokens: [], specificity: [0, 0, 0] as const, order: 0, style };
}

describe('a rule with no tokens that carries keyframes', () => {
  it('makes them findable by the name they were declared under', () => {
    registerRules([carrier({ '@keyframes fade': FADE })]);

    expect(keyframesNamed('fade')).toBe(FADE);
  });

  it('registers each of several', () => {
    const spin = { to: { transform: 'rotate(1turn)' } };
    registerRules([
      carrier({ '@keyframes fade': FADE, '@keyframes spin': spin }),
    ]);

    expect([keyframesNamed('fade'), keyframesNamed('spin')]).toEqual([
      FADE,
      spin,
    ]);
  });

  it('is not a rule for any element', () => {
    registerRules([carrier({ '@keyframes fade': FADE })]);

    expect(keyframesNamed('@keyframes fade')).toBeUndefined();
  });

  it('answers no keyframes for a name nothing declared', () => {
    registerRules([carrier({ '@keyframes fade': FADE })]);

    expect(keyframesNamed('spin')).toBeUndefined();
  });

  it('is forgotten with the rest of the styles', () => {
    registerRules([carrier({ '@keyframes fade': FADE })]);

    clearGlobalStyles();

    expect(keyframesNamed('fade')).toBeUndefined();
  });

  it('lets a later file take over a name', () => {
    const slow = { from: { opacity: 0.5 }, to: { opacity: 1 } };
    registerRules([carrier({ '@keyframes fade': FADE })]);
    registerRules([carrier({ '@keyframes fade': slow })]);

    expect(keyframesNamed('fade')).toBe(slow);
  });
});
