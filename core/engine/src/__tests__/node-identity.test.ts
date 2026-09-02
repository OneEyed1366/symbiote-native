// The node-identity guard (`committedOf` in ../node.ts).
//
// The engine identifies a node BY IDENTITY, and every imperative API resolves its target through
// the node's committed record. While that record lived in a `WeakMap<ISymbioteNode, IMirror>`, the
// guard was free: hand the engine a wrapper instead of the node and the lookup simply missed, so
// the call bailed with "node not committed". Moving the record onto the node as a plain field
// removed that for free-ness - a Proxy forwards `proxy.committed` straight to its target and hands
// back a REAL record - so the check is now explicit, and these rows are what keep it honest.
//
// Why this matters in practice rather than in theory: a Vue `reactive()` / deep `ref()` around a
// host element is the wrap that actually happens (vue-adapter-reactivity: `shallowRef` is the fix).
// A plain Proxy is used here rather than importing Vue because the mechanism being defended
// against is property forwarding, which `new Proxy(node, {})` reproduces exactly - and the deep
// case below reproduces the part that would otherwise reach native: a proxied JSI handle.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  dispatchViewCommand,
  getNativeTag,
  setProp,
  type ISymbioteNode,
} from '../index';
import { committedOf } from '../node';

const fabric = installFabric();
const surface = createSurface(4242);

const host = createElement('RCTView');
setProp(host, 'testID', 'identity-host');
const child = createElement('RCTView');
setProp(child, 'testID', 'identity-child');
appendChild(host, child);
surface.appendChild(host);
surface.commit();

// A shallow wrapper: forwards every read to the target, exactly like any Proxy with no traps.
const shallowWrapped = new Proxy(host, {});

// A deep wrapper: re-wraps every object it hands back, which is the shape `reactive()` has and the
// one that would otherwise put a Proxy around the JSI handle and carry it into cloneNodeWithNewProps.
function deepWrap<T extends object>(target: T): T {
  return new Proxy(target, {
    get(inner, key, receiver) {
      const value = Reflect.get(inner, key, receiver);
      return typeof value === 'object' && value !== null
        ? deepWrap(value)
        : value;
    },
  });
}
const deepWrapped = deepWrap(host);

describe('committedOf resolves only the raw retained node', () => {
  it('returns the record for the node itself', () => {
    const record = committedOf(host);
    expect(record).toBeDefined();
    expect(record!.viewName).toBe('RCTView');
    expect(record!.owner).toBe(host);
  });

  it('returns undefined for a node that has never been committed', () => {
    expect(committedOf(createElement('RCTView'))).toBeUndefined();
  });

  it('rejects a shallow proxy even though the field read succeeds through it', () => {
    // The distinction this test exists for: reading the field through the wrapper WORKS - that is
    // precisely the hazard - and only the owner comparison catches it.
    expect(shallowWrapped.committed).toBeDefined();
    expect(committedOf(shallowWrapped)).toBeUndefined();
  });

  it('rejects a deep proxy, whose record would otherwise carry a proxied JSI handle', () => {
    expect(committedOf(deepWrapped)).toBeUndefined();
  });
});

describe('the imperative API bails on a wrapped node instead of reaching the slot', () => {
  it('getNativeTag resolves for the raw node and not for a wrapper', () => {
    expect(getNativeTag(host)).toBeTypeOf('number');
    expect(getNativeTag(shallowWrapped)).toBeUndefined();
    expect(getNativeTag(deepWrapped)).toBeUndefined();
  });

  it('dispatchViewCommand reaches the slot for the raw node', () => {
    const before = fabric.commands.length;
    dispatchViewCommand(host, 'focus', []);
    expect(fabric.commands.length).toBe(before + 1);
  });

  it('dispatchViewCommand makes no native call for a wrapper', () => {
    const before = fabric.commands.length;
    dispatchViewCommand(shallowWrapped, 'focus', []);
    dispatchViewCommand(deepWrapped, 'focus', []);
    expect(fabric.commands.length).toBe(before);
  });
});

describe('the record survives the operations that rewrite it', () => {
  it('keeps a stable reactTag across a props-only re-clone', () => {
    const tagBefore = getNativeTag(child);
    setProp(child, 'opacity', 0.25);
    surface.commit();
    // The clone keeps the node's family, so the tag it was minted with must carry through - this is
    // what the native Animated driver binds to, and losing it here would be silent.
    expect(getNativeTag(child)).toBe(tagBefore);
    expect(committedOf(child)!.owner).toBe(child);
  });

  it('still names the right owner after a reparent re-creates the node', () => {
    const newParent = createElement('RCTView');
    setProp(newParent, 'testID', 'identity-new-parent');
    surface.appendChild(newParent);
    appendChild(newParent, child);
    surface.commit();
    expect(committedOf(child)!.owner).toBe(child);
    expect(committedOf(child)!.parent).toBe(newParent);
  });
});

// Guards the claim in ISymbioteNode's own comment: this is the FRAMEWORK's host node carrying its
// native binding, not a parallel structure. If a second tree ever reappears, the node stops being
// the single place a committed handle can be found and this goes red.
describe('the committed record is reachable from the node and nowhere else', () => {
  it('is a field on the node the framework holds', () => {
    const node: ISymbioteNode = host;
    expect(node.committed).toBe(committedOf(host));
  });
});
