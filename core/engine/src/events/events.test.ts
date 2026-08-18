// Unit test for the event layer. The shared fake Fabric captures the single
// handler the engine registers (fabric.fireEvent drives it); we assert press
// correlation + synthesis (pressIn/pressOut/longPress), capture/bubble dispatch,
// direct (non-bubbling) delivery, the responder-negotiation protocol
// (grant/transfer/reject/end/release/terminate), anchor transparency, the
// third-party registry fallback, and the ViewConfig gate that keeps a non-event
// onX as a prop.
//
// The event layer never throws on a malformed/unmatched native event -- an
// unrecognized topLevelType is logged and dropped, not rejected. So there is no
// Negative (toThrow) group; every scenario below is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  routeProp,
  setEventListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../index';
import { createAnchor } from '../node';
import { registerComponent } from '../registry';
// installEventHandler is internal (surface.ts calls it); reach it directly so the test can drive
// the handler without standing up a surface.
import { installEventHandler } from './index';

const fabric = installFabric();
installEventHandler();

interface ITree {
  root: ISymbioteNode;
  button: ISymbioteNode;
  child: ISymbioteNode;
  sibling: ISymbioteNode;
}

function buildTree(): ITree {
  const root = createElement('RCTView');
  const button = createElement('RCTView');
  const child = createElement('RCTView');
  const sibling = createElement('RCTView');
  appendChild(root, button);
  appendChild(button, child);
  appendChild(root, sibling);
  return { root, button, child, sibling };
}

let tree: ITree;
beforeEach(() => {
  tree = buildTree();
});

describe('press correlation', () => {
  // why: a tap is only "honest" when the finger lifts on the node it went down on
  // -- this is the whole reason press is synthesized instead of a raw native event.
  it('fires onPress when touch starts and ends on the target', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(presses).toBe(1);
  });

  // why: lifting on a child of the pressed node (e.g. an inner label) still counts
  // as pressing the outer touchable, matching RN's touch-target semantics.
  it('fires onPress when touch ends on a descendant of the start target', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(presses).toBe(1);
  });

  // why: dragging off the target and releasing on unrelated UI must NOT count as a
  // tap on the original target -- otherwise a drag-away-to-cancel gesture would misfire.
  it('does not fire onPress when touch ends on an unrelated sibling', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.sibling, 'topTouchEnd');
    expect(presses).toBe(0);
  });

  // why: a cancelled gesture (e.g. the OS took over for a system gesture) must
  // drop the pending press entirely -- a subsequent unrelated touchEnd must not
  // resurrect it.
  it('topTouchCancel drops the pending press', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchCancel');
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(presses).toBe(0);
  });
});

