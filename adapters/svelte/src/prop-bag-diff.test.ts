// Two contracts of the renderer's prop handling that no other test pins
// A key dropped from the bag resets the prop, and the attribute API works on a lazy map

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { createRendererHarness } from './renderer-harness';
import renderer from './symbiote-renderer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createRendererHarness(91_318);

beforeEach(() => {
  fabric.reset();
  harness.open();
});

afterEach(() => {
  harness.close();
});

// The live tree, as `find()` of the recording reports the node as it was created
function committedPropsOf(testID: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit.payload;
}

describe('the renderer prop bag', () => {
  // A conditional prop that stops being emitted must reach Fabric as a reset
  it('resets a key that the next bag no longer carries', async () => {
    const element = renderer.createElement('view');
    renderer.setAttribute(element, 'p', {
      testID: 'bag',
      accessibilityLabel: 'before',
    });
    renderer.insert(harness.liveRoot(), element, null);
    await harness.settle();
    expect(committedPropsOf('bag').accessibilityLabel).toBe('before');

    renderer.setAttribute(element, 'p', { testID: 'bag' });
    await harness.settle();
    // Fabric spells "back to the default" as an explicit null, not a missing key
    expect(committedPropsOf('bag').accessibilityLabel ?? null).toBeNull();
  });

  // The map is lazy, so set, get and remove run against one that may not exist yet
  it('round-trips attributes through the lazily created map', () => {
    const element = renderer.createElement('view');
    expect(renderer.getAttribute(element, 'data-x')).toBeNull();

    renderer.setAttribute(element, 'data-x', '1');
    expect(renderer.getAttribute(element, 'data-x')).toBe('1');
    expect(
      renderer.getAttribute(renderer.createElement('view'), 'data-x'),
    ).toBeNull();

    renderer.removeAttribute(element, 'data-x');
    expect(renderer.getAttribute(element, 'data-x')).toBeNull();
  });

  // A second write on a live element takes the single-key path, which skips the full diff
  it('commits an attribute written after the element is live', async () => {
    const element = renderer.createElement('view');
    renderer.setAttribute(element, 'testID', 'door');
    renderer.insert(harness.liveRoot(), element, null);
    await harness.settle();
    expect(committedPropsOf('door').testID).toBe('door');

    renderer.setAttribute(element, 'accessibilityLabel', 'late');
    await harness.settle();
    expect(committedPropsOf('door').accessibilityLabel).toBe('late');
  });
});
