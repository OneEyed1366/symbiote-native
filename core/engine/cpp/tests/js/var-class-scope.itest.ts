// Readers of `var()` below a class that declares `--x`, also across an `@media` flip

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { IMediaEnvironment } from '../../../src/style-registry/media-evaluate';
import {
  applyMediaEnvironment,
  resetMediaSubscriptions,
} from '../../../src/style-registry/media-subscriptions';

import { describe, expect, it, mounted, report } from './harness';

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

function classed(className: string): ISymbioteNode {
  const node = createElement('RCTView', false);
  routeProp(node, 'class', className);
  return node;
}

function paintOf(node: ISymbioteNode): unknown {
  return committedPayloadOf(node)?.backgroundColor;
}

function rule(
  tokens: string[],
  style: Record<string, unknown>,
  order: number,
  cond?: number,
) {
  return { tokens, specificity: [0, 1, 0] as const, order, style, cond };
}

describe('a var() against a class declaration, in the real engine', () => {
  it('paints a descendant from a --x its ancestor got from a class', () => {
    clearGlobalStyles();
    resetMediaSubscriptions();
    applyMediaEnvironment(environmentIn('light'));
    registerRules([
      rule(['theme'], { '--accent': '#00ff00' }, 0),
      rule(['swatch'], { backgroundColor: 'var(--accent)' }, 1),
    ]);
    const theme = classed('theme');
    const swatch = classed('swatch');
    appendChild(theme, swatch);
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(theme);
    surface.commit();
    mounted();

    expect(paintOf(swatch)).toBe(0xff_00_ff_00);
  });

  it('repaints the descendant when an @media flip changes the ancestor declaration', () => {
    clearGlobalStyles();
    resetMediaSubscriptions();
    applyMediaEnvironment(environmentIn('light'));
    registerRules(
      [
        rule(['theme'], { '--accent': '#00ff00' }, 0),
        rule(['theme'], { '--accent': '#0000ff' }, 1, 0),
        rule(['swatch'], { backgroundColor: 'var(--accent)' }, 2),
      ],
      [['=', 'prefers-color-scheme', 'dark']],
    );
    const theme = classed('theme');
    const swatch = classed('swatch');
    appendChild(theme, swatch);
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(theme);
    surface.commit();
    mounted();
    expect(paintOf(swatch)).toBe(0xff_00_ff_00);

    applyMediaEnvironment(environmentIn('dark'));
    surface.commit();
    mounted();
    expect(paintOf(swatch)).toBe(0xff_00_00_ff);

    applyMediaEnvironment(environmentIn('light'));
    surface.commit();
    mounted();
    expect(paintOf(swatch)).toBe(0xff_00_ff_00);
  });
});

report();
