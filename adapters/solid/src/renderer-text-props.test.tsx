// What the Solid renderer contributes to a `<text>` tag's props: the FORWARDING, not the
// defaulting — that's `foldTextDefaults` in `SymbioteFabricProps.cpp`, where null/undefined/absent
// are alike, so no adapter needs to know about it (`committed-payload.itest.ts`).
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

    // Not redundant with the line below — the harness canary. If prop-level reactivity on an
    // intrinsic ever goes dead (two solid-js builds loaded at once; see
    // vitest.config.ts's SOLID_TRANSFORM), the clear below passes for the wrong reason.
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
