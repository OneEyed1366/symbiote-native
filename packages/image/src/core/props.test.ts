import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetDeprecationWarnings,
  resolveContentFit,
  resolveContentPosition,
  resolveSfEffect,
  resolveTransition,
} from './props';

afterEach(() => {
  resetDeprecationWarnings();
  vi.restoreAllMocks();
});

describe('resolveContentFit', () => {
  it('keeps an explicit `contentFit` over `resizeMode`', () => {
    expect(resolveContentFit('fill', 'contain')).toBe('fill');
  });

  it('maps the React Native resize modes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveContentFit(undefined, 'stretch')).toBe('fill');
    expect(resolveContentFit(undefined, 'center')).toBe('scale-down');
    expect(resolveContentFit(undefined, 'repeat')).toBe('cover');
    expect(resolveContentFit(undefined, 'contain')).toBe('contain');
  });

  it('defaults to `cover`, and to `contain` for an SF Symbol', () => {
    expect(resolveContentFit()).toBe('cover');
    expect(resolveContentFit(undefined, undefined, true)).toBe('contain');
  });

  it('warns about `resizeMode` once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resolveContentFit(undefined, 'contain');
    resolveContentFit(undefined, 'contain');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveContentPosition', () => {
  it('expands a keyword into the two-edge object native reads', () => {
    expect(resolveContentPosition('top left')).toEqual({ top: 0, left: 0 });
    expect(resolveContentPosition('center')).toEqual({
      top: '50%',
      left: '50%',
    });
  });

  it('centers when nothing is given and passes an object through', () => {
    expect(resolveContentPosition()).toEqual({ top: '50%', left: '50%' });
    expect(resolveContentPosition({ bottom: 4, right: 2 })).toEqual({
      bottom: 4,
      right: 2,
    });
  });
});

describe('resolveSfEffect', () => {
  it('normalizes a name, an object and a list into objects', () => {
    expect(resolveSfEffect('bounce')).toEqual([{ effect: 'bounce' }]);
    expect(resolveSfEffect({ effect: 'pulse', repeat: 2 })).toEqual([
      { effect: 'pulse', repeat: 2 },
    ]);
    expect(resolveSfEffect(['scale', { effect: 'wiggle' }])).toEqual([
      { effect: 'scale' },
      { effect: 'wiggle' },
    ]);
  });

  it('maps nothing to null', () => {
    expect(resolveSfEffect(null)).toBeNull();
    expect(resolveSfEffect(undefined)).toBeNull();
  });
});

describe('resolveTransition', () => {
  it('turns a number into a duration', () => {
    expect(resolveTransition(200)).toEqual({ duration: 200 });
  });

  it('falls back to `fadeDuration` and warns about it once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveTransition(undefined, 300)).toEqual({ duration: 300 });
    resolveTransition(undefined, 300);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('passes an object through and maps nothing to null', () => {
    expect(resolveTransition({ effect: 'cross-dissolve' })).toEqual({
      effect: 'cross-dissolve',
    });
    expect(resolveTransition()).toBeNull();
  });
});
