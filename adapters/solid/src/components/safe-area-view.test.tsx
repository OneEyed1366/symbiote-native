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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { SafeAreaView } from './safe-area-view';
import { View } from './view';

const ROOT_TAG = 8_202;
const SAFE_AREA = 'SafeAreaView';
const TEST_ID = 'safe-area';
const ACCESSIBILITY_LABEL = 'screen';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// Reads the LIVE committed tree, never `fabric.created` — a created node's props are frozen at
// first commit, so anything asserted after an update has to come off the committed child set
// (symbiote-engine-core §8).
function committed(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

function safeArea(): IFakeNode {
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
      <SafeAreaView testID={TEST_ID}>
        <View />
      </SafeAreaView>
    ));
    await tick();

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'SafeAreaView(RCTView)',
    );
  });

  // why: SafeAreaView has no JS-side layout math of its own, so a caller's style must reach the
  // real node unmodified for the native host to apply — and children must nest UNDER it rather
  // than beside it, or they never get inset at all.
  it('flattens style onto the safe-area node and nests children', async () => {
    mount(ROOT_TAG, () => (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View />
      </SafeAreaView>
    ));
    await tick();

    expect(safeArea().props.flex).toBe(1);
    expect(safeArea().props.backgroundColor).toBe('#fff');
    expect(safeArea().children).toHaveLength(1);
    expect(safeArea().children[0].viewName).toBe('RCTView');
  });

  // why: testID/accessibilityLabel/accessible are the cross-component contract every primitive
  // honors for testing and a11y tooling — SafeAreaView must not swallow them while folding the
  // bag through resolveAccessibilityProps.
  it('passes the standard ViewProps through to the safe-area node', async () => {
    mount(ROOT_TAG, () => (
      <SafeAreaView
        testID={TEST_ID}
        accessibilityLabel={ACCESSIBILITY_LABEL}
        accessible={true}
      />
    ));
    await tick();

    expect(safeArea().props.testID).toBe(TEST_ID);
    expect(safeArea().props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(safeArea().props.accessible).toBe(true);
  });

  // why: Fabric only measures and fires layout for a node explicitly flagged onLayout:true, and
  // the handler itself must never reach the slot as a function prop (folly::dynamic crashes
  // Android on one). Both are routeProp's doing, which is why the bag reaches it unsplit.
  it('routes onLayout as a topLayout event and raises the flag', async () => {
    let layoutFired = false;
    mount(ROOT_TAG, () => (
      <SafeAreaView
        onLayout={() => {
          layoutFired = true;
        }}
      />
    ));
    await tick();

    expect(safeArea().props.onLayout).toBe(true);
    fabric.fireEvent(safeArea().instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });

  // why: closes the other branch — omitting onLayout must leave no stray key on the node, which
  // would otherwise ask native to measure a view nobody is listening to.
  it('omits onLayout from the committed node when the prop is not passed', async () => {
    mount(ROOT_TAG, () => <SafeAreaView testID={TEST_ID} />);
    await tick();

    expect('onLayout' in safeArea().props).toBe(false);
  });

  // why: Solid runs a component body ONCE. Every prop read sits inside the bag accessor precisely
  // so a later change still reaches the host node; one destructure at setup would freeze the view
  // at its mount-time props while every other test in this file still passed.
  it('re-commits the same native node when a prop changes after mount', async () => {
    const [label, setLabel] = createSignal('before');
    mount(ROOT_TAG, () => <SafeAreaView accessibilityLabel={label()} />);
    await tick();
    const createdAtMount = fabric.counts.createNode;
    expect(safeArea().props.accessibilityLabel).toBe('before');

    setLabel('after');
    await tick();

    expect(safeArea().props.accessibilityLabel).toBe('after');
    expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
      createdAtMount,
    );
  });

  // why: the children accessor is handed to the renderer's `insert`, not read once at setup — a
  // child that only appears later (any <Show>, <For> or conditional) would otherwise never reach
  // the screen, and no static-paint test would notice.
  it('mounts a child that first appears after mount', async () => {
    const [shown, setShown] = createSignal(false);
    mount(ROOT_TAG, () => (
      <SafeAreaView>
        <Show when={shown()}>
          <View testID="late" />
        </Show>
      </SafeAreaView>
    ));
    await tick();
    expect(committed(n => n.props.testID === 'late')).toBeUndefined();

    setShown(true);
    await tick();

    expect(committed(n => n.props.testID === 'late')).toBeDefined();
  });

  // why: Solid's spread walks only the CURRENT key set and has no removal pass, and
  // resolveAccessibilityProps emits `accessibilityLabel` only while an aria alias holds a VALUE.
  // Without the withStableKeys widening the folded key simply vanishes from the bag and a screen
  // reader keeps announcing a label the app already removed — green in every other test here.
  it('clears a folded accessibility prop when its aria alias goes undefined', async () => {
    const [label, setLabel] = createSignal<string | undefined>('screen');
    mount(ROOT_TAG, () => <SafeAreaView aria-label={label()} />);
    await tick();
    expect(safeArea().props.accessibilityLabel).toBe('screen');

    setLabel(undefined);
    await tick();

    // `null`, not absent: a key the node held last commit and no longer has goes to Fabric as
    // literal null so the native setter resets to its default (diffProps, symbiote-engine-core
    // §8). Without the widening this reads back the stale 'screen'.
    expect(safeArea().props.accessibilityLabel).toBeNull();
  });
});
