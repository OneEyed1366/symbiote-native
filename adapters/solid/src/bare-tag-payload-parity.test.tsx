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
//
// ── THE TWO ARMS HAVE CONVERGED, AND THAT IS NOT FIXABLE HERE (noticed 2026-09-18) ───────────────
//
// This file's own paragraph above predicted it: "once `View` is a string, there is no component left
// to compare against". That day arrived — `adapters/solid/src/components/` holds no `text` or `view`
// component, only `*-props.ts` — so `payloadOf(WRAPPER_ROOT, () => <text …/>)` and
// `payloadOf(TAG_ROOT, () => <text …/>)` mount the SAME intrinsic twice. Every remaining case
// compares a payload with itself and can no longer go red for the reason it was written.
//
// It is not a false green of the ordinary kind — the comparison DID its job, before and after the
// switch, and the record is in the git history. It is a test that has outlived its subject, the same
// shape as the three `id` cases collapsed on 2026-09-18 ("a loop whose arms have converged reports
// agreement with itself"). The repair is to collapse each case to a single-arm ABSOLUTE assertion
// naming the keys the layer now produces — which `tag-folds.test.tsx` already does, and which the
// Text case below has had done to it. The other seven have not, and are left standing rather than
// silently weakened in a commit that is about something else.

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

  // why: RN's two Text defaults left this case on 2026-09-18 — the header's row for them said "the
  // renderer" and the answer is "the engine" now, keyed on the component and asserted in
  // `core/engine/cpp/tests/js/committed-payload.itest.ts`. This harness has no copy of that rule, so
  // asserting the values here would assert the headless builder instead of the device.
  //
  // What is left that this adapter decides is the COMPONENT and the authored passthrough, so that is
  // what it says — absolutely, in the shape `tag-folds.test.tsx` uses, rather than by comparing two
  // arms. See this describe block's closing note on why the comparison no longer discriminates.
  it('Text: commits under the component the engine keys its rule on', async () => {
    const tag = await payloadOf(TAG_ROOT, () => <text numberOfLines={1} />);

    expect(tag.view).toBe('RCTText');
    expect(tag.payload.numberOfLines).toBe(1);
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
