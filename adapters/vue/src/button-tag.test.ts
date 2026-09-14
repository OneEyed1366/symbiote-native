// `button` as a TAG, measured through Vue's own renderer. RN's Button takes no children (`title` is
// a string prop, Button.js:363) and builds a touchable > view > text subtree itself, so the wrapper
// this replaces was composition the engine behavior now owns
// (`core/components/src/behaviors/button.ts`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike `touchable-native-feedback-tag.test.ts`'s,
// whose tag commits nothing whether or not a behavior is attached. An unregistered `button` commits
// ONE bare view with no children, so the subtree assertion fails on the registration alone — and
// the payload assertions fail with it, which is the two-consequences-of-one-cause shape
// (`.claude/rules/test-harness-false-greens.md` §14).
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the subtree. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_973;
const fabric = installFabric();

// RN Button.js's iOS label look, owned by `buttonTextStyle` in @symbiote-native/components. MARGIN,
// not padding (Button.js:409) — the label pushes the button's edges outward instead of insetting.
const DEFAULT_BLUE = '#007AFF';
const DISABLED_GREY = '#cdcdcd';
const LABEL_MARGIN = 8;

// Vue batches its commits on a microtask, so the tree is not there on the next line.
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

/** The committed host, found by the `nativeID` its `id` folded into. */
function hostOf(label: string): IFakeNode {
  const host = flatten(fabric.appRoot().children).find(
    node => node.props.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

function mountTag(props: Record<string, unknown>): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => () => h('button', props) }));
  return settle();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: `button` as a tag', () => {
  it('commits RN’s four-node iOS subtree and paints the title', async () => {
    await mountTag({ id: 'btn', title: 'Save' });

    // RN's FOUR nodes on iOS, in order and by view name — the host (TouchableOpacity's own
    // Animated.View, which the tag IS), the inner view carrying the Material look on Android and
    // nothing here, the Text, and the raw text. Three of them exist only because the behavior built
    // them, so this is what fails when `./register` is dropped.
    //
    // Android commits THREE — TouchableNativeFeedback renders no view of its own, so the inner view
    // IS the host (Button.js:281-284). Asserted in
    // `core/components/src/behaviors/button-android.test.ts`, the only place with a Platform mock;
    // the branch is the behavior's, not this adapter's.
    const host = hostOf('btn');
    expect(host.viewName).toBe('RCTView');
    expect(host.props.accessibilityRole).toBe('button');
    expect(flatten(host.children).map(node => node.viewName)).toEqual([
      'RCTView',
      'RCTText',
      'RCTRawText',
    ]);

    const text = host.children[0].children[0];
    expect(text.props.color).toBe(DEFAULT_BLUE);
    expect(text.props.margin).toBe(LABEL_MARGIN);
    // RN's Text.js defaults, which a hand-written host tag inherits from nothing — without them a
    // long label clips mid-word instead of ellipsising, on device only.
    expect(text.props.ellipsizeMode).toBe('tail');
    expect(text.children[0].props.text).toBe('Save');
  });

  // why: `disabled` greys the label and wins over an explicit `color` (Button.js pushes the
  // disabled colour after the tint), and it lands on the a11y state so a screen reader announces it.
  it('greys the label over an explicit color and announces itself disabled', async () => {
    await mountTag({
      id: 'btn',
      title: 'Go',
      color: '#ff0000',
      disabled: true,
    });

    const host = hostOf('btn');
    expect(host.props.accessibilityState).toMatchObject({ disabled: true });
    expect(host.children[0].children[0].props.color).toBe(DISABLED_GREY);
  });
});
