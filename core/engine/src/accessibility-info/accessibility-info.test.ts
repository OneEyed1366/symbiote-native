// Co-located unit test for accessibility-info's shared sendAccessibilityEvent routing
// (accessibility-info/shared.ts's routeSendAccessibilityEvent), exercised through both
// platform builds directly, no simulator needed. Proves the merge behaves identically
// on both platforms except iOS's one 'click' no-op: createElement + createSurface commit
// a real node so it resolves as committed, and the recording host's own accessibilityEvents
// log is read directly — our own output, not a model of the renderer.
//
// Scope note: this file covers ONLY routeSendAccessibilityEvent (per the shared module's own
// contract). The rest of IAccessibilityInfoStatic (isScreenReaderEnabled/addEventListener/
// announceForAccessibility/...) is exercised at the adapter layer instead —
// adapters/react/src/modules/accessibility-info/{accessibility-info,accessibility-info-android}.test.tsx
// drive the same iOS/Android classes end to end with a fake native module + device-event hub,
// so those branches are N/A here rather than covered/characterization.
//
// routeSendAccessibilityEvent has no throwing path (a bad handle degrades to a logged no-op,
// never a throw), so scenarios are grouped by outcome ("no-op" vs "routes to the slot") rather
// than Positive/Negative.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  disposeRoot,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { AccessibilityInfo as AccessibilityInfoIOS } from './index.ios';
import { AccessibilityInfo as AccessibilityInfoAndroid } from './index.android';

// routeSendAccessibilityEvent dispatches through treeHost().sendAccessibilityEvent, which the
// recording host records verbatim — our own output, not a claim about the renderer.
const fabric = installRecordingFabric();
const a11yEvents = fabric.accessibilityEvents;

const ROOT_TAG = 91;

function committedNode(): ISymbioteNode {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

beforeEach(() => fabric.reset());
afterEach(() => disposeRoot(ROOT_TAG));

describe('sendAccessibilityEvent (shared routing)', () => {
  describe('no-op (handle does not resolve to a live committed node)', () => {
    // why: the public handle type is ISymbioteNode | number | null | undefined (whatever
    // findNodeHandle can resolve to) — null/undefined/a bare tag must all degrade to a silent
    // no-op rather than throw, since a caller may legitimately hold a stale/unset ref.
    it('null and undefined are no-ops on both platforms', () => {
      AccessibilityInfoIOS.sendAccessibilityEvent(null, 'focus');
      AccessibilityInfoAndroid.sendAccessibilityEvent(undefined, 'focus');
      expect(a11yEvents).toEqual([]);
    });

    // why: a bare native tag (number) is part of the handle union but is NOT a SymbioteNode —
    // isSymbioteNode must reject it structurally, not just null/undefined.
    it('a bare numeric tag is a no-op on both platforms (not a SymbioteNode)', () => {
      AccessibilityInfoIOS.sendAccessibilityEvent(91, 'focus');
      AccessibilityInfoAndroid.sendAccessibilityEvent(91, 'focus');
      expect(a11yEvents).toEqual([]);
    });

    // why: an uncommitted node passes the isSymbioteNode guard but has no entry in commit.ts's
    // node->tag mirror yet — dispatch must degrade quietly rather than throw on the missing tag.
    it('an uncommitted node is a no-op on both platforms (mirror has no entry yet)', () => {
      const node = createElement('RCTView');
      AccessibilityInfoIOS.sendAccessibilityEvent(node, 'focus');
      AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'focus');
      expect(a11yEvents).toEqual([]);
    });
  });

  describe('routes to the slot', () => {
    it('iOS routes every non-click event through the slot', () => {
      const node = committedNode();
      AccessibilityInfoIOS.sendAccessibilityEvent(node, 'focus');
      expect(a11yEvents).toHaveLength(1);
      expect(a11yEvents[0]?.eventType).toBe('focus');
    });

    // why: VoiceOver has no click producer (AccessibilityInfo.js) — iOS is the ONE platform
    // that must swallow 'click' before it ever reaches Fabric, via the shouldSkip hook.
    it("iOS early-returns 'click' — the ONE platform difference — nothing reaches the slot", () => {
      const node = committedNode();
      AccessibilityInfoIOS.sendAccessibilityEvent(node, 'click');
      expect(a11yEvents).toEqual([]);
    });

    // why: Android passes no shouldSkip hook at all — proves the 'click' no-op is an iOS-only
    // carve-out, not baked into the shared routing itself.
    it("Android has no 'click' special case: it reaches the slot exactly like any other event", () => {
      const node = committedNode();
      AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'click');
      expect(a11yEvents).toHaveLength(1);
      expect(a11yEvents[0]?.eventType).toBe('click');
    });

    it('Android routes a non-click event through the slot too, identically to iOS', () => {
      const node = committedNode();
      AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'focus');
      expect(a11yEvents).toHaveLength(1);
      expect(a11yEvents[0]?.eventType).toBe('focus');
    });
  });
});
