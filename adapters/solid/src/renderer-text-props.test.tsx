// What the Solid renderer contributes to a `<text>` tag's props — which, as of 2026-09-18, is the
// FORWARDING and not the defaulting.
//
// This file used to test RN's two Text defaults, through three successive shapes in the renderer: a
// create-time seed, a substitute-on-`undefined`, and finally a fold per key (because `?? 'tail'` has
// to catch a null too). All three are gone. The rule reads the authored bag at payload time
// (`foldTextDefaults`, `SymbioteFabricProps.cpp`) where a null, an explicit `undefined` and an absent
// prop are alike, so no adapter needs to know about it — and `core/engine/cpp/tests/js/
// committed-payload.itest.ts` carries every claim this file used to make, read off a real payload
// instead of off the headless builder's copy of the rule.
//
// WHAT COULD NOT MOVE, and is the whole reason this file still exists: the CLEAR. A default arriving
// is the engine's business, but whether a Solid signal going back to `undefined` reaches the engine
// AS a clear is this renderer's, and no itest drives Solid's reactivity. The harness canary in the
// middle of it is load-bearing for a reason recorded below.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 9_488;
const TEXT_VIEW = 'RCTText';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The LIVE tree, never the recording: a created node's props are frozen at its first commit, so an
// update assertion off the record passes forever (symbiote-engine-core §8).
function committedTextProps(): Record<string, unknown> | undefined {
  return live.findLive(live.appRoot(), node => node.viewName === TEXT_VIEW)
    ?.payload;
}

describe('what the Solid renderer sends a text tag', () => {
  // why: the engine's rule is keyed on the COMPONENT, so the one thing an adapter has to get right
  // is committing a `<text>` as `RCTText`. Everything the defaults used to prove here follows from
  // it, and this is the precondition rather than a restatement of the rule.
  it('commits a text tag under the component the rule is keyed on', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <text numberOfLines={1}>clipped</text>
      </view>
    ));
    await tick();
    expect(committedTextProps()).toBeDefined();
  });

  // why: an authored value has to REACH the engine untouched, which is the half of the old
  // "explicit beats the default" case that is still this renderer's. Whether it then survives the
  // rule is `committed-payload.itest.ts`'s.
  it('forwards an authored value rather than folding it', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <text ellipsizeMode="clip" allowFontScaling={false}>
          x
        </text>
      </view>
    ));
    await tick();
    const props = committedTextProps();
    expect(props?.ellipsizeMode).toBe('clip');
    expect(props?.allowFontScaling).toBe(false);
  });

  // why: THE case no itest can reach, because it needs a framework to CLEAR a prop it set earlier.
  // Solid re-runs setProp when the accessor's value changes, so a prop going back to `undefined` is
  // an explicit clear — and this renderer used to SWALLOW that clear, substituting the default. It
  // must forward it instead: the engine cannot tell a cleared prop from one never written, and that
  // is exactly why it is allowed to default both.
  it('forwards a clear instead of substituting for it', async () => {
    const [mode, setMode] = createSignal<string | undefined>('clip');
    mount(ROOT_TAG, () => (
      <view>
        <text ellipsizeMode={mode()}>x</text>
      </view>
    ));
    await tick();
    expect(committedTextProps()?.ellipsizeMode).toBe('clip');

    // Not redundant with the line below — it is the harness canary. Prop-level reactivity on an
    // intrinsic was DEAD in this repo's vitest solid project until 2026-08-23 (two solid-js builds
    // loaded at once, so signals and the renderer's effects lived in different runtimes; see
    // vitest.config.ts's SOLID_TRANSFORM). With it dead, the clear assertion below passes for the
    // wrong reason: nothing updates, so nothing clears. This step fails first and says so.
    setMode('head');
    await tick();
    expect(committedTextProps()?.ellipsizeMode, 'defined -> defined').toBe(
      'head',
    );

    setMode(undefined);
    await tick();
    expect(committedTextProps()?.ellipsizeMode).toBeUndefined();
  });
});
