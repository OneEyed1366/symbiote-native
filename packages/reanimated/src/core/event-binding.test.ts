import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  getNativeTag,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workletOf } from '../../test-support/worklet';
import { createEventHandler } from './event-handlers';
import { claimEventHandlerProps } from './event-binding';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 12_000;
const releases: Array<() => void> = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

function handler() {
  const { workletEventHandler } = createEventHandler(
    workletOf(() => undefined, []),
    [],
  );
  vi.spyOn(workletEventHandler, 'registerForEvents');
  vi.spyOn(workletEventHandler, 'unregisterFromEvents');
  return workletEventHandler;
}

function mounted() {
  releases.push(claimEventHandlerProps());
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  return { surface, node };
}

describe('an event handler passed as a prop', () => {
  it('registers for the tag of the node only once the node has committed', () => {
    const { surface, node } = mounted();
    const held = handler();

    routeProp(node, 'onScroll', { workletEventHandler: held });
    expect(held.registerForEvents).not.toHaveBeenCalled();
    surface.commit();

    expect(held.registerForEvents).toHaveBeenCalledWith(
      getNativeTag(node),
      'onScroll',
    );
  });

  it('stays out of the committed payload', () => {
    const { surface, node } = mounted();

    routeProp(node, 'onScroll', { workletEventHandler: handler() });
    surface.commit();

    expect(Object.hasOwn(live.nodeOf(node).payload, 'onScroll')).toBe(false);
  });

  it('registers once however often the same handler is passed again', () => {
    const { surface, node } = mounted();
    const held = handler();
    routeProp(node, 'onScroll', { workletEventHandler: held });
    surface.commit();

    routeProp(node, 'onScroll', { workletEventHandler: held });
    surface.commit();

    expect(held.registerForEvents).toHaveBeenCalledTimes(1);
  });

  it('moves to the new handler when another one is passed', () => {
    const { surface, node } = mounted();
    const first = handler();
    const second = handler();
    routeProp(node, 'onScroll', { workletEventHandler: first });
    surface.commit();

    routeProp(node, 'onScroll', { workletEventHandler: second });
    surface.commit();

    expect(first.unregisterFromEvents).toHaveBeenCalledWith(getNativeTag(node));
    expect(second.registerForEvents).toHaveBeenCalledWith(
      getNativeTag(node),
      'onScroll',
    );
  });

  it('unregisters when the prop is removed', () => {
    const { surface, node } = mounted();
    const held = handler();
    routeProp(node, 'onScroll', { workletEventHandler: held });
    surface.commit();

    routeProp(node, 'onScroll', undefined);

    expect(held.unregisterFromEvents).toHaveBeenCalledWith(getNativeTag(node));
  });

  it('unregisters when the node leaves the tree', () => {
    const { surface, node } = mounted();
    const held = handler();
    routeProp(node, 'onScroll', { workletEventHandler: held });
    surface.commit();

    surface.removeChild(node);
    surface.commit();

    expect(held.unregisterFromEvents).toHaveBeenCalledWith(getNativeTag(node));
  });

  it('leaves every other prop to the engine', () => {
    const { surface, node } = mounted();

    routeProp(node, 'testID', 'kept');
    surface.commit();

    expect(live.nodeOf(node).payload.testID).toBe('kept');
  });
});
