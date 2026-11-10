// A `var()` in a style value is substituted from the `:root` table while the payload is built

import {
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  registerRootVariables,
  setProp,
} from '@symbiote-native/engine';

import type { IMediaEnvironment } from '../../../src/style-registry/media-evaluate';
import {
  applyMediaEnvironment,
  resetMediaSubscriptions,
} from '../../../src/style-registry/media-subscriptions';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function payloadOf(style: Record<string, unknown>) {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

function declareRoot(variables: Record<string, string>): void {
  clearGlobalStyles();
  registerRootVariables(
    Object.entries(variables).map(([name, value]) => ({ name, value })),
  );
}

describe('a var() against the :root table, in the real engine', () => {
  it('paints a colour from a declared variable', () => {
    declareRoot({ '--bg': '#ff0000' });
    expect(payloadOf({ backgroundColor: 'var(--bg)' }).backgroundColor).toBe(
      0xff_ff_00_00,
    );
  });

  it('uses the fallback when nothing declares the variable', () => {
    declareRoot({});
    expect(
      payloadOf({ backgroundColor: 'var(--none, #00ff00)' }).backgroundColor,
    ).toBe(0xff_00_ff_00);
  });

  it('leaves the property unset when the value is invalid at computed-value time', () => {
    declareRoot({});
    expect('backgroundColor' in payloadOf({ backgroundColor: 'var(--none)' })).toBe(
      false,
    );
  });

  it('turns a substituted length into a number', () => {
    declareRoot({ '--gap': '8px' });
    expect(payloadOf({ margin: 'var(--gap)' }).margin).toBe(8);
  });

  it('keeps a value without var() untouched', () => {
    declareRoot({ '--bg': '#ff0000' });
    expect(payloadOf({ margin: 4 }).margin).toBe(4);
  });

  it('turns a substituted rem length into pixels at the root font size', () => {
    declareRoot({ '--gap': '1.5rem' });
    expect(payloadOf({ margin: 'var(--gap)' }).margin).toBe(24);
  });

  it('evaluates a calc() over substituted lengths', () => {
    declareRoot({ '--gap': '8px' });
    expect(
      payloadOf({ width: 'calc(var(--gap) * 2 + 0.25rem)' }).width,
    ).toBe(20);
  });

  it('evaluates a math function over substituted lengths', () => {
    declareRoot({ '--gap': '8px', '--cap': '10px' });
    expect(payloadOf({ width: 'min(var(--gap) * 2, var(--cap))' }).width).toBe(10);
    expect(payloadOf({ height: 'clamp(4px, var(--gap), 6px)' }).height).toBe(6);
  });

  it('evaluates a product of lengths divided back to a length', () => {
    declareRoot({ '--gap': '8px' });
    expect(payloadOf({ width: 'calc(var(--gap) * 3px / 6px)' }).width).toBe(4);
  });

  it('leaves the property unset for a math function of mixed dimensions', () => {
    declareRoot({ '--gap': '8px' });
    expect('width' in payloadOf({ width: 'min(var(--gap), 1s)' })).toBe(false);
  });

  it('splits a padding with several components into its four sides', () => {
    declareRoot({ '--pad': '8px' });
    const payload = payloadOf({ padding: 'var(--pad) 16px' });
    expect(payload.paddingTop).toBe(8);
    expect(payload.paddingRight).toBe(16);
    expect(payload.paddingBottom).toBe(8);
    expect(payload.paddingLeft).toBe(16);
    expect('padding' in payload).toBe(false);
  });

  it('keeps the one-key form when the shorthand resolves to one value', () => {
    declareRoot({ '--pad': '8px' });
    expect(payloadOf({ padding: 'var(--pad)' }).padding).toBe(8);
  });

  it('splits a border radius, a gap and a flex', () => {
    declareRoot({ '--r': '4px', '--g': '6px' });
    const payload = payloadOf({
      borderRadius: 'var(--r) 8px',
      gap: 'var(--g) 12px',
      flex: '1 0 var(--g)',
    });
    expect(payload.borderTopLeftRadius).toBe(4);
    expect(payload.borderTopRightRadius).toBe(8);
    expect(payload.rowGap).toBe(6);
    expect(payload.columnGap).toBe(12);
    expect(payload.flexGrow).toBe(1);
    expect(payload.flexShrink).toBe(0);
    expect(payload.flexBasis).toBe(6);
  });

  it('leaves a shorthand unset when RN cannot express it', () => {
    declareRoot({ '--x': 'hidden' });
    expect('overflow' in payloadOf({ overflow: 'var(--x) scroll' })).toBe(false);
  });

  it('keeps a numeric font weight as the string RN takes', () => {
    declareRoot({ '--weight': '700' });
    expect(payloadOf({ fontWeight: 'var(--weight)' }).fontWeight).toBe('700');
  });

  it('keeps a calc() over percentages as a percentage', () => {
    declareRoot({ '--half': '50%' });
    expect(payloadOf({ width: 'calc(var(--half) + 25%)' }).width).toBe('75%');
  });

  it('leaves the property unset for a calc() mixing a percentage with a length', () => {
    declareRoot({ '--gap': '8px' });
    expect('width' in payloadOf({ width: 'calc(100% - var(--gap))' })).toBe(
      false,
    );
  });
});

// The payload holds objects in key order of its own, so a comparison sorts the keys first
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, withSortedKeys(entry)]),
  );
}

