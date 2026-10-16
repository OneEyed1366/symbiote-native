import {
  createElement,
  createSurface,
  getNativeTag,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle } from '../../test-support/worklet';
import { createAnimatedRef } from './animated-ref';

let nextRootTag = 11_000;
const host = installWrapperHost();

function mounted() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  return { surface, node };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('an animated ref made by the controller', () => {
  it('has no wrapper and no node until it is attached', () => {
    const ref = createAnimatedRef();

    expect(ref()).toBeNull();
    expect(ref.current).toBeNull();
  });

  it('gets the wrapper of the node once the node has committed', () => {
    const ref = createAnimatedRef();
    const { surface, node } = mounted();

    ref(node);
    expect(ref()).toBeNull();
    surface.commit();

    expect(ref()).toBe(host.wrapperOf(node));
    expect(ref.current).toBe(node);
  });

  it('takes the node a component hands out under `hostNode`, as a ref on a component gets that', () => {
    const ref = createAnimatedRef();
    const { surface, node } = mounted();

    ref({ hostNode: node });
    surface.commit();

    expect(ref.current).toBe(node);
    expect(ref()).toBe(host.wrapperOf(node));
  });

  it('ignores a value that holds no node', () => {
    const ref = createAnimatedRef();

    ref({ hostNode: 'not a node' });

    expect(ref.current).toBeNull();
  });

  it('knows the native tag of the node once it has committed', () => {
    const ref = createAnimatedRef();
    const { surface, node } = mounted();
    ref(node);
    surface.commit();

    expect(ref.getTag()).toBe(getNativeTag(node));
  });

  it('lets the UI side read the same wrapper', async () => {
    const ref = createAnimatedRef();
    const { surface, node } = mounted();
    ref(node);
    surface.commit();
    await settle();

    expect(ref.sharedWrapper.getSync()).toBe(host.wrapperOf(node));
  });

  it('drops the wrapper when its node leaves the tree', async () => {
    const ref = createAnimatedRef();
    const { surface, node } = mounted();
    ref(node);
    surface.commit();

    surface.removeChild(node);
    surface.commit();
    await settle();

    expect(ref()).toBeNull();
    expect(ref.sharedWrapper.getSync()).toBeNull();
  });
});

describe('observers of an animated ref', () => {
  it('hear the tag as it is now, and again once an attached node commits', () => {
    const ref = createAnimatedRef();
    const observer = vi.fn();
    ref.observe(observer);
    const { surface, node } = mounted();

    ref(node);
    surface.commit();

    expect(observer).toHaveBeenNthCalledWith(1, null);
    expect(observer).toHaveBeenLastCalledWith(getNativeTag(node));
  });

  it('clean up before they are told again and when they unsubscribe', () => {
    const ref = createAnimatedRef();
    const cleanup = vi.fn();
    const unsubscribe = ref.observe(() => cleanup);
    const { surface, node } = mounted();
    ref(node);
    surface.commit();
    expect(cleanup).toHaveBeenCalledTimes(1);

    unsubscribe();

    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
