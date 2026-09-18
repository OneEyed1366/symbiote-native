// Proves the View/Text event + alias props thread through to the committed Fabric node:
//   1. <view onLayout> / <text onLayout> raise the `layout` event, the listener flags
//      onLayout:true on the node (Fabric only measures a flagged node).
//   2. id="foo" is RN's W3C alias for nativeID, so it lands as nativeID:'foo' and must
//      NEVER reach Fabric as a raw `id` prop.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
// A RECORDING host, and every read is of the PAYLOAD. Both things under test are folds that run
// inside `fabricProps`: the author wrote `id`, so `nativeID` exists only in the payload, and the
// `onLayout: true` flag is put there by the same pass. The node's own bag still holds `id`.
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const ROOT_TAG = 240;

function App(): ReactElement {
  return (
    <view id="foo" onLayout={() => {}}>
      <text onLayout={() => {}}>hi</text>
    </view>
  );
}

const fabric = installRecordingFabric();

/** The payload of the app's own View — the synthetic root never carries `nativeID`. */
function appViewPayload(): Record<string, unknown> {
  const view = fabric.find(
    n => n.viewName === 'RCTView' && payloadOf(n.handle).nativeID === 'foo',
  );
  expect(view, 'a View with nativeID="foo" was created').toBeDefined();
  return payloadOf(view!.handle);
}
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('View/Text layout + id alias props', () => {
  // Positive only: `routeProp` (core/engine/src/node.ts) always resolves id/onLayout to SOME
  // committed shape on a valid element — no invalid-input branch for a Negative group.
  describe('Positive', () => {
    // why: `id` is React DOM muscle memory that must NEVER leak to Fabric as a raw prop — RN's
    // own W3C alias maps it to `nativeID`, and a stray `id` key reaching a real native view
    // manager is undefined behavior on device, not just a cosmetic prop-name mismatch.
    it('folds id to nativeID and never leaks a raw id prop', () => {
      mount(ROOT_TAG, <App />);
      expect('id' in appViewPayload()).toBe(false);
    });

    // why: Fabric only measures/fires layout for a node explicitly flagged onLayout:true — an
    // unflagged node's onLayout handler would silently never fire on a real host.
    it('flags the View node with onLayout:true', () => {
      mount(ROOT_TAG, <App />);
      expect(appViewPayload().onLayout).toBe(true);
    });

    // why: the flag must be set independently per node type — a Text-only onLayout must not
    // depend on the sibling View already having it, or a Text-only layout listener would break.
    it('flags the Text node with onLayout:true', () => {
      mount(ROOT_TAG, <App />);
      const text = fabric.find(n => n.viewName === 'RCTText');
      expect(text, 'an RCTText was created').toBeDefined();
      expect(payloadOf(text!.handle).onLayout).toBe(true);
    });
  });
});
