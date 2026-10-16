// What a native library keyed by Fabric family (Reanimated) needs from a committed node: a real
// `ShadowNodeWrapper` built by the host, and a signal for when the family was re-created under it.
// Headless fakes cannot answer either, so the contract is read off the real engine.

import {
  appendChild,
  createElement,
  createSurface,
  getFamilyGeneration,
  getShadowNodeWrapper,
  removeChild,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

let nextRootTag = 1;

function surfaceWith(...nodes: ReturnType<typeof createElement>[]) {
  const surface = createSurface(nextRootTag++);
  for (const node of nodes) surface.appendChild(node);
  surface.commit();
  mounted();
  return surface;
}

describe('the wrapper of a committed node', () => {
  it('is an object the host built', () => {
    const node = createElement('RCTView');
    surfaceWith(node);

    expect(typeof getShadowNodeWrapper(node)).toBe('object');
  });

  it('is still there after the node is committed again with a new prop', () => {
    const node = createElement('RCTView');
    const surface = surfaceWith(node);
    setProp(node, 'testID', 'second');
    surface.commit();
    mounted();

    expect(typeof getShadowNodeWrapper(node)).toBe('object');
  });

  it('is undefined for a node that never committed', () => {
    expect(getShadowNodeWrapper(createElement('RCTView'))).toBe(undefined);
  });
});

describe('the family generation of a committed node', () => {
  it('is set once the node has a family', () => {
    const node = createElement('RCTView');
    surfaceWith(node);

    expect(getFamilyGeneration(node)).toBeGreaterThan(0);
  });

  it('stays the same when only a prop changes', () => {
    const node = createElement('RCTView');
    const surface = surfaceWith(node);
    const before = getFamilyGeneration(node);
    setProp(node, 'testID', 'changed');
    surface.commit();
    mounted();

    expect(getFamilyGeneration(node)).toBe(before);
  });

  it('changes when the node is moved under another parent', () => {
    const child = createElement('RCTView');
    const first = createElement('RCTView');
    const second = createElement('RCTView');
    appendChild(first, child);
    const surface = surfaceWith(first, second);
    const before = getFamilyGeneration(child) ?? 0;

    removeChild(first, child);
    appendChild(second, child);
    surface.commit();
    mounted();

    expect(getFamilyGeneration(child) ?? 0).toBeGreaterThan(before);
  });

  it('is undefined for a node that never committed', () => {
    expect(getFamilyGeneration(createElement('RCTView'))).toBe(undefined);
  });
});

report();
