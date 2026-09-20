// React-driven test proving the Android AccessibilityInfo event dispatch, no emulator needed.
// The shared Fabric slot is
// augmented to record sendAccessibilityEvent(handle, eventType); we mount a View, capture its host
// ref, and assert AccessibilityInfo.sendAccessibilityEvent routes the node's COMMITTED Fabric handle
// and the STRING eventType (focus / click / windowStateChange) through the slot, matching RN's
// Fabric path, not the old UIManager int-map crutch. We import the .android build directly because
// the base re-export resolves to iOS under vitest.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, findNodeHandle } from '@symbiote-native/react';
import { AccessibilityInfo } from '../../../../../core/engine/src/accessibility-info/index.android';
import { installRecordingFabric } from '@symbiote-native/test-utils';

// The a11y event sink needed a hand-written slot override under the stand-in. The recording host
// records it natively — `sendAccessibilityEvent` is one of the three imperative calls it keeps,
// because each of them carries a request the ENGINE made rather than an answer a platform gave.
const fabric = installRecordingFabric();
const a11yEvents = fabric.accessibilityEvents;

const ROOT_TAG = 7;

function lastEvent(): IAccessibilityCall {
  const call = a11yEvents[a11yEvents.length - 1];
  if (!call) throw new Error('expected a slot.sendAccessibilityEvent call');
  return call;
}

let box: unknown;
let boxTag: number;
// The ENGINE NODE behind the ref. What the a11y event names is a node, and the record carries that
// node's handle — comparing handles is the claim directly, where comparing tags was the stand-in's
// way of spelling it.
let boxHandle: unknown;

beforeEach(() => {
  fabric.reset();
  a11yEvents.length = 0;
  box = undefined;

  function App(): ReactElement {
    return (
      <view
        ref={instance => {
          box = instance;
        }}
        style={{ width: 10, height: 10 }}
      />
    );
  }
  mount(ROOT_TAG, <App />);
  if (box == null) throw new Error('host ref handed back nothing');
  const tag = findNodeHandle(box);
  if (typeof tag !== 'number')
    throw new Error('findNodeHandle(ref) returned no tag');
  boxTag = tag;
  // `props.style` is `[baseStyle, explicitStyle]` — `routeProp`'s published pair, not the raw
  // object the JSX passed. The authored `{width, height}` lives in slot 1.
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
  const recorded = fabric.find(node => {
    const style = node.props.style;
    const explicitStyle = Array.isArray(style) ? style[1] : undefined;
    return isRecord(explicitStyle) && explicitStyle.width === 10;
  });
  if (recorded === undefined) throw new Error('the box was never created');
  boxHandle = recorded.handle;
});
afterEach(() => unmount(ROOT_TAG));

describe('AccessibilityInfo (Android)', () => {
  it("sendAccessibilityEvent('focus') routes the committed node + string through the slot", () => {
    AccessibilityInfo.sendAccessibilityEvent(box, 'focus');
    const call = lastEvent();
    expect(call.handle).toBe(boxHandle);
    expect(call.eventType).toBe('focus');
  });

  it('the STRING eventType passes through unmapped (no int translation)', () => {
    AccessibilityInfo.sendAccessibilityEvent(box, 'click');
    const click = lastEvent();
    expect(click.handle).toBe(boxHandle);
    expect(click.eventType).toBe('click');

    AccessibilityInfo.sendAccessibilityEvent(box, 'windowStateChange');
    expect(lastEvent().eventType).toBe('windowStateChange');
  });

  it('a non-node handle is a no-op, and setAccessibilityFocus(tag) does not route', () => {
    const before = a11yEvents.length;
    // A bare tag can't be resolved back to a node, so it must not reach the slot.
    AccessibilityInfo.sendAccessibilityEvent(123, 'focus');
    expect(a11yEvents.length).toBe(before);

    // setAccessibilityFocus is tag-only (no node to route), a documented no-op.
    AccessibilityInfo.setAccessibilityFocus(boxTag);
    expect(a11yEvents.length).toBe(before);
  });

  it('iOS-only getters resolve false on Android (RN parity)', async () => {
    expect(await AccessibilityInfo.isDarkerSystemColorsEnabled()).toBe(false);
    expect(await AccessibilityInfo.prefersCrossFadeTransitions()).toBe(false);
  });
});
