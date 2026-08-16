// Proves PlatformColor / DynamicColorIOS reach the platform color processor. RN's
// processColor (wired via setColorProcessor) resolves CSS strings AND the opaque
// { semantic } / { dynamic } objects to the platform values iOS expects. The shared
// color seam (commit.ts processValue) once routed only strings, so an opaque color
// slipped past unprocessed; this asserts the object path flows through the processor
// and lands on the committed node.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DynamicColorIOS,
  PlatformColor,
  View,
  mount,
  processColor,
  unmount,
} from '@symbiote-native/react';
import { isOpaqueColorValue, setColorProcessor } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

const STRING_SENTINEL = 0xff_00_00_ff;
const ROOT_TAG = 260;

// What the wired processor saw, proving the opaque style color reached it.
let seen: unknown[] = [];

function App(): ReactElement {
  return <View style={{ backgroundColor: PlatformColor('labelColor') }} />;
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  seen = [];
  // Mimic RN: an opaque color resolves to a native dict, a CSS string to an int.
  setColorProcessor(value => {
    seen.push(value);
    return isOpaqueColorValue(value) ? { native: value } : STRING_SENTINEL;
  });
});
afterEach(() => {
  unmount(ROOT_TAG);
  setColorProcessor(value => value);
});

describe('PlatformColor / DynamicColorIOS', () => {
  // Positive only: building the opaque shapes and delegating them through the processor has no
  // rejecting branch on valid RN color inputs — no Negative group applies.
  describe('Positive', () => {
    // why: RN's own contract for these two factories — PlatformColor produces {semantic:[name]},
    // DynamicColorIOS produces an opaque {dynamic:{light,dark}} — native reads these SHAPES by
    // field name, so a drift here breaks silently on iOS regardless of what processColor does.
    it('builds the opaque shapes iOS native reads', () => {
      expect(PlatformColor('systemBlue')).toEqual({ semantic: ['systemBlue'] });

      const dynamic = DynamicColorIOS({ light: '#ffffff', dark: '#000000' });
      expect(isOpaqueColorValue(dynamic)).toBe(true);
      expect(dynamic.dynamic?.light).toBe('#ffffff');
    });

    // why: processColor is the ONE public seam both a plain CSS string and an opaque
    // PlatformColor object must flow through identically — proves it isn't special-casing one
    // shape and passing the other through unprocessed.
    it('processColor delegates strings and opaque objects to the wired processor', () => {
      expect(processColor('#abcdef')).toBe(STRING_SENTINEL);

      const semantic = PlatformColor('systemBlue');
      expect(processColor(semantic)).toEqual({ native: semantic });
    });

    // why: the earlier color seam (commit.ts processValue) routed only strings, so an opaque
    // style color slipped past unprocessed onto Fabric — this is the regression proving the
    // object path now reaches the SAME processor as a style-driven commit, not just the direct
    // processColor() call above.
    it('routes an opaque style color through the processor onto the committed node', () => {
      mount(ROOT_TAG, <App />);

      const painted = fabric.find(n => n.props.backgroundColor !== undefined);
      expect(painted, 'a node carries a backgroundColor').toBeDefined();

      // The committed prop is the processor's OUTPUT (the native dict), not the raw opaque object.
      expect(painted!.props.backgroundColor).toEqual({ native: { semantic: ['labelColor'] } });

      const routedSemantic = seen.some(
        v =>
          isOpaqueColorValue(v) &&
          JSON.stringify(v) === JSON.stringify({ semantic: ['labelColor'] }),
      );
      expect(routedSemantic, 'the opaque style color reached the processor').toBe(true);
    });
  });
});
