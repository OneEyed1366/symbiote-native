// TouchableNativeFeedback as a TAG, iOS half. The headline claim is a NODE COUNT: RN's TNF renders
// no view of its own (TouchableNativeFeedback.js:289,339), so a TNF wrapping one View must commit
// ONE node, where all five of our wrappers commit three.
//
// The Android half — the ripple background and the two view commands — is
// `touchable-native-feedback-android.test.ts`, because `Platform.OS` is read at module load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../test-utils/src/index';
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
import { registerTouchableNativeFeedbackBehavior } from './touchable-native-feedback';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 7600;

const ROOT_TEST_ID = 'root';
// ON THE OWNER, not the child, and that placement is itself the RN contract: `testID` is one of the
// props TNF clones (:389), and React's `cloneElement` assigns every key of its config INCLUDING the
// undefined ones — so a TNF with no testID CLEARS its child's. `subject()` therefore finds the
// committed child by the OWNER's id. Pinned by its own case below.
const SUBJECT_TEST_ID = 'subject';

function touchAt(x: number, y: number): ISymbioteEvent {
  return { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y } };
}

function nodeFor(intrinsic: 'view' | 'touchable-native-feedback') {
  const descriptor = descriptorFor(intrinsic);
  return createElement(descriptor.component, descriptor.isText, intrinsic);
}

/**
 * `<view testID=root><touchable-native-feedback …><view testID=child …/></…></view>`.
 *
 * OWNER PROPS ARE WRITTEN BEFORE THE CHILD IS APPENDED, which is React's and Solid's order and the
 * reason the clone is a payload FOLD rather than a prop redirect: a redirect would have nowhere to
 * put a prop written at this point. `writesAfterInsert` covers Vue's opposite order.
 */
