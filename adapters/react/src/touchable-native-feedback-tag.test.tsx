// THE HEADLINE OF THE WRAPPER DELETION, measured through React's own reconciler: a
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
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what clones the owner's props onto the child. An app reaches
// it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_930;
const fabric = installFabric();

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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('touchable-native-feedback as a tag', () => {
  it('commits NO node of its own: one child in, one node out', () => {
    mount(
      ROOT_TAG,
      createElement(
        'view',
        { nativeID: 'root' },
        createElement(
          'touchable-native-feedback',
          { accessibilityLabel: 'Save', nativeID: 'tnf' },
          createElement('view', {}),
        ),
      ),
    );

    const subtree = subtreeOf('root');
    expect(subtree.map(node => node.viewName)).toEqual(['RCTView']);
  });

  // why: the count above is satisfied by an unregistered tag too — an anchor commits nothing on its
  // own. This is the arm that fails when the registration is missing.
  it('clones the owner’s props onto that one child', () => {
    mount(
      ROOT_TAG,
      createElement(
        'view',
        { nativeID: 'root' },
        createElement(
          'touchable-native-feedback',
          { accessibilityLabel: 'Save', nativeID: 'tnf', testID: 'probe' },
          createElement('view', { testID: 'ignored' }),
        ),
      ),
    );

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
