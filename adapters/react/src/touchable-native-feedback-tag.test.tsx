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
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what clones the owner's props onto the child. An app reaches
// it through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_930;
const fabric = installRecordingFabric();
// The tag commits NO view of its own, so its anchor flattens here exactly as the commit walk
// flattens it — which is the claim this file makes.
const live = createLiveTree(fabric);

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
  //
  // THE WITNESS CHANGED ON 2026-09-18 and the case did not. It used to be the CLONE — the owner's
  // `accessibilityLabel`/`nativeID`/`testID` arriving on the child — and that moved to
  // `foldCloneOntoChild` in C++, which this host cannot run: it builds its payloads through the
  // TypeScript `fabricProps`, which carries no copy of the tag rules.
  //
  // `onLayout` is the replacement and it is the same KIND of claim: the owner declares it, the child
  // is the only node with a native view, and RN clones it as a LISTENER (`:386`) — so the behavior's
  // `FORWARDED_LISTENERS` is what carries it across, which is still JS. It is also a Fabric
  // BOOLEAN-GATED event, so a forwarded listener is visible in the payload as `true` rather than
  // only in a stash. Break-tested the same way: drop `registerTouchableNativeFeedbackBehavior()`
  // from `./register` and the count stays 1 while this goes undefined.
  it('forwards the owner’s listener onto that one child', () => {
    mount(
      ROOT_TAG,
      createElement(
        'view',
        { nativeID: 'root' },
        createElement(
          'touchable-native-feedback',
          { accessibilityLabel: 'Save', nativeID: 'tnf', onLayout: () => {} },
          createElement('view', {}),
        ),
      ),
    );

    const [child] = subtreeOf('root');
    expect(child.payload.onLayout).toBe(true);
  });
});
