// A falsy `<Show>` costs NO native node, and exactly ONE retained anchor.
//
// Written for the benchmark's `with-input` arm (2026-08-31). That arm appends a `<TextInput>` to
// the row under a `<Show>`, and the plain arm's acceptance criterion is that its Fabric counters
// stay BYTE-IDENTICAL to every number recorded before the arm existed. `createNode` is what the
// acceptance check reads, so the retained side has to be asked separately or a placeholder living
// only in the retained tree would pass it and still cost a C++ node per row.
//
// That is not hypothetical — it is precisely what Svelte pays. Its retained tree carried 23 006
// nodes against every other adapter's 9 001, of which 14 004 were block anchors, and `{#if}` was
// worth two of them per site (`svelte-adapter-dom-shim` §32).
//
// THE ONE ANCHOR IS STRUCTURAL, not a leak, which is why it is pinned rather than driven to zero:
// solid-js/universal's `cleanChildren` needs a node holding the position of a dynamic expression
// or the siblings after it reorder, and `createTextNode('')` maps to an engine anchor because an
// empty RCTRawText would actually paint (`renderer.ts`). Pinning it at one still fails the way
// Svelte's `{#if}` would: two anchors, or a renderable node, breaks the assertion.
//
// This file read GREEN until 2026-09-14 while asserting zero, because `costOf` censused
// `fabric.committed` — the COMMITTED tree, which cannot hold an anchor by construction. The
// retained half was never measured at all.
import { describe, expect, it } from 'vitest';
import { Show } from 'solid-js';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree } from '@symbiote-native/engine';
import { mount, unmount } from './render';

const fabric = installFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Native creates, retained nodes and retained anchors for one mounted tree. */
async function costOf(
  root: number,
  render: () => unknown,
): Promise<{ created: number; retained: number; anchors: number }> {
  const before = fabric.counts.createNode;
  const surface = mount(root, render as never);
  await flush();
  const created = fabric.counts.createNode - before;
  // The SURFACE's top-level nodes, which are engine nodes. This used to hand `fabric.committed` in
  // through a cast, and it read plausibly because a fake Fabric node and a retained node both had a
  // `children` field — so the census walked the COMMITTED tree and reported it as the retained one.
  // Which is the exact opposite of what this file is about: the committed tree cannot contain an
  // anchor, by construction, so a placeholder in the retained tree was invisible to it. Caught when
  // `node.children` was deleted and the cast started reading `undefined`
  // (`.claude/rules/test-harness-false-greens.md` §11 — the harness built the subject wrong, and it
  // worked only because two unrelated shapes shared a field name).
  const census = censusRetainedTree(surface.children);
  unmount(root);
  return { created, retained: census.nodes, anchors: census.anchors };
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

    // Native is the half the benchmark's acceptance check reads, and it must be untouched.
    expect(withFalsyShow.created).toBe(plain.created);
    // Retained grows by the placeholder and by nothing else — asserted as an ANCHOR, so a renderable
    // node slipping in reads as a failure rather than as the same count.
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

    expect(withTruthyShow.created).toBeGreaterThan(plain.created);
    expect(withTruthyShow.retained).toBeGreaterThan(plain.retained);
  });
});