function mount(
  ownerProps: Readonly<Record<string, unknown>> = {},
  childProps: Readonly<Record<string, unknown>> = {},
) {
  const root = nodeFor('view');
  routeProp(root, 'testID', ROOT_TEST_ID);
  const owner = nodeFor('touchable-native-feedback');
  routeProp(owner, 'testID', SUBJECT_TEST_ID);
  for (const [key, value] of Object.entries(ownerProps))
    routeProp(owner, key, value);
  const child = nodeFor('view');
  for (const [key, value] of Object.entries(childProps))
    routeProp(child, key, value);

  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(root);
  return { root, owner, child, surface };
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

function findCommitted(testID: string): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

function countNodes(node: ILiveNode): number {
  return 1 + node.children.reduce((sum, kid) => sum + countNodes(kid), 0);
}

beforeEach(() => {
  vi.useFakeTimers();
  // `reset()` rather than clearing `commands` alone: every case opens its OWN surface, and
  // `appRoot()` searches the CREATION log, so without this it answers with the first case's root
  // for the rest of the file.
  fabric.reset();
  registerTouchableNativeFeedbackBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('touchable-native-feedback host behavior', () => {
  // THE HEADLINE. Two nodes total — the root and the child — because the tag itself commits none.
  // Counted rather than eyeballed: the child assertions prove the SHAPE, the count proves nothing
  // extra is hiding beside it.
  it('commits NO node of its own: one child in, one node out', () => {
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].viewName).toBe('RCTView');
    expect(committedRoot.children[0].payload.testID).toBe(SUBJECT_TEST_ID);
    expect(countNodes(committedRoot)).toBe(2);
  });

  // `insertBefore` is how Vue and Svelte spell an insert, and it carries its OWN copy of the
  // adoption notify. Without this case that copy is unwitnessed — two entry points, one covered,
  // which is the shape `verify-the-deciding-side.md` calls an unmeasured guard.
  it('adopts a child inserted with insertBefore, not only appendChild', () => {
    const { root, owner, child, surface } = mount({
      accessibilityLabel: 'Save',
    });
    engineAppend(root, owner);
    engineInsertBefore(owner, child, null);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(countNodes(committedRoot)).toBe(2);
    expect(committedRoot.children[0].payload.accessibilityLabel).toBe('Save');
  });

  it('clones RN’s prop list onto the child and leaves the rest behind', () => {
    const { root, owner, child, surface } = mount(
      {
        accessibilityLabel: 'Save',
        accessibilityRole: 'button',
        accessibilityHint: 'Saves the draft',
        hitSlop: 8,
        nextFocusDown: 12,
        // NOT in RN's clone list (:342-390): a TNF declares no style prop, and this one stays on a
        // node that never commits.
        opacity: 0.25,
      },
      { backgroundColor: 'red' },
    );
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(committed.payload.accessibilityLabel).toBe('Save');
    expect(committed.payload.accessibilityRole).toBe('button');
    expect(committed.payload.accessibilityHint).toBe('Saves the draft');
    expect(committed.payload.hitSlop).toBe(8);
    expect(committed.payload.nextFocusDown).toBe(12);
    // The child's own props survive where the clone list does not name them.
    expect(committed.payload.backgroundColor).toBe('red');
    expect(Object.keys(committed.payload)).not.toContain('opacity');
  });

  it('computes accessible, focusable, nativeID and accessibilityState', () => {
    const { root, owner, child, surface } = mount({
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
    expect(committed.payload.accessible).toBe(true);
    // :373 — `id` wins over `nativeID` unconditionally.
    expect(committed.payload.nativeID).toBe('from-id');
    // :369-372 — an onPress is present but `disabled` is true.
    expect(committed.payload.focusable).toBe(false);
    // :324-330 — the explicit `disabled` overrides, and the rest of the state survives.
    expect(committed.payload.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    // A machine-only prop must not ride into the payload as a key no ViewConfig declares.
    expect(Object.keys(committed.payload)).not.toContain('disabled');
  });

  // why: the owner is an ANCHOR — its props never reach Fabric — so `id` has to arrive on the
  // CHILD or it is lost, and `id` beats a `nativeID` written beside it (:373).
  //
  // This ran over TWO arms until 2026-09-18, the second one `foldHostBag(TAG, authored)`, because
  // the adapters renamed in three different places and the answer had to survive all of them. There
  // is one place now, `routeProp`, which both arms already crossed — so the second arm had become
  // the first arm spelled longer, and a loop that mounts one bag twice reports agreement with
  // itself.
  it('lands the owner’s id on the child, with id winning', () => {
    const { root, owner, child, surface } = mount({
      id: 'from-id',
      nativeID: 'losing-value',
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    expect(findCommitted(SUBJECT_TEST_ID).payload.nativeID).toBe('from-id');
  });

  it('folds the owner’s aria aliases, which the engine’s own fold cannot see', () => {
    const { root, owner, child, surface } = mount({
      'aria-label': 'Close',
      'aria-hidden': true,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(committed.payload.accessibilityLabel).toBe('Close');
    expect(committed.payload.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
    expect(committed.payload.accessibilityElementsHidden).toBe(true);
    expect(Object.keys(committed.payload)).not.toContain('aria-label');
  });

  // The responder is the CHILD's, and it has to be: `bubble` (events/index.ts) skips anchors for
  // listener lookup and `handOverNativeResponder` has no Fabric handle for an uncommitted node, so
  // a press machine left on the tag could never fire.
  it('runs the press machine on the child, off callbacks written on the owner', () => {
    const onPress = vi.fn();
    const onPressIn = vi.fn();
    const { root, owner, child, surface } = mount({ onPress, onPressIn });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    expect(owner.listeners?.get('pressIn')).toBeUndefined();
    listenerOf(child, 'pressIn')(touchAt(4, 5));
    listenerOf(child, 'startShouldSetResponder')(touchAt(4, 5));
    expect(onPressIn).toHaveBeenCalledTimes(1);

    listenerOf(child, 'press')(touchAt(4, 5));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // TouchableNativeFeedback.js:226 hands Pressability `minPressDuration: 0` UNCONDITIONALLY — not
  // inside an Android branch. Without it the machine's 130 ms deactivation floor defers pressOut,
  // and no timer is advanced here, so the floor shows up as a callback that never ran.
  it('releases with no deactivation floor', () => {
    const onPressOut = vi.fn();
    const { root, owner, child, surface } = mount({
      onPress: () => {},
      onPressOut,
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    listenerOf(child, 'pressIn')(touchAt(1, 1));
    listenerOf(child, 'startShouldSetResponder')(touchAt(1, 1));
    listenerOf(child, 'press')(touchAt(1, 1));
    listenerOf(child, 'pressOut')(touchAt(1, 1));
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('re-clones when an owner prop changes after mount', () => {
    const { root, owner, child, surface } = mount({
      accessibilityLabel: 'Before',
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).payload.accessibilityLabel).toBe(
      'Before',
    );

    routeProp(owner, 'accessibilityLabel', 'After');
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).payload.accessibilityLabel).toBe(
      'After',
    );
  });

  // Vue's order: children mount before props are patched. A prop redirect would have been correct
  // here and wrong in `mount`; the fold is correct in both.
  it('clones props written AFTER the child was inserted', () => {
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineAppend(owner, child);
    routeProp(owner, 'accessibilityLabel', 'Late');
    surface.commit();

    expect(findCommitted(SUBJECT_TEST_ID).payload.accessibilityLabel).toBe(
      'Late',
    );
  });

  // `focusable` is a function of a LISTENER, and a listener flip dirties no payload by itself.
  it('re-clones focusable when onPress is wired after mount', () => {
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).payload.focusable).toBe(false);

    routeProp(owner, 'onPress', () => {});
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).payload.focusable).toBe(true);
  });

  // :386-387. Both are Fabric BOOLEAN-GATED events, so the flag must land on the CHILD — the only
  // node with a native view — and only while the app has one wired.
  it('forwards onLayout onto the child, gate flag and all', () => {
    const onLayout = vi.fn();
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(Object.keys(findCommitted(SUBJECT_TEST_ID).payload)).not.toContain(
      'onLayout',
    );

    routeProp(owner, 'onLayout', onLayout);
    surface.commit();
    expect(findCommitted(SUBJECT_TEST_ID).payload.onLayout).toBe(true);
    listenerOf(child, 'layout')(touchAt(0, 0));
    expect(onLayout).toHaveBeenCalledTimes(1);

    routeProp(owner, 'onLayout', undefined);
    surface.commit();
    // ABSENT, not null, and the change of spelling is a correction rather than a weakening. The
    // literal null was the CLONE PROTOCOL's way of saying "reset this to its default" — it existed
    // only inside the diff the stand-in merged, and no other consumer ever saw it. The engine's op
    // stream says the same thing with `NO_VALUE`, and a host replaying that op DELETES the key.
    expect(
      Object.hasOwn(findCommitted(SUBJECT_TEST_ID).payload, 'onLayout'),
    ).toBe(false);
    // The half that proves the engine ACTED rather than merely stopping: the record carried
    // `onLayout` after the write above, so the key being gone from it means a clearing op was sent.
    const recorded = fabric.find(node => node.props.testID === SUBJECT_TEST_ID);
    expect(Object.hasOwn(recorded?.props ?? {}, 'onLayout')).toBe(false);
    expect(child.listeners?.get('layout')).toBeUndefined();
  });

  // Off Android `getBackgroundProp` returns null (:402), so neither slot is written at all.
  it('writes no ripple background on iOS and dispatches no view command', () => {
    const { root, owner, child, surface } = mount({ onPress: () => {} });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    fabric.commands.length = 0;

    const committed = findCommitted(SUBJECT_TEST_ID);
    expect(Object.keys(committed.payload)).not.toContain(
      'nativeBackgroundAndroid',
    );
    expect(Object.keys(committed.payload)).not.toContain(
      'nativeForegroundAndroid',
    );

    listenerOf(child, 'pressIn')(touchAt(3, 3));
    listenerOf(child, 'startShouldSetResponder')(touchAt(3, 3));
    listenerOf(child, 'pressOut')(touchAt(3, 3));
    expect(fabric.commands).toHaveLength(0);
  });

  // Removing the single child must leave the tag ready for the next one. Without the engine's
  // `childHost` clear in `removeChild`, the removal is redirected INTO the node being removed, the
  // splice misses, and the replacement nests inside an orphan that never commits again.
  it('accepts a replacement child after the first is removed', () => {
    const { root, owner, child, surface } = mount({ accessibilityLabel: 'Hi' });
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
    expect(committedRoot.children[0].payload.backgroundColor).toBe('blue');
    expect(committedRoot.children[0].payload.accessibilityLabel).toBe('Hi');
    expect(countNodes(committedRoot)).toBe(2);
  });

  // React's `cloneElement` assigns every key of its config, undefined ones included, so RN's TNF
  // genuinely clears a child prop it does not carry itself. Reproduced rather than avoided: a fold
  // that skipped undefined would be a divergence from upstream with nothing to show for it.
  it('clears a cloned child prop the owner does not carry', () => {
    const { root, owner, child, surface } = mount({}, { testID: 'mine' });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children[0].payload.testID).toBe(SUBJECT_TEST_ID);
  });

  // THE CONTROL. Without a registration the tag is a bare anchor: the child still commits (an
  // anchor flattens whether or not a behavior is attached), but nothing is cloned and no press
  // machine exists — so every assertion above is answering the behavior and not the anchor.
  it('clones nothing and attaches nothing when the behavior is not registered', () => {
    clearHostBehaviors();
    const { root, owner, child, surface } = mount({
      accessibilityLabel: 'Save',
      onPress: () => {},
    });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    const committed = committedRoot.children[0];
    expect(Object.keys(committed.payload)).not.toContain('accessibilityLabel');
    expect(Object.keys(committed.payload)).not.toContain('focusable');
    expect(Object.keys(committed.payload)).not.toContain('testID');
    expect(child.listeners?.get('pressIn')).toBeUndefined();
  });
});
