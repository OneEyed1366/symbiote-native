// TouchableWithoutFeedback as a TAG. The headline claim is a NODE COUNT: RN's TWF renders no view
// of its own (TouchableWithoutFeedback.js:229,286), so a TWF wrapping one View must commit ONE
// node, where all five of our wrappers committed two.
//
// No Android half, unlike `touchable-native-feedback.test.ts`: TWF has no `Platform.OS` branch at
// all — no ripple background, no view commands — so one file covers both platforms, and the
// "commits no ripple" case below is what pins that rather than a second file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  appendChild as engineAppend,
  insertBefore as engineInsertBefore,
  clearHostBehaviors,
  createElement,
  createSurface,
  removeChild as engineRemove,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '../component-names';
import { foldHostBag } from '../fold-host-bag';
import {
  registerTouchableWithoutFeedbackBehavior,
  TOUCHABLE_WITHOUT_FEEDBACK_TAG as TAG,
} from './touchable-without-feedback';

const fabric = installFabric();
let nextRootTag = 7800;

const ROOT_TEST_ID = 'root';
// On the OWNER, so `subject()` finds the committed CHILD by the owner's id — `testID` is one of the
// props TWF clones. Unlike TNF the clone is conditional, so a TWF with no `testID` leaves the
// child's alone; that half has its own case below.
const SUBJECT_TEST_ID = 'subject';

function touchAt(x: number, y: number): ISymbioteEvent {
  return { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y } };
}

function nodeFor(intrinsic: 'view' | 'touchable-without-feedback') {
  const descriptor = descriptorFor(intrinsic);
  return createElement(descriptor.component, descriptor.isText, intrinsic);
}

/**
 * `<view testID=root><touchable-without-feedback …><view …/></…></view>`.
 *
 * OWNER PROPS ARE WRITTEN BEFORE THE CHILD IS APPENDED, which is React's and Solid's order and the
 * reason the clone is a payload FOLD rather than a prop redirect. `writes AFTER the child` covers
 * Vue's opposite order.
 */
function mount(
  ownerProps: Readonly<Record<string, unknown>> = {},
  childProps: Readonly<Record<string, unknown>> = {},
) {
  const root = nodeFor('view');
  routeProp(root, 'testID', ROOT_TEST_ID);
  const owner = nodeFor('touchable-without-feedback');
  for (const [key, value] of Object.entries(ownerProps))
    routeProp(owner, key, value);
  const child = nodeFor('view');
  for (const [key, value] of Object.entries(childProps))
    routeProp(child, key, value);

  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(root);
  return { root, owner, child, surface };
}

