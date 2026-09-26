// TouchableWithoutFeedback as a TAG. The headline claim is a NODE COUNT: RN's TWF renders no view
// of its own (TouchableWithoutFeedback.js:229,286), so a TWF wrapping one View must commit ONE
// node, where all five of our wrappers committed two.
//
// No Android half, unlike `touchable-native-feedback.test.ts`: TWF has no `Platform.OS` branch at
// all — no ripple background, no view commands — so one file covers both platforms, and the
// "commits no ripple" case below is what pins that rather than a second file.
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
import { registerTouchableWithoutFeedbackBehavior } from './touchable-without-feedback';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 7800;

const ROOT_TEST_ID = 'root';
// On the OWNER, which is where an app puts it — `testID` is one of the props TWF clones. It is no
// longer how the child is FOUND (see `subject()`); it stays because a touchable carrying an id is
// the ordinary shape and the cases should mount the ordinary shape.
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

function findCommitted(testID: string): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

// The committed CHILD, by POSITION rather than a cloned `testID` — this host's payloads come
// from TypeScript `fabricProps`, which carries no copy of the C++ clone rule, so the owner's id
// never arrives. Position is what the tag guarantees anyway: one child in, one node out.
function subject(): ILiveNode {
  const child = findCommitted(ROOT_TEST_ID).children[0];
  if (child === undefined) throw new Error('the owner committed no child');
  return child;
}

function countNodes(node: ILiveNode): number {
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
  // `reset()` rather than clearing `commands` alone: every case opens its OWN surface, and
  // `appRoot()` searches the CREATION log, so without this it answers with the first case's root
  // for the rest of the file.
  fabric.reset();
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
    expect(countNodes(committedRoot)).toBe(2);
  });

  // `insertBefore` is how Vue and Svelte spell an insert, and it carries its OWN copy of the
  // adoption notify — two entry points, and only covering one leaves the other unwitnessed.
  it('adopts a child inserted with insertBefore, not only appendChild', () => {
    const { root, owner, child, surface } = mountIdentified();
    engineAppend(root, owner);
    engineInsertBefore(owner, child, null);
    surface.commit();

    expect(countNodes(findCommitted(ROOT_TEST_ID))).toBe(2);
  });

  // The clone (passthrough list, computed values, aria fold, `id` precedence, the when-set split
  // from TNF's unconditional list) is `foldCloneOntoChild` in C++, asserted in
  // `clone-onto-child-payload.itest.ts` — this host's `fabricProps` carries no copy of it.

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
  it('adopts a child MOVED in from elsewhere, which writes no prop', () => {
    const { root, owner, child, surface } = mountIdentified();
    const stranger = nodeFor('view');
    routeProp(stranger, 'backgroundColor', 'blue');
    engineAppend(root, owner);
    engineAppend(owner, child);
    engineAppend(root, stranger);
    surface.commit();

    engineRemove(root, stranger);
    engineRemove(owner, child);
    engineAppend(owner, stranger);
    surface.commit();

    const committedRoot = findCommitted(ROOT_TEST_ID);
    expect(committedRoot.children).toHaveLength(1);
    expect(committedRoot.children[0].payload.backgroundColor).toBe('blue');
    // WHAT THE OWNER PUT ON IT is the rule's, and the rule is in C++ — asserted in
    // `clone-onto-child-payload.itest.ts`. What this case owes is that the moved node is ADOPTED at
    // all: it writes no prop of its own, so without the adoption's `markPropsDirty` it would keep
    // the payload it had outside and never be folded.
    expect(child.hasCommitHook || owner.childHost === stranger).toBe(true);
  });

  // Dirtying (late owner write, late listener flip, Vue's children-before-props order) stays JS
  // (`SLOT_DERIVED`, `onOwnedListenerChange`), but only the payload the C++ rule produces shows
  // it, which this host can't build — those cases live in `clone-onto-child-payload.itest.ts`.

  // :151. A Fabric BOOLEAN-GATED event, so the flag must land on the CHILD — the only node with a
  // native view — and only while the app has one wired.
  it('forwards onLayout onto the child, gate flag and all', () => {
    const onLayout = vi.fn();
    const { root, owner, child, surface } = mountIdentified();
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
    const recorded = fabric.find(node => node.props.testID === SUBJECT_TEST_ID);
    expect(Object.hasOwn(recorded?.props ?? {}, 'onLayout')).toBe(false);
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

    const committed = subject();
    for (const absent of [
      'nativeBackgroundAndroid',
      'nativeForegroundAndroid',
      'background',
    ])
      expect(Object.keys(committed.payload)).not.toContain(absent);

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
    expect(committedRoot.children[0].payload.backgroundColor).toBe('blue');
    expect(countNodes(committedRoot)).toBe(2);
    // ADOPTED, which is what this case is about — the owner tracks the replacement, so the rule has
    // a parent to read on its commit. What the rule then WRITES is asserted in
    // `clone-onto-child-payload.itest.ts`.
    expect(owner.childHost).toBe(replacement);
  });

  // THE CONTROL, and its absence half is WEAKER than it was — recorded rather than quietly kept.
  // The three `not.toContain` lines used to say "no clone ran"; this host can no longer produce a
  // clone at all, so they now pass whether or not the behavior is registered. What still controls is
  // the LISTENER: an unregistered tag attaches no press machine, which is the half this harness
  // owns. The absence half lives in `clone-onto-child-payload.itest.ts`, where a missing rule is
  // distinguishable from a missing registration.
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
      expect(Object.keys(committed.payload)).not.toContain(absent);
    expect(child.listeners?.get('pressIn')).toBeUndefined();
  });
});
