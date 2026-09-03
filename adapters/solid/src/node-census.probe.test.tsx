// Throwaway probe — twin of adapters/react/src/node-census.probe.test.tsx. Same logical row,
// same shape of work: mount empty, then push 1000 rows in reactively and time only that.
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree, readCommitProfile } from '@symbiote-native/engine';
import { mount, unmount, View, Text, Pressable } from './index';

const fabric = installFabric();
const ROOT_TAG = 4244;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const noop = (): void => {};

function Row(props: { id: number }) {
  return (
    <View class="bench-row">
      <Text class="bench-row-id">{String(props.id)}</Text>
      <Pressable class="flex1" onPress={noop}>
        <Text class="bench-row-label">{`row label number ${props.id}`}</Text>
      </Pressable>
      <Pressable class="bench-row-remove" onPress={noop}>
        <Text class="bench-row-remove-text">x</Text>
      </Pressable>
    </View>
  );
}

const [rows, setRows] = createSignal<readonly number[]>([]);

describe('node census', () => {
  it('prices a reactive create of 1000 rows', async () => {
    const surface = mount(ROOT_TAG, () => (
      <View class="screen">
        <For each={rows()}>{id => <Row id={id} />}</For>
      </View>
    ));
    await tick();
    fabric.reset();
    readCommitProfile();

    const ids = Array.from({ length: ROWS }, (_, index) => index);
    const started = performance.now();
    setRows(ids);
    await tick();
    const elapsed = performance.now() - started;

    const profile = readCommitProfile();
    const census = censusRetainedTree(surface.children);
    // Writes only when asked. A relative path resolves against the CWD, so an unconditional
    // write here litters the repo root on every full `vitest run` — and the `.gitignore` entry
    // that followed hides the litter rather than stopping it. The census is the point of the
    // probe, so it goes to stdout always and to a file only under SYMBIOTE_CENSUS_OUT.
    const line = `solid ms=${elapsed.toFixed(1)} nodes=${census.nodes} walkMs=${profile.walkMs.toFixed(1)} visited=${profile.nodesVisited} writes=${profile.propWrites}/${profile.propNoops}\n`;

    console.log(line);
    const outPath = process.env.SYMBIOTE_CENSUS_OUT;
    if (outPath !== undefined) writeFileSync(outPath, line);
    console.log(
      `CENSUS solid rows=${ROWS} ms=${elapsed.toFixed(1)} nodes=${census.nodes} ` +
        `anchors=${census.anchors} createNode=${fabric.counts.createNode} ` +
        `appendChild=${fabric.counts.appendChild} clone=${fabric.counts.clone} ` +
        `completeRoot=${fabric.counts.completeRoot} | propWrites=${profile.propWrites} ` +
        `propNoops=${profile.propNoops} nodesVisited=${profile.nodesVisited} ` +
        `commits=${profile.commits} walkMs=${profile.walkMs.toFixed(1)}`,
    );
    unmount(ROOT_TAG);
  });
});
