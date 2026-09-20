// Proves the COLOR_PROPS set runs every RN color style key through the injected platform
// processor before Fabric. Fabric's C++ color parser silently drops CSS strings, so a
// color key MUST reach the slot as a processed value (an int here), never the raw 'red'.
// A failure is a missing COLOR_PROPS entry (the logical/writing-direction keys that drifted).

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { setColorProcessor } from '@symbiote-native/engine';
// A RECORDING host, and every read is of the PAYLOAD: a colour key arrives inside `style` and only
// becomes a top-level processed value on the way into the payload, which is exactly what this file
// is about. The node's own prop bag still holds the author's style object.
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

// A real RN processColor turns 'red' into a platform int; this sentinel int proves the
// key passed through processValue (COLOR_PROPS.has(key)) rather than reaching Fabric raw.
const PROCESSED_COLOR = 0xff_00_00_ff;
const ROOT_TAG = 250;

const COLOR_KEYS = [
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'textShadowColor',
  'overlayColor',
  'outlineColor',
] as const;

function App(): ReactElement {
  const style: Record<string, unknown> = {};
  for (const key of COLOR_KEYS) style[key] = 'red';
  return <view style={style} />;
}

const fabric = installRecordingFabric();
beforeEach(() => {
  fabric.reset();
  setColorProcessor(() => PROCESSED_COLOR);
});
afterEach(() => {
  unmount(ROOT_TAG);
  // Restore the identity processor so a sibling test sees an untouched seam.
  setColorProcessor(value => value);
});

describe('COLOR_PROPS processing', () => {
  // Positive only: COLOR_PROPS membership is a static set check with no invalid-input branch
  // to reject — a missing key is a silent regression, not something the unit throws on.
  describe('Positive', () => {
    // why: Fabric's C++ color parser silently drops a raw CSS string, so EVERY key in
    // COLOR_PROPS — including the newer logical/writing-direction ones — must be routed through
    // the processor; missing even one means that prop silently stops working on a real device.
    it('runs every logical/writing-direction color key through the processor', () => {
      mount(ROOT_TAG, <App />);

      // The app's View is the RCTView carrying a color key, not the synthetic root.
      const view = fabric.find(
        n =>
          n.viewName === 'RCTView' &&
          COLOR_KEYS.some(k => k in payloadOf(n.handle)),
      );
      expect(view, 'a styled RCTView was committed').toBeDefined();

      const payload = payloadOf(view!.handle);
      for (const key of COLOR_KEYS) {
        expect(
          payload[key],
          `"${key}" must not reach Fabric as the raw string`,
        ).not.toBe('red');
        expect(payload[key], `"${key}" must be the processed int`).toBe(
          PROCESSED_COLOR,
        );
      }
    });
  });
});
