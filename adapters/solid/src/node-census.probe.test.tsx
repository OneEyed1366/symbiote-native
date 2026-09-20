// Throwaway probe — twin of adapters/react/src/node-census.probe.test.tsx. Same logical row,
// same shape of work: mount empty, then push 1000 rows in reactively and time only that.
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { readCommitProfile } from '@symbiote-native/engine';
import { mount, unmount } from './index';

const fabric = installRecordingFabric();
const ROOT_TAG = 4244;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const noop = (): void => {};

function Row(props: { id: number }) {
  return (
    <view class="bench-row">
      <text class="bench-row-id">{String(props.id)}</text>
      <pressable class="flex1" onPress={noop}>
        <text class="bench-row-label">{`row label number ${props.id}`}</text>
      </pressable>
      <pressable class="bench-row-remove" onPress={noop}>
        <text class="bench-row-remove-text">x</text>
      </pressable>
    </view>
  );
}

const [rows, setRows] = createSignal<readonly number[]>([]);

describe('node census', () => {
  it('prices a reactive create of 1000 rows', async () => {
    const surface = mount(ROOT_TAG, () => (
      <view class="screen">
        <For each={rows()}>{id => <Row id={id} />}</For>
      </view>
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
    const census = censusLive(...surface.children);
    // Writes only when asked. A relative path resolves against the CWD, so an unconditional
    // write here litters the repo root on every full `vitest run` — and the `.gitignore` entry
    // that followed hides the litter rather than stopping it. The census is the point of the
    // probe, so it goes to stdout always and to a file only under SYMBIOTE_CENSUS_OUT.
    // The walk numbers (walkMs / nodesVisited) and propNoops died with the JS tree: the host owns
    // the tree, and its own cost is not readable from here. What is left prices the layer ABOVE it.
    const line = `solid ms=${elapsed.toFixed(1)} nodes=${census.nodes} commits=${profile.commits} writes=${profile.propWrites}\n`;

    console.log(line);
    const outPath = process.env.SYMBIOTE_CENSUS_OUT;
    if (outPath !== undefined) writeFileSync(outPath, line);
    console.log(
      // `created` and `commits` replace the old createNode/appendChild/clone/completeRoot line.
      // Those four counted calls of the CLONE PROTOCOL, which only the stand-in ever spoke — the
      // engine sends an op stream, and `created`/`commits` are what that stream actually reports.
      `CENSUS solid rows=${ROWS} ms=${elapsed.toFixed(1)} nodes=${census.nodes} ` +
        `anchors=${census.anchors} created=${fabric.findAll(() => true).length} ` +
        `commits=${fabric.commits} | propWrites=${profile.propWrites} ` +
        `engineCommits=${profile.commits}`,
    );
    unmount(ROOT_TAG);
  });
});
