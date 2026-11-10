// A `:root` custom property crosses to the real engine as `OP_SET_GLOBAL_VARIABLE` and follows its
// `@media` condition, read back from native memory with `readGlobalVariable`

import {
  clearGlobalStyles,
  createSurface,
  registerRootVariables,
} from '@symbiote-native/engine';
import type { IMediaEnvironment } from '../../../src/style-registry/media-evaluate';
import {
  applyMediaEnvironment,
  resetMediaSubscriptions,
} from '../../../src/style-registry/media-subscriptions';

import { describe, expect, it, mounted, report } from './harness';

declare const __symbioteEngineNative: {
  readGlobalVariable: (name: string) => string | undefined;
};

const ROOT_TAG = 1;

function environmentIn(scheme: 'light' | 'dark'): IMediaEnvironment {
  return {
    width: 400,
    height: 800,
    resolution: 2,
    orientation: 'portrait',
    'prefers-color-scheme': scheme,
    'prefers-reduced-motion': 'no-preference',
    'prefers-contrast': 'no-preference',
    'prefers-reduced-transparency': 'no-preference',
    platform: 'ios',
    dir: 'ltr',
  };
}

function nativeValueOf(name: string): string | undefined {
  return __symbioteEngineNative.readGlobalVariable(name);
}

describe('a :root variable in the real engine', () => {
  it('reaches native memory at the next commit and follows its condition', () => {
    clearGlobalStyles();
    resetMediaSubscriptions();
    applyMediaEnvironment(environmentIn('light'));
    registerRootVariables(
      [
        { name: '--gap', value: '8px' },
        { name: '--bg', value: '#fff' },
        { name: '--bg', value: '#000', cond: 0 },
        { name: '--dark-only', value: 'on', cond: 0 },
      ],
      [['=', 'prefers-color-scheme', 'dark']],
    );

    const surface = createSurface(ROOT_TAG);
    surface.commit();
    mounted();
    expect(nativeValueOf('--gap')).toBe('8px');
    expect(nativeValueOf('--bg')).toBe('#fff');
    expect(nativeValueOf('--dark-only')).toBe(undefined);

    applyMediaEnvironment(environmentIn('dark'));
    surface.commit();
    expect(nativeValueOf('--bg')).toBe('#000');
    expect(nativeValueOf('--dark-only')).toBe('on');

    applyMediaEnvironment(environmentIn('light'));
    surface.commit();
    expect(nativeValueOf('--bg')).toBe('#fff');
    expect(nativeValueOf('--dark-only')).toBe(undefined);
    expect(nativeValueOf('--gap')).toBe('8px');
  });
});

report();