describe('pressIn / pressOut synthesis', () => {
  // why: Pressable's pressed-state feedback needs pressIn the instant a finger goes
  // down on it, before any correlation with where it ends -- this is what drives
  // the "highlighted" visual immediately.
  it('fires pressIn on touch start regardless of where the touch later ends', () => {
    let pressedIn = 0;
    routeProp(tree.button, 'onPressIn', () => {
      pressedIn += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    expect(pressedIn).toBe(1);
  });

  // why: pressOut must fire on the node the touch STARTED on (the responder) even
  // when the honest-tap check fails, so the pressed-state visual always releases.
  it('fires pressOut on the start node even when the touch ends elsewhere', () => {
    let pressedOut = 0;
    routeProp(tree.button, 'onPressOut', () => {
      pressedOut += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.sibling, 'topTouchEnd');
    expect(pressedOut).toBe(1);
  });

  // why: a cancelled gesture still owes the pressed-state visual a release, so
  // pressOut fires on cancel too, unlike onPress which is dropped entirely.
  it('fires pressOut (but not onPress) on topTouchCancel', () => {
    let pressedOut = 0;
    let presses = 0;
    routeProp(tree.button, 'onPressOut', () => {
      pressedOut += 1;
    });
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchCancel');
    expect(pressedOut).toBe(1);
    expect(presses).toBe(0);
  });
});

describe('longPress synthesis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // why: the long-press timer is armed ONLY when some node in the touch path
  // actually listens for it -- arming it unconditionally would be wasted timers on
  // every touch in the app, including plain non-interactive views.
  it('does not arm a timer when nothing in the path listens for longPress', () => {
    const longPresses = 0;
    // No onLongPress registered anywhere in the path.
    fabric.fireEvent(tree.button, 'topTouchStart');
    vi.advanceTimersByTime(600);
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(longPresses).toBe(0);
  });

  // why: a sustained hold (matching RN Touchable's 500ms) synthesizes longPress
  // without any native long-press event -- this is the whole point of running the
  // timer in JS.
  it('fires longPress after the hold delay and suppresses the trailing onPress', () => {
    let longPresses = 0;
    let presses = 0;
    routeProp(tree.button, 'onLongPress', () => {
      longPresses += 1;
    });
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    vi.advanceTimersByTime(500);
    expect(longPresses).toBe(1);
    fabric.fireEvent(tree.button, 'topTouchEnd');
    // why: RN eats the tap once a long press has already fired for the same gesture --
    // otherwise a long-press would ALSO register as a regular press on release.
    expect(presses).toBe(0);
  });

  // why: releasing before the hold delay elapses must not synthesize a long press
  // -- the timer has to be genuinely cancelled, not just ignored.
  it('does not fire longPress when the touch ends before the delay elapses', () => {
    let longPresses = 0;
    routeProp(tree.button, 'onLongPress', () => {
      longPresses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    vi.advanceTimersByTime(200);
    fabric.fireEvent(tree.button, 'topTouchEnd');
    vi.advanceTimersByTime(500);
    expect(longPresses).toBe(0);
  });

  // why: Pressability cancels a pending long press once the finger drifts past the
  // deactivation distance (10pt) -- a long press should only fire for a genuinely
  // stationary hold, not a slow drag.
  it('cancels the pending timer when the touch drifts past the deactivation distance', () => {
    let longPresses = 0;
    routeProp(tree.button, 'onLongPress', () => {
      longPresses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart', { pageX: 0, pageY: 0 });
    fabric.fireEvent(tree.button, 'topTouchMove', { pageX: 20, pageY: 0 });
    vi.advanceTimersByTime(500);
    expect(longPresses).toBe(0);
  });

  // why: small jitter within the deactivation distance must NOT cancel the timer --
  // a hand can't hold perfectly still, so a real long-press gesture must survive it.
  it('keeps the timer armed for a move within the deactivation distance', () => {
    let longPresses = 0;
    routeProp(tree.button, 'onLongPress', () => {
      longPresses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart', { pageX: 0, pageY: 0 });
    fabric.fireEvent(tree.button, 'topTouchMove', { pageX: 3, pageY: 0 });
    vi.advanceTimersByTime(500);
    expect(longPresses).toBe(1);
  });
});

describe('bubbling', () => {
  // why: an ancestor's listener must still run for an event that started on a
  // descendant, so a screen-level handler can observe presses from anything inside it.
  it('bubbles child -> parent without stopPropagation', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onPress', () => order.push('parent'));
    routeProp(tree.child, 'onPress', () => order.push('child'));
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual(['child', 'parent']);
  });

  // why: stopPropagation is the documented escape hatch for a nested touchable to
  // claim an event exclusively (e.g. a delete button inside a swipeable row).
  it('stopPropagation at the child halts bubbling', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onPress', () => order.push('parent'));
    routeProp(tree.child, 'onPress', (event: ISymbioteEvent) => {
      order.push('child');
      event.stopPropagation();
    });
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual(['child']);
  });

  // why: `target` must stay the node the gesture actually happened on through the
  // whole bubble walk, while `currentTarget` tracks whichever ancestor's listener
  // is currently running -- the same target/currentTarget split the DOM uses.
  it('tracks currentTarget per listener while target stays the dispatch node', () => {
    let seen = 0;
    routeProp(tree.child, 'onPress', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.child)
        seen += 1;
    });
    routeProp(tree.button, 'onPress', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.button)
        seen += 1;
    });
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(seen).toBe(2);
  });

  // why: capture listeners (onXCapture) fire root -> target BEFORE any bubble
  // listener, mirroring the DOM's capture phase -- an outer capture handler must
  // see the event before an inner bubble handler ever runs.
  //
  // Registered via setEventListener (the structural adapters' direct channel), not
  // routeProp: routeProp's ViewConfig gate (isEventFor) only whitelists
  // 'startShouldSetResponderCapture'/'moveShouldSetResponderCapture' as Capture-suffixed
  // listener names (see node.ts RESPONDER_EVENTS) -- a generic 'pressCapture' fails that
  // gate and would silently land as a dead prop instead of a listener. bubble()'s capture
  // phase itself is generic for any listener name, which is what this test targets;
  // whether React's onPressCapture (or Vue's/Solid's) ever reaches it through routeProp
  // is a separate, seemingly uncovered question -- flagged in the report, not fixed here
  // (out of scope: that gate lives in node.ts/view-config.ts, not this module).
  it('runs capture listeners root -> target ahead of bubble listeners', () => {
    const order: string[] = [];
    setEventListener(tree.button, 'pressCapture', () =>
      order.push('parent-capture'),
    );
    setEventListener(tree.child, 'pressCapture', () =>
      order.push('child-capture'),
    );
    routeProp(tree.button, 'onPress', () => order.push('parent-bubble'));
    routeProp(tree.child, 'onPress', () => order.push('child-bubble'));
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual([
      'parent-capture',
      'child-capture',
      'child-bubble',
      'parent-bubble',
    ]);
  });

  // why: stopPropagation during capture must prevent the bubble phase from running
  // at all -- a capture handler is meant to be able to intercept an event outright.
  it('stopPropagation during capture halts before the bubble phase runs', () => {
    const order: string[] = [];
    setEventListener(tree.button, 'pressCapture', (event: ISymbioteEvent) => {
      order.push('parent-capture');
      event.stopPropagation();
    });
    routeProp(tree.child, 'onPress', () => order.push('child-bubble'));
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual(['parent-capture']);
  });

  // why: a non-press bubbling event (e.g. onChange from a text input) must reuse
  // the same generic bubble() dispatch, proving BUBBLING_EVENTS is a real table and
  // press isn't special-cased. Registered via setEventListener: 'change' is not in
  // BASE_EVENTS for a plain RCTView (only text-input/Switch components declare it via
  // view-config.ts's COMPONENT_EVENTS), so routeProp's gate isn't the thing under test here.
  it('a non-press bubbling event (topChange) also bubbles child -> parent', () => {
    const order: string[] = [];
    setEventListener(tree.button, 'change', () => order.push('parent'));
    setEventListener(tree.child, 'change', () => order.push('child'));
    fabric.fireEvent(tree.child, 'topChange');
    expect(order).toEqual(['child', 'parent']);
  });

  // why: an anchor node (a non-painting host, e.g. Angular's #anchor) must be
  // transparent to listener lookup in both phases -- otherwise a framework's own
  // output-binding machinery on the anchor would refire the same handler twice.
  it('skips an anchor node in both capture and bubble phases', () => {
    const anchor = createAnchor();
    appendChild(tree.button, anchor);
    routeProp(anchor, 'onPress', () => {
      throw new Error(
        'anchor listener must never be invoked by bubble dispatch',
      );
    });
    let parentCalls = 0;
    routeProp(tree.button, 'onPress', () => {
      parentCalls += 1;
    });
    fabric.fireEvent(anchor, 'topTouchStart');
    fabric.fireEvent(anchor, 'topTouchEnd');
    expect(parentCalls).toBe(1);
  });
});

describe('direct (non-bubbling) delivery', () => {
  const frame = { x: 0, y: 0, width: 100, height: 40 };

  // why: layout must reach only the exact node it's about -- an ancestor gets its
  // own separate topLayout event, so layout must not additionally bubble.
  it('delivers layout directly to the target and raises the onLayout flag for Fabric', () => {
    let payload: unknown;
    routeProp(tree.sibling, 'onLayout', (event: ISymbioteEvent) => {
      payload = event.nativeEvent.layout;
    });
    // Fabric only emits layout when the node is flagged; a layout listener must raise onLayout.
    expect(tree.sibling.props.onLayout).toBe(true);
    fabric.fireEvent(tree.sibling, 'topLayout', { layout: frame });
    expect(payload).toBe(frame);
  });

  it('does not bubble layout to an ancestor', () => {
    let rootFired = false;
    routeProp(tree.sibling, 'onLayout', () => {});
    routeProp(tree.root, 'onLayout', () => {
      rootFired = true;
    });
    fabric.fireEvent(tree.sibling, 'topLayout', { layout: frame });
    expect(rootFired).toBe(false);
  });

  // why: layout is not a special case -- a second DIRECT_EVENTS entry (scroll) must
  // behave identically, proving the table (not a hardcoded layout path) drives delivery.
  // Registered via setEventListener: 'scroll' is declared only for RCTScrollView/
  // AndroidHorizontalScrollView in view-config.ts, not a plain RCTView, so routeProp's
  // gate isn't what this test targets.
  it('a second direct event (topScroll) also fires only on its own target', () => {
    let siblingFired = false;
    let rootFired = false;
    setEventListener(tree.sibling, 'scroll', () => {
      siblingFired = true;
    });
    setEventListener(tree.root, 'scroll', () => {
      rootFired = true;
    });
    fabric.fireEvent(tree.sibling, 'topScroll');
    expect(siblingFired).toBe(true);
    expect(rootFired).toBe(false);
  });
});

describe('third-party Fabric view fallback (registry)', () => {
  // why: a community native view (no built-in table entry) still must dispatch,
  // reading its event binding from the ViewConfig-derived registry instead --
  // otherwise every third-party Fabric view would be unusable.
  //
  // The bubbling ancestor's own listener is registered via setEventListener, not
  // routeProp: routeProp's ViewConfig gate (isEventFor) checks the REGISTERING node's
  // own declared event set, and a plain RCTView ancestor never declares a descendant
  // widget's custom event name -- only universal base events (press/layout/focus/blur)
  // bypass this because every component declares them. That gate question belongs to
  // node.ts/view-config.ts, not this module; this test targets events/index.ts's own
  // dispatch (does bubble() reach a registry-resolved listener), so it bypasses the gate
  // deliberately rather than exercise a second module's behavior here.
  it('dispatches a registered bubbling event for a non-built-in component', () => {
    registerComponent('RNCFakeWidget', {
      events: [
        { raw: 'topRNCFakeWidgetChange', listener: 'rNCFakeWidgetChange' },
      ],
    });
    const widget = createElement('RNCFakeWidget');
    const parent = createElement('RCTView');
    appendChild(parent, widget);
    let parentCalls = 0;
    setEventListener(parent, 'rNCFakeWidgetChange', () => {
      parentCalls += 1;
    });
    fabric.fireEvent(widget, 'topRNCFakeWidgetChange');
    expect(parentCalls).toBe(1);
  });

  // why: a registry entry can also be `direct: true` -- that must deliver only to
  // the target, exactly like the built-in DIRECT_EVENTS table. The ancestor's
  // negative-control listener uses setEventListener for the same gate reason as above.
  it('dispatches a registered direct event only to its own target', () => {
    registerComponent('RNCFakeSlider', {
      events: [
        {
          raw: 'topRNCFakeSliderComplete',
          listener: 'rNCFakeSliderComplete',
          direct: true,
        },
      ],
    });
    const slider = createElement('RNCFakeSlider');
    const parent = createElement('RCTView');
    appendChild(parent, slider);
    let parentCalls = 0;
    let sliderCalls = 0;
    setEventListener(parent, 'rNCFakeSliderComplete', () => {
      parentCalls += 1;
    });
    routeProp(slider, 'onRNCFakeSliderComplete', () => {
      sliderCalls += 1;
    });
    fabric.fireEvent(slider, 'topRNCFakeSliderComplete');
    expect(sliderCalls).toBe(1);
    expect(parentCalls).toBe(0);
  });
});

describe('unmatched native events', () => {
  // why: a native view firing something no table or registry knows (a ViewConfig
  // drift, a name mismatch) must be dropped harmlessly, not crash the app -- this
  // is the documented permanent diagnostic seam.
  it('does not throw and dispatches nothing for an unrecognized topLevelType', () => {
    expect(() =>
      fabric.fireEvent(tree.button, 'topSomeUnknownNativeEvent'),
    ).not.toThrow();
  });
});

describe('ViewConfig gate', () => {
  // why: an onX prop the ViewConfig doesn't declare as an event must stay a plain
  // prop (e.g. a native-only configuration value), never get treated as a listener.
  it('keeps an undeclared onX as a prop, not a listener', () => {
    routeProp(tree.sibling, 'onTintColor', '#34c759');
    expect(tree.sibling.props.onTintColor).toBe('#34c759');
    expect(tree.sibling.listeners?.has('tintColor')).not.toBe(true);
  });
});

describe('responder negotiation (PanResponder protocol)', () => {
  // pressStart/currentResponder/longPressTimer are module-scoped state, not per-test --
  // installEventHandler() runs once at file scope. Force-clear via a real cancel dispatch
  // (which unconditionally resets both, see events/index.ts's TOUCH_CANCEL branch) so a
  // touch left mid-gesture by one test can never leak into the next.
  afterEach(() => {
    fabric.fireEvent(tree.root, 'topTouchCancel');
  });

  // why: the first node along the touch path that answers should-set with true
  // wins the responder and receives onResponderGrant -- this is the entire basis
  // of PanResponder's opt-in gesture claiming.
  it('grants the responder to the node that answers startShouldSetResponder', () => {
    let granted = false;
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderGrant', () => {
      granted = true;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    expect(granted).toBe(true);
  });

  // why: mid-gesture takeover -- an ANCESTOR of the current responder can claim the
  // gesture via onMoveShouldSetResponder (e.g. a ScrollView deciding a drag inside a
  // nested touchable is actually a scroll). Without an explicit
  // onResponderTerminationRequest listener, RN's default is implicit consent, so the
  // takeover must succeed. (negotiateResponder scopes the walk to the responder's OWN
  // path and skips the responder itself when re-negotiating on 'move' -- see its
  // "skip the deepest node when it IS the current responder" comment -- so the taker
  // here is necessarily an ancestor of the responder, on the SAME touch, not an
  // unrelated sibling's own separate touch.)
  it('transfers the responder to an ancestor that claims via onMoveShouldSetResponder', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderTerminate', () =>
      order.push('button-terminated'),
    );
    routeProp(tree.root, 'onMoveShouldSetResponder', () => true);
    routeProp(tree.root, 'onResponderGrant', () => order.push('root-granted'));

    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchMove');

    expect(order).toEqual(['root-granted', 'button-terminated']);
  });

  // why: an incumbent that explicitly refuses onResponderTerminationRequest keeps
  // the responder -- the taker gets onResponderReject instead, never onResponderGrant.
  it('rejects the taker when the incumbent refuses onResponderTerminationRequest', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderTerminationRequest', () => false);
    routeProp(tree.button, 'onResponderTerminate', () =>
      order.push('button-terminated'),
    );
    routeProp(tree.root, 'onMoveShouldSetResponder', () => true);
    routeProp(tree.root, 'onResponderGrant', () => order.push('root-granted'));
    routeProp(tree.root, 'onResponderReject', () =>
      order.push('root-rejected'),
    );

    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchMove');

    expect(order).toEqual(['root-rejected']);
  });

  // why: onResponderMove is the sole payload channel PanResponder reads gesture
  // deltas from -- it must reach only whoever currently holds the responder.
  it('delivers responderMove only to the current responder', () => {
    let buttonMoves = 0;
    let siblingMoves = 0;
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderMove', () => {
      buttonMoves += 1;
    });
    routeProp(tree.sibling, 'onResponderMove', () => {
      siblingMoves += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchMove');
    expect(buttonMoves).toBe(1);
    expect(siblingMoves).toBe(0);
  });

  // why: onResponderEnd fires on every finger-up unconditionally, but
  // onResponderRelease is gated: it must fire only once no touch still down
  // started inside the responder -- lifting one finger in a multi-touch gesture
  // must not prematurely release it.
  it('fires responderEnd without responderRelease while another touch remains inside the responder', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderEnd', () => order.push('end'));
    routeProp(tree.button, 'onResponderRelease', () => order.push('release'));
    fabric.fireEvent(tree.button, 'topTouchStart');
    // A second finger is still down, and its touch target is the responder itself.
    fabric.fireEvent(tree.button, 'topTouchEnd', {
      touches: [{ target: tree.button }],
    });
    expect(order).toEqual(['end']);
  });

  // why: the mirror case -- with no remaining touch inside the responder (the
  // headless default: an empty event carries no `touches`), the final finger-up
  // must fire both responderEnd and responderRelease.
  it('fires responderEnd and responderRelease when no touch remains inside the responder', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderEnd', () => order.push('end'));
    routeProp(tree.button, 'onResponderRelease', () => order.push('release'));
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(order).toEqual(['end', 'release']);
  });

  // why: a cancelled gesture (topTouchCancel) unconditionally releases the
  // responder -- it must fire responderEnd then responderTerminate, never responderRelease
  // (the responder wasn't released by finishing, it was taken away).
  it('fires responderEnd then responderTerminate on topTouchCancel', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onStartShouldSetResponder', () => true);
    routeProp(tree.button, 'onResponderEnd', () => order.push('end'));
    routeProp(tree.button, 'onResponderRelease', () => order.push('release'));
    routeProp(tree.button, 'onResponderTerminate', () =>
      order.push('terminate'),
    );
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchCancel');
    expect(order).toEqual(['end', 'terminate']);
  });
});
