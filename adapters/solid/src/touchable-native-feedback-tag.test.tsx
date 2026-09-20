// THE HEADLINE OF THE WRAPPER DELETION, measured through Solid's own renderer: a
// `<touchable-native-feedback>` wrapping one view commits ONE node, where the wrapper it replaced
// committed THREE (a `Pressable` view, a feedback view, and the app's own child). RN's TNF renders
// nothing at all — it clones onto `React.Children.only(children)`
// (TouchableNativeFeedback.js:289,339) — so the wrapper's two extra nodes were ours.
//
// TWO INDEPENDENT CONSEQUENCES OF ONE CAUSE, and that is deliberate
// (`.claude/rules/test-harness-false-greens.md` §14): the COUNT alone cannot witness the
// registration, because the tag resolves to the engine's anchor and commits nothing whether or not
// a behavior is attached. The CLONE is what proves `./register` ran. Break-tested by dropping
// `registerTouchableNativeFeedbackBehavior()` from `./register`: the count stays 1 and the clone
// case fails on `nativeID`/`accessibilityLabel` being undefined.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'solid-js';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what clones the owner's props onto the child. An app reaches
// it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_932;
const fabric = installRecordingFabric();
// The tag commits NO view of its own, so its anchor flattens here exactly as the commit walk
// flattens it — which is the claim this file makes.
const live = createLiveTree(fabric);

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function flatten(root: ILiveNode): ILiveNode[] {
  return root.children.flatMap(node => [node, ...flatten(node)]);
}

/** Everything committed under the labelled root, the root itself excluded. */
function subtreeOf(label: string): ILiveNode[] {
  const root = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (root === undefined) throw new Error(`no committed root ${label}`);
  return flatten(root);
}

async function mountTree(tree: Component): Promise<void> {
  mount(ROOT_TAG, tree);
  await flush();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('touchable-native-feedback as a tag', () => {
  it('commits NO node of its own: one child in, one node out', async () => {
    await mountTree(() => (
      <view nativeID="root">
        <touchable-native-feedback accessibilityLabel="Save" nativeID="tnf">
          <view />
        </touchable-native-feedback>
      </view>
    ));

    expect(subtreeOf('root').map(node => node.viewName)).toEqual(['RCTView']);
  });

  // why: the count above is satisfied by an unregistered tag too — an anchor commits nothing on its
  // own. This is the arm that fails when the registration is missing.
  // THE WITNESS CHANGED ON 2026-09-18 and the case did not. It used to be the CLONE, which moved to
  // `foldCloneOntoChild` in C++ and which this host cannot run — it builds its payloads through the
  // TypeScript `fabricProps`, carrying no copy of the tag rules. `onLayout` is the same KIND of
  // claim and is still JS: RN clones it as a LISTENER (`:386`), the behavior's `FORWARDED_LISTENERS`
  // carries it, and being a Fabric BOOLEAN-GATED event it shows up in the payload as `true`.
  it('forwards the owner’s listener onto that one child', async () => {
    await mountTree(() => (
      <view nativeID="root">
        <touchable-native-feedback
          accessibilityLabel="Save"
          nativeID="tnf"
          onLayout={() => {}}
        >
          <view />
        </touchable-native-feedback>
      </view>
    ));

    const [child] = subtreeOf('root');
    expect(child.payload.onLayout).toBe(true);
  });

  // why: the clone case above proves the PROPS bridge; it does not prove a real touch on the child
  // actually reaches the owner's `onPress` through Solid's wiring — the press machine runs on the
  // child (core/components/src/behaviors/touchable-native-feedback.test.ts), so a touch dispatched
  // anywhere but there would silently prove nothing.
  it('fires the owner’s onPress from a real touch on the cloned child', async () => {
    let presses = 0;
    await mountTree(() => (
      <view nativeID="root">
        <touchable-native-feedback
          nativeID="tnf"
          onPress={() => (presses += 1)}
        >
          <view />
        </touchable-native-feedback>
      </view>
    ));

    const [child] = subtreeOf('root');
    fabric.fireEvent(child.instanceHandle, 'topTouchStart', {});
    fabric.fireEvent(child.instanceHandle, 'topTouchEnd', {});

    expect(presses).toBe(1);
  });
});
