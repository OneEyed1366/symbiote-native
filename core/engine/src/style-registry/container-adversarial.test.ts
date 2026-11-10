// Attacks on container tracking: a released consumer, a deep chain, a layout storm and odd names

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { resetContainerTracking } from '../container-tracking';
import { Dimensions } from '../dimensions';
import { deliverDirect } from '../events/delivery';
import { resetMediaEnvironment } from '../media-environment';
import { resetMutationBuffer } from '../mutation-buffer';
import { appendChild, createElement, routeProp, type ISymbioteNode } from '../node';
import { getPublishedStyle } from '../node-style';
import { createSurface } from '../surface';
import { clearGlobalStyles, containerVariantsOf, registerRules, resolveClassName } from './index';
import { conditionIdsOfKey, dependentKeys } from './media-conditions';
import { releaseMediaNode, resetMediaSubscriptions } from './media-subscriptions';
import { registerRootVariables, rootVariableTable } from './root-variables';

const SLOW_MS = 2_000;
const WIDE_CARD = 16;
const PLAIN_CARD = 4;
const FIXED = { width: 300, height: 80 };
const DEPTH = 3_000;
const CONSUMERS = 1_000;
const NAMES = 50_000;
// Far past the 512 entries a class cache holds, so no early entry survives random eviction
const UNIQUE_CLASSES = 5_000;
const CLASS_CACHE_SIZE = 512;

function paddingOf(node: ISymbioteNode): unknown {
  const style: unknown = getPublishedStyle(node)[0];
  return typeof style === 'object' && style !== null ? Reflect.get(style, 'padding') : undefined;
}

function layOut(container: ISymbioteNode, width: number): void {
  deliverDirect(container, 'layout', { layout: { x: 0, y: 0, width, height: 80 } });
}

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

function registerCard(query: unknown): void {
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: PLAIN_CARD } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: WIDE_CARD }, cond: 0 },
    ],
    [query],
  );
}

function makeCard(): ISymbioteNode {
  const card = createElement('RCTView');
  routeProp(card, 'class', 'card');
  return card;
}

function commitUnder(root: ISymbioteNode): void {
  const surface = createSurface(1);
  surface.appendChild(root);
  surface.commit();
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  resetMutationBuffer();
  installRecordingFabric();
  registerCard(['@', null, ['>=', 'width', 400]]);
});

