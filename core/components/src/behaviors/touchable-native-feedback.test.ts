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
// undefined ones — so a TNF with no testID CLEARS its child's. That clearing is the rule's and is
// asserted in `clone-onto-child-payload.itest.ts`; here the id is only the ordinary shape an app
// writes, and `subject()` finds the child by position instead.
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

/**
 * The committed CHILD, by POSITION rather than by the `testID` the owner clones onto it.
 *
 * It was `findCommitted(SUBJECT_TEST_ID)` until 2026-09-18, and that stopped working the day the
 * clone moved to `foldCloneOntoChild` in C++: this host builds its payloads through the TypeScript
 * `fabricProps`, which carries no copy of the tag rules. Position is what the tag guarantees anyway
 * — one child in, one node out.
 */
function subject(): ILiveNode {
  const child = findCommitted(ROOT_TEST_ID).children[0];
  if (child === undefined) throw new Error('the owner committed no child');
  return child;
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
    expect(countNodes(committedRoot)).toBe(2);
  });

  // `insertBefore` is how Vue and Svelte spell an insert, and it carries its OWN copy of the
  // adoption notify. Without this case that copy is unwitnessed — two entry points, one covered,
  // which is the shape `verify-the-deciding-side.md` calls an unmeasured guard.
  it('adopts a child inserted with insertBefore, not only appendChild', () => {
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineInsertBefore(owner, child, null);
    surface.commit();

    expect(countNodes(findCommitted(ROOT_TEST_ID))).toBe(2);
    expect(owner.childHost).toBe(child);
  });

  // WHAT THE CLONE PUTS ON THE CHILD LEFT THIS FILE ON 2026-09-18 — RN's unconditional prop list,
  // the four computed values (`accessible`, `focusable`, `nativeID`, `accessibilityState`), the aria
  // fold over the owner's bag and the `id` precedence. All of it is `foldCloneOntoChild` in
  // `SymbioteFabricProps.cpp`, asserted against the committed payload in
  // `core/engine/cpp/tests/js/clone-onto-child-payload.itest.ts`.
  //
  // They could not stay: this host builds its payloads through the TypeScript `fabricProps`, which
  // deliberately carries no copy of the tag rules — the property that makes it sound for everything
  // else is what blinds it here. What stays is what is still JS: the SHAPE, adoption, the press
  // machine, the view commands and the listener forwarding.

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

  // TouchableNativeFeedback.js:214-221 resolves `disabled != null ? disabled : (aria-disabled ??
  // accessibilityState.disabled)` for the OWNER's Pressability config — the press machine lives on
  // the CHILD and reads the OWNER (`attachPressMachine`'s `source`), so a real touch must be
  // dispatched THERE (`symbiote-rn-parity-sweep` lesson: clone-onto-child components fire on the
  // child, not the owner).
  it.each([
    ['aria-disabled', 'aria-disabled', true],
    ['accessibilityState.disabled', 'accessibilityState', { disabled: true }],
  ])('suppresses the press from %s alone', (_name, prop, value) => {
    const onPress = vi.fn();
    const { root, owner, child, surface } = mount({ onPress, [prop]: value });
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();

    listenerOf(child, 'pressIn')(touchAt(2, 2));
    listenerOf(child, 'startShouldSetResponder')(touchAt(2, 2));
    listenerOf(child, 'press')(touchAt(2, 2));
    listenerOf(child, 'pressOut')(touchAt(2, 2));

    expect(onPress).not.toHaveBeenCalled();
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

  // THE DIRTYING CASES LEFT THIS FILE ON 2026-09-18 — a late owner write, a late listener flip, and
  // Vue's children-before-props order. The dirtying is still JS (`SLOT_DERIVED`,
  // `onOwnedListenerChange`), but the only way to SEE it is the payload the rule produces, which
  // this host cannot build. They live in `clone-onto-child-payload.itest.ts` with the rule.

  // :386-387. Both are Fabric BOOLEAN-GATED events, so the flag must land on the CHILD — the only
  // node with a native view — and only while the app has one wired.
  it('forwards onLayout onto the child, gate flag and all', () => {
    const onLayout = vi.fn();
    const { root, owner, child, surface } = mount();
    engineAppend(root, owner);
    engineAppend(owner, child);
    surface.commit();
    expect(Object.keys(subject().payload)).not.toContain('onLayout');

    routeProp(owner, 'onLayout', onLayout);
    surface.commit();
    expect(subject().payload.onLayout).toBe(true);
    listenerOf(child, 'layout')(touchAt(0, 0));
    expect(onLayout).toHaveBeenCalledTimes(1);

    routeProp(owner, 'onLayout', undefined);
    surface.commit();
    // ABSENT, not null, and the change of spelling is a correction rather than a weakening. The
    // literal null was the CLONE PROTOCOL's way of saying "reset this to its default" — it existed
    // only inside the diff the stand-in merged, and no other consumer ever saw it. The engine's op
    // stream says the same thing with `NO_VALUE`, and a host replaying that op DELETES the key.
    expect(Object.hasOwn(subject().payload, 'onLayout')).toBe(false);
    // The half that proves the engine ACTED rather than merely stopping: the record carried
    // `onLayout` after the write above, so the key being gone from it means a clearing op was sent.
    const recorded = fabric.find(node => node.tag === subject().tag);
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

    const committed = subject();
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
    // A prop RN does NOT clone, so the replacement is identifiable whatever the rule writes over it.
    routeProp(replacement, 'backgroundColor', 'blue');
    engineAppend(owner, replacement);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].payload.backgroundColor).toBe('blue');
    expect(countNodes(committedRoot)).toBe(2);
    // ADOPTED, which is what this case is about — the owner tracks the replacement, so the rule has
    // a parent to read on its commit. What it then WRITES is the itest's.
    expect(owner.childHost).toBe(replacement);
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
