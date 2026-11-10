// A container answers an axis only when its own style fixes it, since content must not size it

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { resetContainerTracking } from '../container-tracking';
import { deliverDirect } from '../events/delivery';
import { resetMediaEnvironment } from '../media-environment';
import { resetMutationBuffer } from '../mutation-buffer';
import { appendChild, createElement, routeProp, type ISymbioteNode } from '../node';
import { getPublishedStyle } from '../node-style';
import { createSurface } from '../surface';
import { clearGlobalStyles, registerRules } from './index';
import { resetMediaSubscriptions } from './media-subscriptions';

const WIDE_CARD = 16;
const PLAIN_CARD = 4;

function paddingOf(node: ISymbioteNode): unknown {
  const style: unknown = getPublishedStyle(node)[0];
  return typeof style === 'object' && style !== null ? Reflect.get(style, 'padding') : undefined;
}

function layOut(container: ISymbioteNode, width: number, height = 80): void {
  deliverDirect(container, 'layout', { layout: { x: 0, y: 0, width, height } });
}

function mountCard(containerStyle: Record<string, unknown>): {
  container: ISymbioteNode;
  card: ISymbioteNode;
} {
  const container = createElement('RCTView');
  routeProp(container, 'style', containerStyle);
  const card = createElement('RCTView');
  routeProp(card, 'class', 'card');
  appendChild(container, card);
  const surface = createSurface(1);
  surface.appendChild(container);
  surface.commit();
  return { container, card };
}

function registerCard(condition: unknown): void {
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: PLAIN_CARD } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: WIDE_CARD }, cond: 0 },
    ],
    [condition],
  );
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  resetMutationBuffer();
  installRecordingFabric();
});

afterEach(() => {
  clearGlobalStyles();
  resetContainerTracking();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
  vi.restoreAllMocks();
});

describe('a container whose width depends on its content', () => {
  beforeEach(() => registerCard(['@', null, ['>=', 'width', 400]]));

  it('reads false for a width query, and warns once', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'size' });

    layOut(container, 500);
    layOut(container, 600);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
    expect(warned).toHaveBeenCalledTimes(1);
  });

  it('reads false for an inline-size container with no width too', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'inline-size' });

    layOut(container, 500);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
  });

  it('keeps the leaf false when a `not` sits inside the container query', () => {
    registerCard(['@', null, ['!', ['<', 'width', 400]]]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'size' });

    layOut(container, 500);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
  });

  it.each([
    ['width', { width: 300 }],
    ['flex', { flex: 1 }],
    ['flexGrow', { flexGrow: 1 }],
    ['flexBasis', { flexBasis: 100 }],
    ['aspectRatio', { aspectRatio: 2 }],
  ])('counts `%s` as a definite width', (_name, definite) => {
    const { container, card } = mountCard({ containerType: 'size', height: 80, ...definite });

    layOut(container, 500);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });

  it('asks an inline-size container for a width only', () => {
    const { container, card } = mountCard({ containerType: 'inline-size', width: 300 });

    layOut(container, 500);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});

describe('a container whose height depends on its content', () => {
  beforeEach(() => registerCard(['@', null, ['>=', 'height', 50]]));

  it('reads false for a height query when only the width is fixed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'size', width: 300 });

    layOut(container, 300, 80);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
  });

  it('answers a height query once the height is fixed', () => {
    const { container, card } = mountCard({ containerType: 'size', width: 300, height: 80 });

    layOut(container, 300, 80);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });

  it('reads false for an aspect-ratio query while one axis is open', () => {
    registerCard(['@', null, ['>=', 'aspect-ratio', 1]]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'size', width: 300 });

    layOut(container, 300, 80);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
  });
});

describe('a container whose style fixes the missing axis later', () => {
  it('starts answering from the next layout', () => {
    registerCard(['@', null, ['>=', 'width', 400]]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, card } = mountCard({ containerType: 'size' });
    layOut(container, 500);
    expect(paddingOf(card)).toBe(PLAIN_CARD);

    routeProp(container, 'style', { containerType: 'size', width: 500, height: 80 });

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});