describe('a var() inside a shadow, a transform or a filter', () => {
  it('parses a substituted box shadow into the list RN paints', () => {
    declareRoot({ '--c': '#ff0000', '--blur': '4px' });
    const { boxShadow } = payloadOf({
      boxShadow: '1px 2px var(--blur) var(--c), inset 0 0 3px blue',
    });
    expect(withSortedKeys(boxShadow)).toEqual(
      withSortedKeys([
        { offsetX: 1, offsetY: 2, blurRadius: 4, color: 0xff_ff_00_00 },
        { offsetX: 0, offsetY: 0, blurRadius: 3, color: 0xff_00_00_ff, inset: true },
      ]),
    );
  });

  it('leaves a substituted box shadow empty when a length is invalid', () => {
    declareRoot({ '--x': '3em' });
    expect(payloadOf({ boxShadow: 'var(--x) 2px red' }).boxShadow).toEqual([]);
  });

  it('parses a substituted transform into the steps RN applies', () => {
    declareRoot({ '--d': '10px', '--a': '45deg' });
    expect(
      payloadOf({ transform: 'translateX(var(--d)) rotate(var(--a)) scale(2)' })
        .transform,
    ).toEqual([{ translateX: 10 }, { rotate: '45deg' }, { scale: 2 }]);
  });

  it('parses a substituted filter into the functions RN applies', () => {
    declareRoot({ '--b': '4px' });
    const { filter } = payloadOf({
      filter: 'blur(var(--b)) opacity(50%) drop-shadow(1px 2px 3px red)',
    });
    expect(withSortedKeys(filter)).toEqual(
      withSortedKeys([
        { blur: 4 },
        { opacity: 0.5 },
        { dropShadow: { offsetX: 1, offsetY: 2, standardDeviation: 3, color: 0xff_ff_00_00 } },
      ]),
    );
  });
});

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

describe('a node reading a :root variable when the table changes', () => {
  it('repaints on a flip and leaves a node reading another variable alone', () => {
    clearGlobalStyles();
    resetMediaSubscriptions();
    applyMediaEnvironment(environmentIn('light'));
    registerRootVariables(
      [
        { name: '--bg', value: '#ffffff' },
        { name: '--bg', value: '#000000', cond: 0 },
        { name: '--gap', value: '8px' },
      ],
      [['=', 'prefers-color-scheme', 'dark']],
    );
    const surface = createSurface(ROOT_TAG);
    const themed = createElement('RCTView', false);
    setProp(themed, 'style', { backgroundColor: 'var(--bg)' });
    const spaced = createElement('RCTView', false);
    setProp(spaced, 'style', { margin: 'var(--gap)' });
    surface.appendChild(themed);
    surface.appendChild(spaced);
    surface.commit();
    mounted();
    expect(committedPayloadOf(themed)?.backgroundColor).toBe(0xff_ff_ff_ff);
    readSurfaceTelemetry(ROOT_TAG);

    applyMediaEnvironment(environmentIn('dark'));
    surface.commit();
    mounted();
    expect(committedPayloadOf(themed)?.backgroundColor).toBe(0xff_00_00_00);
    expect(committedPayloadOf(spaced)?.margin).toBe(8);
    expect(readSurfaceTelemetry(ROOT_TAG)?.nodesCloned).toBe(2);
  });
});

report();
