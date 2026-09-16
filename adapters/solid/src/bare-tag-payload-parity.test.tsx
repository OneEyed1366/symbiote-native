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
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import type { JSX } from './jsx-runtime';

const WRAPPER_ROOT = 8_701;
const TAG_ROOT = 8_702;

const fabric = installRecordingFabric();
// The payload is what an app can observe; the author's bag is not.
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(WRAPPER_ROOT);
  unmount(TAG_ROOT);
});

// The app's own view sits under the synthetic box-none AppContainer root.
function appView(): ILiveNode {
  return live.nodeOf(live.appRoot()).children[0];
}

// Mounts one tree, waits for the microtask-coalesced commit, and takes the payload. Each arm gets
// its own root and its own reset so the two commits cannot see each other.
async function payloadOf(
  rootTag: number,
  tree: () => JSX.Element,
): Promise<{ view: string; payload: Record<string, unknown> }> {
  fabric.reset();
  mount(rootTag, tree);
  await tick();
  const node = appView();
  return { view: node.viewName, payload: { ...node.payload } };
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

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <view {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <view {...props} />);

    expect(tag.view).toBe(wrapper.view);
    expect(keysOf(tag.payload)).toEqual(keysOf(wrapper.payload));
    expect(tag.payload).toEqual(wrapper.payload);
    // Pinned, not merely equal: two payloads that are both missing the fold would also be equal.
    expect(wrapper.payload.nativeID).toBe('hero');
    expect(wrapper.payload.id).toBeUndefined();
    expect(wrapper.payload.onLayout).toBe(true);
  });

  it('View: no id and no nativeID leaves the SAME key set on both paths', async () => {
    // The wrapper emits `nativeID` unconditionally (undefined when neither is set) and the tag
    // emits no such key at all. They agree only because setProp collapses an undefined write to
    // absence — asserted here rather than assumed (.claude/rules/fabric-boolean-event-gates.md).
    const props = { testID: 'plain' };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <view {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <view {...props} />);

    expect(keysOf(tag.payload)).toEqual(keysOf(wrapper.payload));
    expect(keysOf(wrapper.payload)).not.toContain('nativeID');
  });

  it('Text: the two defaults reach the bare tag from the renderer', async () => {
    const props = { numberOfLines: 1 };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <text {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <text {...props} />);

    expect(tag.view).toBe(wrapper.view);
    expect(keysOf(tag.payload)).toEqual(keysOf(wrapper.payload));
    expect(tag.payload).toEqual(wrapper.payload);
    expect(wrapper.payload.ellipsizeMode).toBe('tail');
    expect(wrapper.payload.allowFontScaling).toBe(true);
  });

  it('Text: allowFontScaling={false} is the case a plain ?? would get wrong', async () => {
    const props = { allowFontScaling: false, ellipsizeMode: 'clip' };

    const wrapper = await payloadOf(WRAPPER_ROOT, () => <text {...props} />);
    const tag = await payloadOf(TAG_ROOT, () => <text {...props} />);

    expect(tag.payload).toEqual(wrapper.payload);
    expect(tag.payload.allowFontScaling).toBe(false);
    expect(tag.payload.ellipsizeMode).toBe('clip');
  });
});
