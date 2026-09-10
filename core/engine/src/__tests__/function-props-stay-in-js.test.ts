// A function prop cannot cross the mutation wire. The host stores props as a `folly::dynamic` and
// `jsi::dynamicFromValue` THROWS on a callable — "JS Functions are not convertible to dynamic" — so
// one function prop kills the whole batch and the commit it carried.
//
// The reference applier is tolerant where the device is not: it would happily park a closure in
// `node.props`, so ASSERTING ON THE TS HOST CANNOT REPRODUCE THE CRASH. What it can assert is the
// property that prevents it — the function never reaches the host at all — and that is the same
// observable on both. Device-found 2026-09-08 through `setNativeProps`, which is the one prop path
// with no `routeProp` in front of it: an `Animated.View` spread with `panResponder.panHandlers`
// hands `AnimatedProps.__getValue()` a bag of callbacks and it copies every key it holds.
import { describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import {
  createElement,
  createSurface,
  propOf,
  routeProp,
  setNativeProps,
} from '../index';
import { flushOps, treeHost } from '../tree-host';

installFabric();
let nextRootTag = 9300;

function mounted() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

// What the HOST holds, which is the thing the device would have tried to convert. Deliberately not
// `propOf`, which answers from the JS stash first and would report the function either way.
//
// `flushOps` FIRST, and it is load-bearing rather than tidy: without it the op is still sitting in
// the buffer, the host has seen nothing, and `undefined` comes back whatever the engine did with the
// value — three of these four assertions were unfailable until a break test showed only one of them
// moving.
function hostProp(node: object, key: string): unknown {
  flushOps();
  return treeHost()?.propOf(node, key);
}

describe('a function prop never reaches the host', () => {
  it('keeps a setNativeProps callback in JS and still reads it back', () => {
    const node = mounted();
    const onResponderMove = vi.fn();

    setNativeProps(node, { onResponderMove, opacity: 0.5 });

    expect(hostProp(node, 'onResponderMove')).toBeUndefined();
    expect(propOf(node, 'onResponderMove')).toBe(onResponderMove);
    // The non-function beside it must still travel, or the fix has broken the path it guards.
    expect(hostProp(node, 'opacity')).toBe(0.5);
  });

  it('keeps an unregistered on* prop in JS — the onValueChange case', () => {
    const node = mounted();
    const onValueChange = vi.fn();

    routeProp(node, 'onValueChange', onValueChange);

    expect(hostProp(node, 'onValueChange')).toBeUndefined();
    expect(propOf(node, 'onValueChange')).toBe(onValueChange);
  });

  it('lets go when a non-function is written over it', () => {
    const node = mounted();
    routeProp(node, 'onValueChange', vi.fn());

    routeProp(node, 'onValueChange', undefined);

    // Reading the stale closure back would be worse than losing it: a behavior would keep calling
    // a handler the app has taken away.
    expect(propOf(node, 'onValueChange')).toBeUndefined();
  });

  it('replaces a stashed function rather than keeping the first', () => {
    const node = mounted();
    const first = vi.fn();
    const second = vi.fn();
    routeProp(node, 'onValueChange', first);

    routeProp(node, 'onValueChange', second);

    expect(propOf(node, 'onValueChange')).toBe(second);
  });
});
