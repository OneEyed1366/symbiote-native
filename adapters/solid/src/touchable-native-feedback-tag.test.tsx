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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what clones the owner's props onto the child. An app reaches
// it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_932;
const fabric = installFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

/** Everything committed under the labelled root, the root itself excluded. */
function subtreeOf(label: string): IFakeNode[] {
  const root = flatten(fabric.appRoot().children).find(
    node => node.props.nativeID === label,
  );
  if (root === undefined) throw new Error(`no committed root ${label}`);
  return flatten(root.children);
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
  it('clones the owner’s props onto that one child', async () => {
    await mountTree(() => (
      <view nativeID="root">
        <touchable-native-feedback
          accessibilityLabel="Save"
          nativeID="tnf"
          testID="probe"
        >
          <view testID="ignored" />
        </touchable-native-feedback>
      </view>
    ));

    const [child] = subtreeOf('root');
    expect(child.props).toMatchObject({
      accessibilityLabel: 'Save',
      // :373 — the owner's `id`/`nativeID`, not the child's.
      nativeID: 'tnf',
      // :389 — `testID` is cloned, so the OWNER's wins over whatever the child declared.
      testID: 'probe',
    });
  });
});
