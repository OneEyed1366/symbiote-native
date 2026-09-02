// A falsy `<Show>` must cost NOTHING — no native node, and no retained node either.
//
// Written for the benchmark's `with-input` arm (2026-08-31). That arm appends a `<TextInput>` to
// the row under a `<Show>`, and the plain arm's acceptance criterion is that its Fabric counters
// stay BYTE-IDENTICAL to every number recorded before the arm existed. A conditional that leaves a
// placeholder behind would break that silently: `createNode` is what the acceptance check reads,
// so a placeholder living only in the retained tree would pass it and still change `VISITED` and
// the reconcile walk on 1 000 rows.
//
// That is not hypothetical — it is precisely what Svelte pays. Its retained tree carried 23 006
// nodes against every other adapter's 9 001, of which 14 004 were block anchors, and `{#if}` was
// worth two of them per site (`svelte-adapter-dom-shim` §32). So the question is asked in BOTH
// dimensions rather than assumed from the native one.
import { describe, expect, it } from 'vitest';
import { Show } from 'solid-js';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree } from '@symbiote-native/engine';
import { mount, unmount } from './render';
import { View } from './components/view';
import { Text } from './components/text';

const fabric = installFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Native creates and retained nodes for one mounted tree. */
async function costOf(
  root: number,
  render: () => unknown,
): Promise<{ created: number; retained: number }> {
  const before = fabric.counts.createNode;
  mount(root, render as never);
  await flush();
  const created = fabric.counts.createNode - before;
  const retained = censusRetainedTree(
    fabric.committed as unknown as never,
  ).nodes;
  unmount(root);
  return { created, retained };
}

describe('a falsy <Show> in a row', () => {
  it('adds neither a native node nor a retained one', async () => {
    const plain = await costOf(9500, () => (
      <View>
        <Text>a</Text>
      </View>
    ));
    const withFalsyShow = await costOf(9501, () => (
      <View>
        <Text>a</Text>
        <Show when={false}>
          <Text>b</Text>
        </Show>
      </View>
    ));

    expect(withFalsyShow).toEqual(plain);
  });

  // Break-test: the comparison above is only meaningful if `costOf` can report a DIFFERENCE. A
  // truthy Show must move both numbers, or an oracle that always returned the same pair would read
  // as "costs nothing" for any conditional at all.
  it('costs both when the condition is true', async () => {
    const plain = await costOf(9502, () => (
      <View>
        <Text>a</Text>
      </View>
    ));
    const withTruthyShow = await costOf(9503, () => (
      <View>
        <Text>a</Text>
        <Show when={true}>
          <Text>b</Text>
        </Show>
      </View>
    ));

    expect(withTruthyShow.created).toBeGreaterThan(plain.created);
    expect(withTruthyShow.retained).toBeGreaterThan(plain.retained);
  });
});
