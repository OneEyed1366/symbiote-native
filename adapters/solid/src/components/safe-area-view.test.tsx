// Solid twin of adapters/react/src/components/safe-area-view/safe-area-view.test.tsx. Drives REAL
// compiled Solid JSX through the universal renderer into the fake Fabric slot.
//
// SCOPE: SafeAreaView has no core/components half — no reducer, no renderSafeAreaView (see the
// component's header), so this file is its complete coverage rather than a wiring proof.
// resolveAccessibilityProps and routeProp's class/style merge are shared engine infra with their
// own tests; here they are only proven to be reached from a real committed node.
//
// Three cases have no counterpart in the React file, and they are the point of this one. Solid
// runs a component body ONCE, so "a prop changed after mount", "a child appeared after mount" and
// "a prop KEY that vanished got cleared" are silently-breakable claims here rather than
// tautologies a reconciler makes true for free.
//
// No Negative group: the component has no conditional and nothing throws — an invalid child is
// the renderer's contract, already covered in view.test.tsx.

import { createSignal, Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the tag's fold lives in its behavior, and only this module installs it. An
// app reaches it through the package barrel; a test importing the renderer directly does not.
import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 8_202;
const SAFE_AREA = 'SafeAreaView';
const TEST_ID = 'safe-area';
const ACCESSIBILITY_LABEL = 'screen';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Reads the LIVE tree, never the recording — the record holds a node as it was CREATED, with its
// props frozen at that moment, so anything asserted after an update has to come off the live child
// links (symbiote-engine-core §8).
function committed(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

function safeArea(): ILiveNode {
  const node = committed(n => n.viewName === SAFE_AREA);
  if (node === undefined) throw new Error('no SafeAreaView was committed');
  return node;
}

describe('Solid SafeAreaView on the engine', () => {
  // why: the product contract IS the distinct native view name — the host applies the insets to
  // `SafeAreaView`, so a silent degrade to a plain RCTView would look identical in JS and lose
  // the notch inset on device.
  it('commits its own SafeAreaView intrinsic wrapping its children', async () => {
    mount(ROOT_TAG, () => (
      <safe-area-view testID={TEST_ID}>
        <view />
      </safe-area-view>
    ));
    await tick();

    expect(
      live
        .nodeOf(live.appRoot())
        .children.map(child => live.serialize(child.handle))
        .join(''),
    ).toBe('SafeAreaView(RCTView)');
  });

  // why: SafeAreaView has no JS-side layout math of its own, so a caller's style must reach the
  // real node unmodified for the native host to apply — and children must nest UNDER it rather
  // than beside it, or they never get inset at all.
  it('flattens style onto the safe-area node and nests children', async () => {
    mount(ROOT_TAG, () => (
      <safe-area-view style={{ flex: 1, backgroundColor: '#fff' }}>
        <view />
      </safe-area-view>
    ));
    await tick();

    expect(safeArea().payload.flex).toBe(1);
    expect(safeArea().payload.backgroundColor).toBe('#fff');
    expect(safeArea().children).toHaveLength(1);
    expect(safeArea().children[0].viewName).toBe('RCTView');
  });

  // why: testID/accessibilityLabel/accessible are the cross-component contract every primitive
  // honors for testing and a11y tooling — SafeAreaView must not swallow them while folding the
  // bag through resolveAccessibilityProps.
  it('passes the standard ViewProps through to the safe-area node', async () => {
    mount(ROOT_TAG, () => (
      <safe-area-view
        testID={TEST_ID}
        accessibilityLabel={ACCESSIBILITY_LABEL}
        accessible={true}
      />
    ));
    await tick();

    expect(safeArea().payload.testID).toBe(TEST_ID);
    expect(safeArea().payload.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(safeArea().payload.accessible).toBe(true);
  });

  // why: Fabric only measures and fires layout for a node explicitly flagged onLayout:true, and
  // the handler itself must never reach the slot as a function prop (folly::dynamic crashes
  // Android on one). Both are routeProp's doing, which is why the bag reaches it unsplit.
  it('routes onLayout as a topLayout event and raises the flag', async () => {
    let layoutFired = false;
    mount(ROOT_TAG, () => (
      <safe-area-view
        onLayout={() => {
          layoutFired = true;
        }}
      />
    ));
    await tick();

    expect(safeArea().payload.onLayout).toBe(true);
    fabric.fireEvent(safeArea().instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });

  // why: closes the other branch — omitting onLayout must leave no stray key on the node, which
  // would otherwise ask native to measure a view nobody is listening to.
  it('omits onLayout from the committed node when the prop is not passed', async () => {
    mount(ROOT_TAG, () => <safe-area-view testID={TEST_ID} />);
    await tick();

    expect('onLayout' in safeArea().payload).toBe(false);
  });

  // why: Solid runs a component body ONCE. Every prop read sits inside the bag accessor precisely
  // so a later change still reaches the host node; one destructure at setup would freeze the view
  // at its mount-time props while every other test in this file still passed.
  it('re-commits the same native node when a prop changes after mount', async () => {
    const [label, setLabel] = createSignal('before');
    mount(ROOT_TAG, () => <safe-area-view accessibilityLabel={label()} />);
    await tick();
    // Node IDENTITY rather than a creation count: a rebuild that netted out even would satisfy a
    // count, and the identity moving is what the case is about.
    const hostAtMount = safeArea().handle;
    expect(safeArea().payload.accessibilityLabel).toBe('before');

    setLabel('after');
    await tick();

    expect(safeArea().payload.accessibilityLabel).toBe('after');
    expect(safeArea().handle, 'the host node kept its identity').toBe(
      hostAtMount,
    );
  });

  // why: the children accessor is handed to the renderer's `insert`, not read once at setup — a
  // child that only appears later (any <Show>, <For> or conditional) would otherwise never reach
  // the screen, and no static-paint test would notice.
  it('mounts a child that first appears after mount', async () => {
    const [shown, setShown] = createSignal(false);
    mount(ROOT_TAG, () => (
      <safe-area-view>
        <Show when={shown()}>
          <view testID="late" />
        </Show>
      </safe-area-view>
    ));
    await tick();
    expect(committed(n => n.payload.testID === 'late')).toBeUndefined();

    setShown(true);
    await tick();

    expect(committed(n => n.payload.testID === 'late')).toBeDefined();
  });

  // why: Solid's spread walks only the CURRENT key set and has no removal pass, and
  // resolveAccessibilityProps emits `accessibilityLabel` only while an aria alias holds a VALUE.
  // Without the withStableKeys widening the folded key simply vanishes from the bag and a screen
  // reader keeps announcing a label the app already removed — green in every other test here.
  it('clears a folded accessibility prop when its aria alias goes undefined', async () => {
    const [label, setLabel] = createSignal<string | undefined>('screen');
    mount(ROOT_TAG, () => <safe-area-view aria-label={label()} />);
    await tick();
    expect(safeArea().payload.accessibilityLabel).toBe('screen');

    setLabel(undefined);
    await tick();

    // `null`, not absent: a key the node held last commit and no longer has goes to Fabric as
    // literal null so the native setter resets to its default (diffProps, symbiote-engine-core
    // §8). Without the widening this reads back the stale 'screen'.
    // ABSENT, not null: the literal null was the CLONE PROTOCOL's spelling of "reset to the
    // default", held only inside the diff the stand-in merged. The engine's op stream says the
    // same thing with `NO_VALUE`, and a host replaying that op deletes the key.
    expect(Object.hasOwn(safeArea().payload, 'accessibilityLabel')).toBe(false);
    // …and the half that proves the engine ACTED: the record carried the label after the mount
    // above, so its being gone from the record means a clearing op was sent for it.
    const recorded = fabric.find(node => node.viewName === SAFE_AREA);
    expect(Object.hasOwn(recorded?.props ?? {}, 'accessibilityLabel')).toBe(
      false,
    );
  });
});
