// The colour props of the pull-to-refresh views: RN's generated view config runs each through
// `processColor` (`colors` through `processColorArray`), so native gets integers and a
// `PlatformColor` next to them untouched

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const PLATFORM_COLOR = { semantic: ['label'] };
// The arm decides the sign (unsigned on iOS, signed on Android), the bits are the same
const BLUE = 0xff_00_00_ff | 0;

function commitTo(
  view: string,
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(view, false, 'view');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error(`${view} committed no payload`);
  return payload;
}

function bitsOf(value: unknown): number {
  return Number(value) | 0;
}

describe('the colour props of PullToRefreshView', () => {
  it('resolves tintColor and titleColor to integers', () => {
    const payload = commitTo('PullToRefreshView', {
      tintColor: '#0000ff',
      titleColor: '#0000ff',
    });

    expect(bitsOf(payload.tintColor)).toBe(BLUE);
    expect(bitsOf(payload.titleColor)).toBe(BLUE);
  });

  it('leaves a PlatformColor titleColor as it is', () => {
    const payload = commitTo('PullToRefreshView', {
      titleColor: PLATFORM_COLOR,
    });

    expect(payload.titleColor).toEqual(PLATFORM_COLOR);
  });
});

describe('the colour props of AndroidSwipeRefreshLayout', () => {
  it('resolves progressBackgroundColor to an integer', () => {
    const payload = commitTo('AndroidSwipeRefreshLayout', {
      progressBackgroundColor: '#0000ff',
    });

    expect(bitsOf(payload.progressBackgroundColor)).toBe(BLUE);
  });

  it('resolves every entry of colors and keeps a PlatformColor', () => {
    const payload = commitTo('AndroidSwipeRefreshLayout', {
      colors: ['#0000ff', PLATFORM_COLOR],
    });
    const colors = payload.colors;

    expect(Array.isArray(colors)).toBe(true);
    expect(bitsOf(Array.isArray(colors) ? colors[0] : undefined)).toBe(BLUE);
    expect(Array.isArray(colors) ? colors[1] : undefined).toEqual(
      PLATFORM_COLOR,
    );
  });
});

report();
