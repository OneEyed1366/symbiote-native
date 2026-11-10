// A node styled by an `@container` rule follows the layout size of the container above it
// The size arrives as the container's `layout` event, so the whole path runs through the engine

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { resetContainerTracking } from './container-tracking';
import { deliverDirect } from './events/delivery';
import { propOf } from './host-access';
import { resetMediaEnvironment } from './media-environment';
import { resetMediaSubscriptions } from './style-registry/media-subscriptions';
import {
  NO_VALUE,
  OP_SET_CONTAINER_VARIANTS,
  OP_STRIDE,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';
import {
  appendChild,
  createElement,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from './node';
import { getPublishedStyle } from './node-style';
import { clearGlobalStyles, registerRules } from './style-registry';
import { createSurface } from './surface';

function classStyleOf(node: ISymbioteNode): unknown {
  return getPublishedStyle(node)[0];
}

function layOut(container: ISymbioteNode, width: number, height = 80): void {
  deliverDirect(container, 'layout', { layout: { x: 0, y: 0, width, height } });
}

// A container holding a card, committed so the card can find its ancestors
// The container fixes both axes, as a container whose size follows its content answers nothing
function mountCard(containerStyle: Record<string, unknown>) {
  const container = createElement('RCTView');
  routeProp(container, 'style', { width: 300, height: 80, ...containerStyle });
  const card = createElement('RCTView');
  routeProp(card, 'class', 'card');
  appendChild(container, card);
  const surface = createSurface(1);
  surface.appendChild(container);
  surface.commit();
  return { container, card };
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  resetMutationBuffer();
  installRecordingFabric();
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 16 }, cond: 0 },
    ],
    [['@', null, ['>=', 'width', 400]]],
  );
});

afterEach(() => {
  clearGlobalStyles();
  resetContainerTracking();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

// The envelope strings the next batch carries for `OP_SET_CONTAINER_VARIANTS`, `null` for a clear
function shippedEnvelopes(): Array<string | null> {
  const { ops, strings } = takeBatch();
  const envelopes: Array<string | null> = [];
  for (let at = 0; at < ops.length; at += OP_STRIDE) {
    if (ops[at] !== OP_SET_CONTAINER_VARIANTS) continue;
    const id = ops[at + 2] ?? NO_VALUE;
    envelopes.push(id === NO_VALUE ? null : (strings[id] ?? null));
  }
  return envelopes;
}

describe('the container variants a consumer ships to the host', () => {
  it('sends the envelope of its class once the class is set', () => {
    const card = createElement('RCTView');
    routeProp(card, 'class', 'card');

    expect(shippedEnvelopes()).toEqual([
      JSON.stringify([[['@', null, ['>=', 'width', 400]]], [1, { padding: 16 }]]),
    ]);
  });

  it('sends nothing for a class that reads no container condition', () => {
    const plain = createElement('RCTView');
    routeProp(plain, 'class', 'unruled');

    expect(shippedEnvelopes()).toEqual([]);
  });

  it('does not send the same envelope twice for one node', () => {
    const card = createElement('RCTView');
    routeProp(card, 'class', 'card');
    routeProp(card, 'class', 'card');

    expect(shippedEnvelopes()).toHaveLength(1);
  });

  it('clears the variants when the class stops reading container rules', () => {
    const card = createElement('RCTView');
    routeProp(card, 'class', 'card');
    routeProp(card, 'class', 'unruled');

    expect(shippedEnvelopes()).toEqual([
      JSON.stringify([[['@', null, ['>=', 'width', 400]]], [1, { padding: 16 }]]),
      null,
    ]);
  });
});

describe('a node answering to a container', () => {
  it('starts plain while the container has no size', () => {
    const { card } = mountCard({ containerType: 'size' });

    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('takes the container rule once the container is laid out wide enough', () => {
    const { container, card } = mountCard({ containerType: 'size' });

    layOut(container, 500);

    expect(classStyleOf(card)).toEqual({ padding: 16 });
  });

  it('follows the container when it narrows again', () => {
    const { container, card } = mountCard({ containerType: 'inline-size' });
    layOut(container, 500);

    layOut(container, 300);

    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('keeps the standing object when a resize crosses no threshold', () => {
    const { container, card } = mountCard({ containerType: 'size' });
    layOut(container, 500);
    const standing = classStyleOf(card);

    layOut(container, 600);

    expect(classStyleOf(card)).toBe(standing);
  });

  it('ignores the layout of an ancestor that is not a container', () => {
    const { container, card } = mountCard({});

    layOut(container, 500);

    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('stops following a container whose type was cleared', () => {
    const { container, card } = mountCard({ containerType: 'size' });
    layOut(container, 500);

    routeProp(container, 'style', {});

    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('asks Fabric for the layout event of a container, and only of a container', () => {
    const { container, card } = mountCard({ containerType: 'size' });

    expect(propOf(container, 'onLayout')).toBe(true);
    expect(propOf(card, 'onLayout')).toBeUndefined();
  });

  it('keeps the layout flag while the app adds and removes its own listener', () => {
    const { container } = mountCard({ containerType: 'size' });

    routeProp(container, 'onLayout', () => {});
    routeProp(container, 'onLayout', undefined);

    expect(propOf(container, 'onLayout')).toBe(true);
  });

  it('lets go of the layout flag when the type is cleared, unless the app listens', () => {
    const { container } = mountCard({ containerType: 'size' });
    routeProp(container, 'style', {});
    expect(propOf(container, 'onLayout')).toBeUndefined();

    routeProp(container, 'onLayout', () => {});
    routeProp(container, 'style', { containerType: 'size' });
    routeProp(container, 'style', {});
    expect(propOf(container, 'onLayout')).toBe(true);
  });

  it('still hands the layout event to the listener of the app', () => {
    const { container } = mountCard({ containerType: 'size' });
    const seen: unknown[] = [];
    routeProp(container, 'onLayout', (event: ISymbioteEvent) => seen.push(event.nativeEvent));

    layOut(container, 500);

    expect(seen).toHaveLength(1);
  });

  it('does not take its own size for the container', () => {
    const { card } = mountCard({});
    routeProp(card, 'style', { containerType: 'size' });

    layOut(card, 500);

    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });
});
