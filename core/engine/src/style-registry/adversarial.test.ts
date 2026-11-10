// Attacks on the style registry: hostile class names, hostile container sizes and a hostile window

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { resetContainerTracking } from '../container-tracking';
import { Dimensions } from '../react-native-host';
import { deliverDirect } from '../events/delivery';
import { resetMediaEnvironment } from '../media-environment';
import { resetMutationBuffer } from '../mutation-buffer';
import { appendChild, createElement, routeProp, type ISymbioteNode } from '../node';
import { getPublishedStyle } from '../node-style';
import { createSurface } from '../surface';
import { clearGlobalStyles, registerRules } from './index';
import { releaseMediaNode, resetMediaSubscriptions } from './media-subscriptions';

const SLOW_MS = 2_000;
const NODES = 5_000;

function windowAt(width: number): void {
  Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
}

function classStyleOf(node: ISymbioteNode): unknown {
  return getPublishedStyle(node)[0];
}

function layOut(container: ISymbioteNode, layout: unknown): void {
  deliverDirect(container, 'layout', { layout });
}

function mountCard(
  containerStyle: Record<string, unknown> = { containerType: 'size', width: 300, height: 80 },
): {
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

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  resetMutationBuffer();
  installRecordingFabric();
  windowAt(400);
});

afterEach(() => {
  clearGlobalStyles();
  resetContainerTracking();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('a class named like a member of `Object.prototype`', () => {
  beforeEach(() => {
    registerRules(
      [{ tokens: ['constructor'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } }],
      [],
    );
  });

  it('styles the node of the class the rule names and no other', () => {
    const named = createElement('RCTView');
    routeProp(named, 'class', 'constructor');
    const other = createElement('RCTView');
    routeProp(other, 'class', 'toString');

    expect(classStyleOf(named)).toEqual({ padding: 4 });
    expect(classStyleOf(other)).toEqual({});
  });

  it.each(['__proto__', 'hasOwnProperty', 'valueOf', 'prototype'])(
    'reads `%s` as a class nobody ruled',
    name => {
      const node = createElement('RCTView');
      routeProp(node, 'class', name);

      expect(classStyleOf(node)).toEqual({});
      expect(Object.keys(Object.prototype)).toEqual([]);
    },
  );
});

describe('a hostile class value', () => {
  beforeEach(() => {
    registerRules(
      [{ tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } }],
      [],
    );
  });

  it('resolves a class of thirty thousand tokens in bounded time', () => {
    const node = createElement('RCTView');

    const spent = elapsedMs(() => routeProp(node, 'class', `card ${'x '.repeat(30_000)}`));

    expect(spent).toBeLessThan(SLOW_MS);
    expect(classStyleOf(node)).toEqual({ padding: 4 });
  });

  it.each([
    ['empty', ''],
    ['blank', ' \t\n '],
    ['one long token', 'a'.repeat(1_000_000)],
    ['a null character', 'card\u0000x'],
    ['unpaired surrogate', '\uD800card'],
  ])('does not throw for a class that is %s', (_name, value) => {
    const node = createElement('RCTView');

    expect(() => routeProp(node, 'class', value)).not.toThrow();
  });
});

describe('a module evaluated again and again by hot reload', () => {
  it('keeps a class cheap and unchanged after two thousand registrations of the same rules', () => {
    const rules = [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 8 }, cond: 0 },
    ] as const;
    for (let round = 0; round < 2_000; round += 1) registerRules(rules, [['>=', 'width', 600]]);
    const node = createElement('RCTView');

    const spent = elapsedMs(() => routeProp(node, 'class', 'card'));

    expect(spent).toBeLessThan(SLOW_MS);
    expect(classStyleOf(node)).toEqual({ padding: 4 });
    windowAt(700);
    expect(classStyleOf(node)).toEqual({ padding: 8 });
  });
});

describe('a stale build with a condition the table lacks', () => {
  it('does not apply a rule whose condition id is out of range', () => {
    registerRules(
      [
        { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
        { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 8 }, cond: 99 },
      ],
      [],
    );
    const node = createElement('RCTView');

    expect(() => routeProp(node, 'class', 'card')).not.toThrow();
    expect(classStyleOf(node)).toEqual({ padding: 4 });
  });
});

describe('a hostile container size', () => {
  beforeEach(() => {
    registerRules(
      [
        { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
        { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 16 }, cond: 0 },
      ],
      [['@', null, ['>=', 'width', 400]]],
    );
  });

  it.each([
    ['NaN', { width: Number.NaN, height: Number.NaN }],
    ['negative', { width: -500, height: -500 }],
    ['text', { width: '500', height: '80' }],
    ['null', null],
    ['an empty object', {}],
    ['a number', 500],
  ])('keeps the plain style and does not throw for a layout of %s', (_name, layout) => {
    const { container, card } = mountCard();

    expect(() => layOut(container, layout)).not.toThrow();
    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('answers a boolean for an infinite container without throwing', () => {
    const { container, card } = mountCard();

    expect(() => layOut(container, { width: Number.POSITIVE_INFINITY, height: 80 })).not.toThrow();
    expect(classStyleOf(card)).toEqual({ padding: 16 });
  });
});

describe('a hostile window under many subscribed nodes', () => {
  beforeEach(() => {
    registerRules(
      [
        { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
        { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 8 }, cond: 0 },
      ],
      [['>=', 'width', 600]],
    );
  });

  it('restyles five thousand nodes on one flip in bounded time', () => {
    const nodes = Array.from({ length: NODES }, () => {
      const node = createElement('RCTView');
      routeProp(node, 'class', 'card');
      return node;
    });

    const spent = elapsedMs(() => windowAt(700));

    expect(spent).toBeLessThan(SLOW_MS);
    expect(nodes.every(node => (classStyleOf(node) as { padding?: number }).padding === 8)).toBe(true);
  });

  it('leaves five thousand released nodes alone on a flip', () => {
    const nodes = Array.from({ length: NODES }, () => {
      const node = createElement('RCTView');
      routeProp(node, 'class', 'card');
      releaseMediaNode(node);
      return node;
    });

    const spent = elapsedMs(() => windowAt(700));

    expect(spent).toBeLessThan(SLOW_MS);
    expect(nodes.every(node => (classStyleOf(node) as { padding?: number }).padding === 4)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1])(
    'keeps a consistent answer after a window width of %s',
    width => {
      const node = createElement('RCTView');
      routeProp(node, 'class', 'card');

      expect(() => windowAt(width)).not.toThrow();
      windowAt(700);
      expect(classStyleOf(node)).toEqual({ padding: 8 });
      windowAt(300);
      expect(classStyleOf(node)).toEqual({ padding: 4 });
    },
  );
});