afterEach(() => {
  clearGlobalStyles();
  resetContainerTracking();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('a consumer released before its first commit', () => {
  it('is not restyled when the container is laid out', () => {
    const container = createElement('RCTView');
    routeProp(container, 'style', { containerType: 'size', ...FIXED });
    const card = makeCard();
    appendChild(container, card);
    releaseMediaNode(card);

    commitUnder(container);
    layOut(container, 500);

    expect(paddingOf(card)).toBe(PLAIN_CARD);
  });
});

describe('a container whose width comes from a class and is then unset inline', () => {
  it('reads the class width while the inline style does not mention it', () => {
    registerRules(
      [{ tokens: ['box'], specificity: [0, 1, 0], order: 0, style: { width: 300, height: 80 } }],
      [],
    );
    const container = createElement('RCTView');
    routeProp(container, 'class', 'box');
    routeProp(container, 'style', { containerType: 'size' });
    const card = makeCard();
    appendChild(container, card);
    commitUnder(container);

    layOut(container, 500);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });

  it('keeps the class width when an inline `undefined` mentions it', () => {
    registerRules(
      [{ tokens: ['box'], specificity: [0, 1, 0], order: 0, style: { width: 300, height: 80 } }],
      [],
    );
    const container = createElement('RCTView');
    routeProp(container, 'class', 'box');
    routeProp(container, 'style', { containerType: 'size', width: undefined });
    const card = makeCard();
    appendChild(container, card);
    commitUnder(container);

    layOut(container, 500);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});

describe('a consumer moved under another container after its first commit', () => {
  it('answers to the container it sits in now', () => {
    const root = createElement('RCTView');
    const before = createElement('RCTView');
    const after = createElement('RCTView');
    routeProp(before, 'style', { containerType: 'size', ...FIXED });
    routeProp(after, 'style', { containerType: 'size', ...FIXED });
    const card = makeCard();
    appendChild(before, card);
    appendChild(root, before);
    appendChild(root, after);
    commitUnder(root);

    appendChild(after, card);
    commitUnder(root);
    layOut(before, 300);
    layOut(after, 500);

    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});

describe('a thousand consumers moved under another container in one commit', () => {
  it('answers to the new container in bounded time', () => {
    const root = createElement('RCTView');
    const before = createElement('RCTView');
    const after = createElement('RCTView');
    routeProp(before, 'style', { containerType: 'size', ...FIXED });
    routeProp(after, 'style', { containerType: 'size', ...FIXED });
    const cards = Array.from({ length: CONSUMERS }, makeCard);
    for (const card of cards) appendChild(before, card);
    appendChild(root, before);
    appendChild(root, after);
    commitUnder(root);

    const spent = elapsedMs(() => {
      for (const card of cards) appendChild(after, card);
      commitUnder(root);
    });
    layOut(before, 300);
    layOut(after, 500);

    expect(spent).toBeLessThan(SLOW_MS);
    expect(cards.every(card => paddingOf(card) === WIDE_CARD)).toBe(true);
  });
});

describe('a `:root` variable declared inside an `@container` rule', () => {
  it('never reaches the table, since no container sits above the root', () => {
    registerRootVariables([{ name: '--x', value: '7px', cond: 0 }], [
      ['@', null, ['>=', 'width', 0]],
    ]);

    expect(rootVariableTable().get('--x')).toBe(undefined);
  });

  it('is kept out of the table after a window flip too', () => {
    registerRootVariables([{ name: '--x', value: '7px', cond: 0 }], [
      ['@', null, ['>=', 'width', 0]],
    ]);

    Dimensions.set({ window: { width: 900, height: 800, scale: 2, fontScale: 1 } });

    expect(rootVariableTable().get('--x')).toBe(undefined);
  });
});

describe('a screen that generates a unique class string per row', () => {
  it('does not keep the container variants of every string it ever saw', () => {
    const first = containerVariantsOf('card');
    expect(first).toBeDefined();

    for (let row = 0; row < UNIQUE_CLASSES; row += 1) containerVariantsOf(`card row-${row}`);

    expect(containerVariantsOf('card')).not.toBe(first);
  });
});

describe('unique class strings under a rule that reads a window condition', () => {
  it('keeps the strings a flip must revisit within what the class cache holds', () => {
    registerRules(
      [
        { tokens: ['wide'], specificity: [0, 1, 0], order: 0, style: { padding: PLAIN_CARD } },
        { tokens: ['wide'], specificity: [0, 1, 0], order: 1, style: { padding: WIDE_CARD }, cond: 0 },
      ],
      [['>=', 'width', 600]],
    );

    for (let row = 0; row < UNIQUE_CLASSES; row += 1) resolveClassName(`wide row-${row}`);

    const keys = dependentKeys([...(conditionIdsOfKey(`wide row-${UNIQUE_CLASSES - 1}`) ?? [])]);

    expect(keys.size).toBeGreaterThan(0);
    expect(keys.size).toBeLessThanOrEqual(CLASS_CACHE_SIZE);
  });
});

describe('a deep chain of containers', () => {
  it('commits and answers the nearest one in bounded time', () => {
    const outer = createElement('RCTView');
    routeProp(outer, 'style', { containerType: 'size', ...FIXED });
    let parent = outer;
    for (let level = 0; level < DEPTH; level += 1) {
      const inner = createElement('RCTView');
      routeProp(inner, 'style', { containerType: 'size', ...FIXED });
      appendChild(parent, inner);
      parent = inner;
    }
    const card = makeCard();
    appendChild(parent, card);

    const spent = elapsedMs(() => {
      commitUnder(outer);
      layOut(parent, 500);
    });

    expect(spent).toBeLessThan(SLOW_MS);
    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});

describe('a storm of layouts across the threshold', () => {
  it('restyles a thousand consumers per flip in bounded time and ends on the last width', () => {
    const container = createElement('RCTView');
    routeProp(container, 'style', { containerType: 'size', ...FIXED });
    const cards = Array.from({ length: CONSUMERS }, makeCard);
    for (const card of cards) appendChild(container, card);
    commitUnder(container);

    const spent = elapsedMs(() => {
      for (let round = 0; round < 100; round += 1) layOut(container, round % 2 === 0 ? 500 : 300);
    });

    expect(spent).toBeLessThan(SLOW_MS);
    expect(cards.every(card => paddingOf(card) === PLAIN_CARD)).toBe(true);
  });
});

describe('a container named like a member of `Object.prototype`', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'answers a query for `%s` and for no other name',
    name => {
      registerCard(['@', name, ['>=', 'width', 400]]);
      const container = createElement('RCTView');
      routeProp(container, 'style', { containerType: 'size', containerName: name, ...FIXED });
      const other = createElement('RCTView');
      routeProp(other, 'style', { containerType: 'size', containerName: 'other', ...FIXED });
      const card = makeCard();
      appendChild(other, card);
      appendChild(container, other);
      commitUnder(container);

      layOut(container, 500);
      layOut(other, 100);

      expect(paddingOf(card)).toBe(WIDE_CARD);
    },
  );
});

describe('a container listing fifty thousand names', () => {
  it('still answers a query in bounded time', () => {
    registerCard(['@', 'last', ['>=', 'width', 400]]);
    const names = [...Array.from({ length: NAMES }, (_, at) => `n${at}`), 'last'].join(' ');
    const container = createElement('RCTView');
    routeProp(container, 'style', { containerType: 'size', containerName: names, ...FIXED });
    const card = makeCard();
    appendChild(container, card);

    const spent = elapsedMs(() => {
      commitUnder(container);
      layOut(container, 500);
    });

    expect(spent).toBeLessThan(SLOW_MS);
    expect(paddingOf(card)).toBe(WIDE_CARD);
  });
});
