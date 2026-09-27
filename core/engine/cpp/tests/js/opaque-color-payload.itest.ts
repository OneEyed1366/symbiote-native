// Opaque colors through the C++ color seam. `PlatformColorParser.mm` reads each `dynamic` branch
// as a processed int only (RN's `processColorObject` converts them in JS). A CSS string left in the
// tuple paints nothing: device-seen as an invisible `DynamicColorIOS({ light: '#dbeafe' })` tile.

import {
  committedPayloadOf,
  createElement,
  createSurface,
  DynamicColorIOS,
  isRecord,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function backgroundOf(color: unknown): unknown {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView');
  setProp(node, 'style', { backgroundColor: color });
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload.backgroundColor;
}

describe('opaque colors (Positive — no throwing path)', () => {
  // why: each branch must reach native as the same int a plain color of that spelling does.
  it('processes every DynamicColorIOS branch like a plain color', () => {
    const light = '#dbeafe';
    const dark = 'rgb(19, 36, 58)';
    const contrast = 'red';
    const committed = backgroundOf(
      DynamicColorIOS({ light, dark, highContrastLight: contrast }),
    );
    if (!isRecord(committed) || !isRecord(committed.dynamic))
      throw new Error('the dynamic color did not commit as an object');
    const branches = committed.dynamic;
    expect(branches.light).toBe(backgroundOf(light));
    expect(branches.dark).toBe(backgroundOf(dark));
    expect(branches.highContrastLight).toBe(backgroundOf(contrast));
  });

  // why: a semantic name is resolved by native as-is; RN's processColorObject leaves it alone.
  it('passes a semantic PlatformColor through untouched', () => {
    const semantic = { semantic: ['systemBlue'] };
    expect(backgroundOf(semantic)).toEqual(semantic);
  });
});

report();
