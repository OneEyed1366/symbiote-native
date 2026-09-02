// Branch-local proof for primitives-as-tags item 2: a BARE INTRINSIC commits the same Fabric
// payload as the wrapper component, for the same authored props.
//
// It is a payload diff and nothing else — `Object.keys` of the committed node, sorted, plus every
// value. That is the only oracle that survives the wrapper being deleted: once `View` is a string,
// there is no component left to compare against, so the comparison has to be recorded BEFORE the
// switch and re-run after it (`.claude/rules/verify-the-deciding-side.md` — a verification is a
// timestamp).
//
// What each case is actually testing is which LAYER supplies a fold the wrapper does today:
//   id -> nativeID        the renderer (foldAliasKey), not the wrapper's splitProps
//   aria-* / role         the engine (fabricProps -> foldAriaProps), not resolveAccessibilityProps
//   Text defaults         the renderer (seedTextDefaults / foldTextValue), not resolveTextProps
//   onLayout's flag       the engine's GATED_EVENT_PROPS, on both paths
//
// A row that goes red here names the layer that has not caught up, which is the whole reason to
// diff payloads rather than assert individual keys.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { Text } from './components/text';
import { View } from './components/view';
import type { JSX } from './jsx-runtime';

const WRAPPER_ROOT = 8_701;
const TAG_ROOT = 8_702;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(WRAPPER_ROOT);
  unmount(TAG_ROOT);
});

// The app's own view sits under the synthetic box-none AppContainer root.
function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

// Mounts one tree, waits for the microtask-coalesced commit, and takes the payload. Each arm gets
// its own root and its own reset so the two commits cannot see each other.
async function payloadOf(
  rootTag: number,
  tree: () => JSX.Element,
): Promise<{ view: string; props: Record<string, unknown> }> {
  fabric.reset();
  mount(rootTag, tree);
  await tick();
  const node = appView();
  return { view: node.viewName, props: { ...node.props } };
}

function keysOf(props: Record<string, unknown>): string[] {
  return Object.keys(props).sort();
}

describe('a bare intrinsic commits the wrapper payload', () => {
  it('View: the id fold, the aria fold and a gated event all survive the wrapper', async () => {
    // `role` and `aria-*` are the interesting half: the wrapper runs resolveAccessibilityProps in
    // its body, and the bare tag has no body at all — so an equal payload here is the engine's
    // fold doing that work, not a coincidence of these particular keys.
    const props = {
      id: 'hero',
      testID: 'probe',
      role: 'button',
      'aria-label': 'Save',
      'aria-disabled': true,
      style: { opacity: 0.5 },
      onLayout: () => undefined,
    };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <View {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <symbiote-view {...props} />);

    expect(tag.view).toBe(wrapper.view);
    expect(keysOf(tag.props)).toEqual(keysOf(wrapper.props));
    expect(tag.props).toEqual(wrapper.props);
    // Pinned, not merely equal: two payloads that are both missing the fold would also be equal.
    expect(wrapper.props.nativeID).toBe('hero');
    expect(wrapper.props.id).toBeUndefined();
    expect(wrapper.props.onLayout).toBe(true);
  });

  it('View: no id and no nativeID leaves the SAME key set on both paths', async () => {
    // The wrapper emits `nativeID` unconditionally (undefined when neither is set) and the tag
    // emits no such key at all. They agree only because setProp collapses an undefined write to
    // absence — asserted here rather than assumed (.claude/rules/fabric-boolean-event-gates.md).
    const props = { testID: 'plain' };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <View {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <symbiote-view {...props} />);

    expect(keysOf(tag.props)).toEqual(keysOf(wrapper.props));
    expect(keysOf(wrapper.props)).not.toContain('nativeID');
  });

  it('Text: the two defaults reach the bare tag from the renderer', async () => {
    const props = { numberOfLines: 1 };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <Text {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <symbiote-text {...props} />);

    expect(tag.view).toBe(wrapper.view);
    expect(keysOf(tag.props)).toEqual(keysOf(wrapper.props));
    expect(tag.props).toEqual(wrapper.props);
    expect(wrapper.props.ellipsizeMode).toBe('tail');
    expect(wrapper.props.allowFontScaling).toBe(true);
  });

  it('Text: allowFontScaling={false} is the case a plain ?? would get wrong', async () => {
    const props = { allowFontScaling: false, ellipsizeMode: 'clip' };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <Text {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <symbiote-text {...props} />);

    expect(tag.props).toEqual(wrapper.props);
    expect(tag.props.allowFontScaling).toBe(false);
    expect(tag.props.ellipsizeMode).toBe('clip');
  });
});
