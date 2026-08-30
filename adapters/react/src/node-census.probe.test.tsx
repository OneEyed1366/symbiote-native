// Throwaway probe: reproduce the benchmark's "Create 1000 rows" the way the SCREEN does it —
// mount an empty list first, then push 1000 rows into it reactively — and time only that step.
// Twins: adapters/{vue,solid}/src/node-census.probe.test.*  — identical logical tree.
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { useState } from 'react';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree, readCommitProfile } from '@symbiote-native/engine';
import { mount, unmount, View, Text, Pressable } from './index';

const fabric = installFabric();
const ROOT_TAG = 4242;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const noop = (): void => {};

function Row({ id }: { id: number }): React.ReactNode {
  return (
    <View className="bench-row">
      <Text className="bench-row-id">{String(id)}</Text>
      <Pressable className="flex1" onPress={noop}>
        <Text className="bench-row-label">{`row label number ${id}`}</Text>
      </Pressable>
      <Pressable className="bench-row-remove" onPress={noop}>
        <Text className="bench-row-remove-text">x</Text>
      </Pressable>
    </View>
  );
}

let setRows: ((ids: readonly number[]) => void) | undefined;

function App(): React.ReactNode {
  const [ids, setIds] = useState<readonly number[]>([]);
  setRows = setIds;
  return (
    <View className="screen">
      {ids.map(id => (
        <Row key={id} id={id} />
      ))}
    </View>
  );
}

describe('node census', () => {
  it('prices a reactive create of 1000 rows', async () => {
    const surface = mount(ROOT_TAG, <App />);
    await tick();
    fabric.reset();
    readCommitProfile();

    const ids = Array.from({ length: ROWS }, (_, index) => index);
    const started = performance.now();
    setRows?.(ids);
    await tick();
    const elapsed = performance.now() - started;

    const profile = readCommitProfile();
    const census = censusRetainedTree(surface.children);
    // OPT-IN, and the relative path is why. A bare `writeFileSync('census-react.txt', …)` resolves
    // against the CWD, so every full-suite run from the repo root drops a file there — and the
    // `.gitignore` entry that hid those files made it worse, because a clean `git status` is then
    // the only thing anyone checks. Fix the write, never the visibility.
    const outPath = process.env.SYMBIOTE_CENSUS_OUT;
    if (outPath !== undefined) {
      writeFileSync(
        outPath,
        `react ms=${elapsed.toFixed(1)} nodes=${census.nodes} walkMs=${profile.walkMs.toFixed(1)} ` +
          `visited=${profile.nodesVisited} writes=${profile.propWrites}/${profile.propNoops}\n`,
      );
    }
    console.log(
      `CENSUS react rows=${ROWS} ms=${elapsed.toFixed(1)} nodes=${census.nodes} ` +
        `anchors=${census.anchors} createNode=${fabric.counts.createNode} ` +
        `appendChild=${fabric.counts.appendChild} clone=${fabric.counts.clone} ` +
        `completeRoot=${fabric.counts.completeRoot} | propWrites=${profile.propWrites} ` +
        `propNoops=${profile.propNoops} nodesVisited=${profile.nodesVisited} ` +
        `commits=${profile.commits} walkMs=${profile.walkMs.toFixed(1)} ` +
        `childScans=${profile.childScans} probed=${profile.childScanProbed} ` +
        `flattens=${profile.childFlattens} widest=${profile.widestFlattenedParent ?? '?'}`,
    );
    unmount(ROOT_TAG);
  });
});
