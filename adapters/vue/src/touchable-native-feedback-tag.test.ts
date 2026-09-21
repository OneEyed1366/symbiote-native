// THE HEADLINE OF THE WRAPPER DELETION, measured through Vue's own renderer: a
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
//
// `h(tag, …)` rather than an SFC because this repo compiles SFCs in Metro, not in vitest — and at
// runtime a string tag is an element on both Vue paths, so nothing about element-vs-component is
// being dodged here (`intrinsic-tags.cjs` is what answers that at COMPILE time, and it derives the
// answer from the same spec entry this tag now has).
import { defineComponent, h, type VNode } from '@vue/runtime-core';
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

const ROOT_TAG = 9_931;
const fabric = installRecordingFabric();
// The tag commits NO view of its own, so its anchor flattens here exactly as the commit walk
// flattens it — which is the claim this file makes.
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

async function mountTree(render: () => VNode): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => render }));
  await tick();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('touchable-native-feedback as a tag', () => {
  it('commits NO node of its own: one child in, one node out', async () => {
    await mountTree(() =>
      h('view', { nativeID: 'root' }, [
        h(
          'touchable-native-feedback',
          { accessibilityLabel: 'Save', nativeID: 'tnf' },
          [h('view')],
        ),
      ]),
    );

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
    await mountTree(() =>
      h('view', { nativeID: 'root' }, [
        h(
          'touchable-native-feedback',
          { accessibilityLabel: 'Save', nativeID: 'tnf', onLayout: () => {} },
          [h('view', {})],
        ),
      ]),
    );

    const [child] = subtreeOf('root');
    expect(child.payload.onLayout).toBe(true);
  });
});