// The common case: the owner carries the id the child is then found by.
function mountIdentified(
  ownerProps: Readonly<Record<string, unknown>> = {},
  childProps: Readonly<Record<string, unknown>> = {},
) {
  return mount({ testID: SUBJECT_TEST_ID, ...ownerProps }, childProps);
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

function findCommitted(testID: string): IFakeNode {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

function countNodes(node: IFakeNode): number {
  return 1 + node.children.reduce((sum, kid) => sum + countNodes(kid), 0);
}

// pressIn arrives BEFORE the responder claim (events/index.ts bubbles PRESS_IN then negotiates), and
// whichever opens the gesture is what rebuilds the machine — so both, in that order.
function pressIn(child: ISymbioteNode, at: ISymbioteEvent): void {
  listenerOf(child, 'pressIn')(at);
  listenerOf(child, 'startShouldSetResponder')(at);
}

beforeEach(() => {
  vi.useFakeTimers();
  fabric.commands.length = 0;
  registerTouchableWithoutFeedbackBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('touchable-without-feedback host behavior', () => {
  // THE HEADLINE. Two nodes total — the root and the child — because the tag itself commits none.
  it('commits NO node of its own: one child in, one node out', () => {
    const { root, owner, child, surface } = mountIdentified();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].viewName).toBe('RCTView');
    expect(committedRoot.children[0].props.testID).toBe(SUBJECT_TEST_ID);
    expect(countNodes(committedRoot)).toBe(2);
  });

  // `insertBefore` is how Vue and Svelte spell an insert, and it carries its OWN copy of the
  // adoption notify — two entry points, and only covering one leaves the other unwitnessed.
  it('adopts a child inserted with insertBefore, not only appendChild', () => {
    const { root, owner, child, surface } = mountIdentified({
      accessibilityLabel: 'Save',
    });
    engineAppend(root, owner);
    engineInsertBefore(owner, child, null);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(countNodes(committedRoot)).toBe(2);
    expect(committedRoot.children[0].props.accessibilityLabel).toBe('Save');
  });

  it('clones RN’s passthrough list onto the child and leaves the rest behind', () => {
    const { root, owner, child, surface } = mountIdentified(
      {
        accessibilityLabel: 'Save',
        accessibilityRole: 'button',
        accessibilityHint: 'Saves the draft',
        accessibilityIgnoresInvertColors: true,
        hitSlop: 8,
        // In TNF's clone list (:366,:375-379) and NOT in TWF's (:130-153). Read the two lists side
        // by side; the families do not agree.
        hasTVPreferredFocus: true,
        nextFocusDown: 12,
        // No `style` in `elementProps` either — RN declares the prop (:122, "FIXME: not in doc")
        // and never clones it, so it stays on a node that never commits.
        opacity: 0.25,
      },
      { backgroundColor: 'red' },
    );
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(committed.props.accessibilityLabel).toBe('Save');
    expect(committed.props.accessibilityRole).toBe('button');
    expect(committed.props.accessibilityHint).toBe('Saves the draft');
    expect(committed.props.accessibilityIgnoresInvertColors).toBe(true);
    expect(committed.props.hitSlop).toBe(8);
    // The child's own props survive where the clone list does not name them.
    expect(committed.props.backgroundColor).toBe('red');
    for (const absent of ['hasTVPreferredFocus', 'nextFocusDown', 'opacity'])
      expect(Object.keys(committed.props)).not.toContain(absent);
  });

  // THE SPLIT FROM TNF, and it is the whole reason this file is not a copy of its neighbour. RN's
  // TWF copies its passthrough list only `if (props[prop] !== undefined)` (:280-284), where TNF
  // assigns unconditionally and therefore CLEARS a child prop it does not carry itself.
  it('leaves a child’s own testID alone when the owner carries none', () => {
    const { root, owner, child, surface } = mount({}, { testID: 'mine' });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted('mine');
    expect(committed.props.testID).toBe('mine');
    expect(countNodes(findCommitted(ROOT_TEST_ID))).toBe(2);
  });

  it('computes accessible, focusable, nativeID and accessibilityState', () => {
    const { root, owner, child, surface } = mountIdentified({
      id: 'from-id',
      nativeID: 'losing-value',
      onPress: () => {},
      accessibilityState: { busy: true },
      disabled: true,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(committed.props.accessible).toBe(true);
    // :275. RN's own passthrough loop then re-assigns a set `nativeID` OVER this, so upstream an
    // explicit `nativeID` wins; not reproduced, see the fold's comment — the spec's `ID_ALIAS`
    // makes the quirk depend on which adapter is driving.
    expect(committed.props.nativeID).toBe('from-id');
    // :263-266 — an onPress is present but `disabled` is true.
    expect(committed.props.focusable).toBe(false);
    // :258-263 — the explicit `disabled` overrides, and the rest of the state survives.
    expect(committed.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    // A machine-only prop must not ride into the payload as a key no ViewConfig declares.
    expect(Object.keys(committed.props)).not.toContain('disabled');
  });

  // Both arms, because the adapters disagree about WHERE they rename (React/Svelte per tag through
  // `foldHostBag`, Solid/Vue/Angular globally in the renderer) and the answer must not depend on it.
  // The second arm is inert until the spec carries this primitive's entry; it costs nothing and
  // becomes real the day the key lands.
  it('folds `id` the same whichever layer renamed it', () => {
    const authored = { id: 'from-id', nativeID: 'losing-value' };
    for (const ownerProps of [authored, foldHostBag(TAG, authored)]) {
      fabric.reset();
      const { root, owner, child, surface } = mountIdentified(ownerProps);
      engineAppend(root, owner);
      engineAppend(owner, child);
      surface.commit();
      expect(findCommitted(SUBJECT_TEST_ID).props.nativeID).toBe('from-id');
    }
  });

  // RN's TWF passes `aria-*` to the child RAW and lets the child View fold them. We fold on the
  // owner instead, which the engine's own fold at `fabricProps` cannot do — it reads the node being
  // committed, and these props are on a node that never commits.
  it('folds the owner’s aria aliases, which the engine’s own fold cannot see', () => {
    const { root, owner, child, surface } = mountIdentified({
      'aria-label': 'Close',
      'aria-hidden': true,
      'aria-live': 'off',
      'aria-valuenow': 4,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(committed.props.accessibilityLabel).toBe('Close');
    expect(committed.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
    expect(committed.props.accessibilityElementsHidden).toBe(true);
    expect(committed.props.accessibilityLiveRegion).toBe('none');
    expect(committed.props.accessibilityValue).toEqual({ now: 4 });
    expect(Object.keys(committed.props)).not.toContain('aria-label');
  });

  // The responder is the CHILD's, and it has to be: `bubble` (events/index.ts) skips anchors for
  // listener lookup and `handOverNativeResponder` has no Fabric handle for an uncommitted node.
  it('runs the press machine on the child, off callbacks written on the owner', () => {
    const onPress = vi.fn();
    const onPressIn = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      onPress,
      onPressIn,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    expect(owner.listeners?.get('pressIn')).toBeUndefined();
    pressIn(child, touchAt(4, 5));
    expect(onPressIn).toHaveBeenCalledTimes(1);

    listenerOf(child, 'press')(touchAt(4, 5));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // :190 hands Pressability `minPressDuration: 0`. Without it the press machine's 130 ms floor
  // defers `onPressOut`, and no timer is advanced here, so the floor shows up as a callback that
  // never ran.
  it('releases with no deactivation floor', () => {
    const onPressOut = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      onPress: () => {},
      onPressOut,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    pressIn(child, touchAt(1, 1));
    listenerOf(child, 'press')(touchAt(1, 1));
    listenerOf(child, 'pressOut')(touchAt(1, 1));
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  // :186 — the press machine does not own `delayPressIn`, so the tag layers `../state/touchable`'s
  // scheduler on top. This is the capability the deleted wrappers had and TNF's behavior does not.
  it('defers onPressIn by delayPressIn', () => {
    const onPressIn = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      delayPressIn: 100,
      onPressIn,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    pressIn(child, touchAt(2, 2));
    expect(onPressIn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  // :188, the other half of the pair.
  it('defers onPressOut by delayPressOut', () => {
    const onPressOut = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      delayPressOut: 50,
      onPress: () => {},
      onPressOut,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    pressIn(child, touchAt(2, 2));
    listenerOf(child, 'press')(touchAt(2, 2));
    listenerOf(child, 'pressOut')(touchAt(2, 2));
    expect(onPressOut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  // A deferred press-out outlives the tree that armed it, so the owner's teardown has to cancel it.
  it('cancels a deferred press-out when the owner is removed', () => {
    const onPressOut = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      delayPressOut: 50,
      onPress: () => {},
      onPressOut,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    pressIn(child, touchAt(2, 2));
    listenerOf(child, 'pressOut')(touchAt(2, 2));
    engineRemove(root, owner);
    surface.commit();

    vi.advanceTimersByTime(50);
    expect(onPressOut).not.toHaveBeenCalled();
  });

  // The one shape `appendChild`'s own dirtying does not cover: an ALREADY-COMMITTED node moved into
  // the owner writes no prop, so without the adoption's `markPropsDirty` the clone never runs and
  // the moved child keeps the payload it had outside.
  it('clones onto a child MOVED in from elsewhere, which writes no prop', () => {
    const { root, owner, child, surface } = mountIdentified({
      accessibilityLabel: 'Save',
    });
    const stranger = nodeFor('view');
    routeProp(stranger, 'backgroundColor', 'blue');
    engineAppend(root, owner);
    engineAppend(owner, child);
    engineAppend(root, stranger);
    surface.commit();
    expect(
      Object.keys(findCommitted(ROOT_TEST_ID).children[1].props),
    ).not.toContain('accessibilityLabel');

    engineRemove(root, stranger);
    engineRemove(owner, child);
    engineAppend(owner, stranger);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].props.backgroundColor).toBe('blue');
    expect(committedRoot.children[0].props.accessibilityLabel).toBe('Save');
  });

  it('re-clones when an owner prop changes after mount', () => {
    const { root, owner, child, surface } = mountIdentified({
      accessibilityLabel: 'Before',
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).props.accessibilityLabel).toBe(
      'Before',
    );

    routeProp(owner, 'accessibilityLabel', 'After');
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).props.accessibilityLabel).toBe(
      'After',
    );
  });

  // Vue's order: children mount before props are patched. A prop redirect would have been correct
  // here and wrong in `mount`; the fold is correct in both.
  it('clones props written AFTER the child was inserted', () => {
    const { root, owner, child, surface } = mountIdentified();
    engineAppend(root, owner);
    engineAppend(owner, child);
    routeProp(owner, 'accessibilityLabel', 'Late');
    surface.commit();

    expect(findCommitted(SUBJECT_TEST_ID).props.accessibilityLabel).toBe(
      'Late',
    );
  });

  // `focusable` is a function of a LISTENER, and a listener flip dirties no payload by itself.
  it('re-clones focusable when onPress is wired after mount', () => {
    const { root, owner, child, surface } = mountIdentified();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).props.focusable).toBe(false);

    routeProp(owner, 'onPress', () => {});
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).props.focusable).toBe(true);
  });

  // :151. A Fabric BOOLEAN-GATED event, so the flag must land on the CHILD — the only node with a
  // native view — and only while the app has one wired.
  it('forwards onLayout onto the child, gate flag and all', () => {
    const onLayout = vi.fn();
    const { root, owner, child, surface } = mountIdentified();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(Object.keys(findCommitted(SUBJECT_TEST_ID).props)).not.toContain(
      'onLayout',
    );

    routeProp(owner, 'onLayout', onLayout);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).props.onLayout).toBe(true);
    listenerOf(child, 'layout')(touchAt(0, 0));
    expect(onLayout).toHaveBeenCalledTimes(1);

    routeProp(owner, 'onLayout', undefined);
    surface.commit();
    // `null`, not absent: Fabric MERGES a clone's prop diff, so `diffProps` (commit.ts) spells a
    // removed key as an explicit null and the committed record keeps it. The listener going with it
    // is the half an app can observe.
    expect(findCommitted(SUBJECT_TEST_ID).props.onLayout).toBeNull();
    expect(child.listeners?.get('layout')).toBeUndefined();
  });

  // :152-153, the pair TNF drops. Not gate-flagged, so the observable is the listener alone.
  it('forwards onBlur and onFocus onto the child, which TNF does not clone', () => {
    const onBlur = vi.fn();
    const onFocus = vi.fn();
    const { root, owner, child, surface } = mountIdentified({
      onBlur,
      onFocus,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    listenerOf(child, 'blur')(touchAt(0, 0));
    listenerOf(child, 'focus')(touchAt(0, 0));
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  // TWF installs no drawable, so neither RIPPLE slot may be written and neither view command may be
  // dispatched — on EITHER platform, unlike TNF whose Android arm does both.
  it('writes no ripple background and dispatches no view command', () => {
    const { root, owner, child, surface } = mountIdentified({
      onPress: () => {},
      // RN's TWF has no `background` prop at all; a stray one must not resurrect TNF's fold.
      background: { type: 'RippleAndroid', color: '#fff', borderless: false },
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    fabric.commands.length = 0;

    const committed = findCommitted(SUBJECT_TEST_ID);
    for (const absent of [
      'nativeBackgroundAndroid',
      'nativeForegroundAndroid',
      'background',
    ])
      expect(Object.keys(committed.props)).not.toContain(absent);

    pressIn(child, touchAt(3, 3));
    listenerOf(child, 'pressOut')(touchAt(3, 3));
    expect(fabric.commands).toHaveLength(0);
  });

  // Removing the single child must leave the tag ready for the next one.
  it('accepts a replacement child after the first is removed', () => {
    const { root, owner, child, surface } = mountIdentified({
      accessibilityLabel: 'Hi',
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    engineRemove(owner, child);
    const replacement = nodeFor('view');
    // A prop RN does NOT clone, so it identifies the replacement past the owner's own `testID`.
    routeProp(replacement, 'backgroundColor', 'blue');
    engineAppend(owner, replacement);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].props.backgroundColor).toBe('blue');
    expect(committedRoot.children[0].props.accessibilityLabel).toBe('Hi');
    expect(countNodes(committedRoot)).toBe(2);
  });

  // THE CONTROL. Without a registration the tag is a bare anchor: the child still commits (an anchor
  // flattens whether or not a behavior is attached), so the NODE COUNT cannot witness registration —
  // the CLONE is what does. Every assertion above is therefore answering the behavior, not the
  // anchor.
  it('clones nothing and attaches nothing when the behavior is not registered', () => {
    clearHostBehaviors();
    const { root, owner, child, surface } = mountIdentified({
      accessibilityLabel: 'Save',
      onPress: () => {},
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(countNodes(committedRoot)).toBe(2);
    const committed = committedRoot.children[0];
    for (const absent of ['accessibilityLabel', 'focusable', 'testID'])
      expect(Object.keys(committed.props)).not.toContain(absent);
    expect(child.listeners?.get('pressIn')).toBeUndefined();
  });
});
