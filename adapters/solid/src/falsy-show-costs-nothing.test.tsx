// A falsy `<Show>` costs NO native node, and exactly ONE retained anchor.
//
// For the benchmark's `with-input` arm (a `<TextInput>` under a `<Show>`): the plain arm's
// acceptance criterion is its Fabric counters stay BYTE-IDENTICAL. `createNode` is all that
// reads, so the retained side is asked here — a placeholder invisible to it still costs a node.
//
// The one anchor is structural, not a leak: solid-js/universal's `cleanChildren` needs a node
// holding the position of a dynamic expression or the siblings after it reorder, and
// `createTextNode('')` maps to an engine anchor because an empty RCTRawText would paint
// (`renderer.ts`).
import { describe, expect, it } from 'vitest';
import { Show } from 'solid-js';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

installRecordingFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Native nodes, retained nodes and retained anchors for one mounted tree. */
async function costOf(
  root: number,
  render: () => unknown,
): Promise<{ native: number; retained: number; anchors: number }> {
  const surface = mount(root, render as never);
  await flush();
  // The SURFACE's top-level nodes, which are engine nodes. This used to hand `fabric.committed` in
  // through a cast, and it read plausibly because a stand-in Fabric node and a retained node both
  // had a `children` field — so the census walked the COMMITTED tree and reported it as the
  // retained one. Which is the exact opposite of what this file is about: the committed tree cannot
  // contain an anchor, by construction, so a placeholder in the retained tree was invisible to it.
  // Caught when `node.children` was deleted and the cast started reading `undefined`
  // (`.claude/rules/test-harness-false-greens.md` §11 — the harness built the subject wrong, and it
  // worked only because two unrelated shapes shared a field name).
  //
  // "Native" used to be a `createNode` CALL count off the stand-in. It is the non-anchor count now,
  // and the swap is a strengthening rather than a translation: a call count is satisfied by a node
  // that was created and then removed, while this asks what the tree still holds. Both readings are
  // the engine's own — `isAnchor` is what the commit walk itself consults.
  const census = censusLive(...surface.children);
  unmount(root);
  return {
    native: census.nonAnchors,
    retained: census.nodes,
    anchors: census.anchors,
  };
}

describe('a falsy <Show> in a row', () => {
  it('adds no native node, and one anchor for the position it holds', async () => {
    const plain = await costOf(9500, () => (
      <view>
        <text>a</text>
      </view>
    ));
    const withFalsyShow = await costOf(9501, () => (
      <view>
        <text>a</text>
        <Show when={false}>
          <text>b</text>
        </Show>
      </view>
    ));

    // The half the benchmark's acceptance check reads.
    expect(withFalsyShow.native).toBe(plain.native);
    // Asserted as an ANCHOR too, so a renderable node taking the position reads as a failure
    // rather than as the same count.
    expect(withFalsyShow.retained).toBe(plain.retained + 1);
    expect(withFalsyShow.anchors).toBe(plain.anchors + 1);
  });

  // Break-test: the comparison above is only meaningful if `costOf` can report a DIFFERENCE. A
  // truthy Show must move both numbers, or an oracle that always returned the same pair would read
  // as "costs nothing" for any conditional at all.
  it('costs both when the condition is true', async () => {
    const plain = await costOf(9502, () => (
      <view>
        <text>a</text>
      </view>
    ));
    const withTruthyShow = await costOf(9503, () => (
      <view>
        <text>a</text>
        <Show when={true}>
          <text>b</text>
        </Show>
      </view>
    ));

    expect(withTruthyShow.native).toBeGreaterThan(plain.native);
    expect(withTruthyShow.retained).toBeGreaterThan(plain.retained);
  });
});
