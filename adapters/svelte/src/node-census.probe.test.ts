// Throwaway probe — twin of adapters/react/src/node-census.probe.test.tsx.
//
// It renders the UN-LOWERED shape on purpose: it compiles View.svelte / Text.svelte as
// components and never runs `lowerHostPrimitives`, so its 23 006 nodes / 14 004 anchors are the
// BASELINE, not what a real build produces. Do not read a run of this as evidence that host-
// primitive lowering is missing — it is the arm lowering is measured against. Same logical row,
// same shape of work: mount empty, then push 1000 rows in reactively and time only that.
//
// Svelte needs real compiled output, so the row is written as a .svelte source string and run
// through the compiler here, the same way every other Svelte smoke in this package does. The row
// is INLINED rather than split into its own component on purpose: a Svelte component instance
// creates no host node, so inlining cannot change the engine node count this probe exists to read.
import { describe, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree, readCommitProfile } from '@symbiote-native/engine';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const fabric = installFabric();
const ROOT_TAG = 4245;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);
const OUT = join(__dirname, '../build/census-svelte.txt');

const COMPONENTS_DIR = join(__dirname, 'components');
// Unique suffixes: View/Text/Pressable are owned by other suites that run concurrently
// (.claude/rules/smoke-compiled-artifact-collisions.md), and only `.smoke-compiled-*.mjs` is
// gitignored.
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-view-for-census.mjs');
const TEXT_OUT = join(COMPONENTS_DIR, '.smoke-compiled-text-for-census.mjs');
const PRESSABLE_OUT = join(
  COMPONENTS_DIR,
  'pressable',
  '.smoke-compiled-pressable-for-census.mjs',
);
const PARENT_OUT = join(__dirname, '.smoke-compiled-census-parent.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
  rewrites: ReadonlyArray<readonly [string, string]> = [],
): void {
  let code = compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
  for (const [from, to] of rewrites) code = code.replaceAll(from, to);
  writeFileSync(outPath, code);
}

const PARENT_SOURCE = `
<script module lang="ts">
  export const control = $state<{ rows: number[] }>({ rows: [] });
</script>

<script lang="ts">
  import View from './components/View.svelte';
  import Text from './components/Text.svelte';
  import Pressable from './components/pressable/index.svelte';
  const noop = () => {};
</script>

<View class="screen">
  {#each control.rows as id (id)}
    <View class="bench-row">
      <Text class="bench-row-id">{String(id)}</Text><Pressable
        class="flex1"
        onPress={noop}
      >
        <Text class="bench-row-label">{\`row label number \${id}\`}</Text>
      </Pressable><Pressable class="bench-row-remove" onPress={noop}>
        <Text class="bench-row-remove-text">x</Text>
      </Pressable>
    </View>
  {/each}
</View>
`;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function loadParent(): Promise<{
  Parent: Component;
  control: { rows: number[] };
}> {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'Text.svelte'), 'utf8'),
    'Text.svelte',
    TEXT_OUT,
  );
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
    [
      [
        "from '../View.svelte'",
        `from '../.smoke-compiled-view-for-census.mjs'`,
      ],
    ],
  );
  compileToFile(PARENT_SOURCE, 'CensusParent.svelte', PARENT_OUT, [
    ["from './components/View.svelte'", `from '${VIEW_OUT}'`],
    ["from './components/Text.svelte'", `from '${TEXT_OUT}'`],
    ["from './components/pressable/index.svelte'", `from '${PRESSABLE_OUT}'`],
  ]);
  const loaded: unknown = await import(`file://${PARENT_OUT}`);
  if (typeof loaded !== 'object' || loaded === null)
    throw new Error('compiled parent did not load');
  const Parent = Reflect.get(loaded, 'default');
  const control = Reflect.get(loaded, 'control');
  if (typeof Parent !== 'function' || typeof control !== 'object')
    throw new Error('compiled parent missing default export or control');
  return { Parent, control } as {
    Parent: Component;
    control: { rows: number[] };
  };
}

describe('node census', () => {
  it('prices a reactive create of 1000 rows', async () => {
    const { Parent, control } = await loadParent();
    const surface = mount(ROOT_TAG, Parent);
    await tick();
    fabric.reset();
    readCommitProfile();

    const started = performance.now();
    control.rows = Array.from({ length: ROWS }, (_, index) => index);
    await tick();
    const elapsed = performance.now() - started;

    const profile = readCommitProfile();
    const census = censusRetainedTree(surface.children);
    writeFileSync(
      OUT,
      [
        `svelte rows=${ROWS} ms=${elapsed.toFixed(1)}`,
        `nodes=${census.nodes} renderable=${census.renderable} anchors=${census.anchors} emptyRawTexts=${census.emptyRawTexts}`,
        `flattenWidths(top10)=[${census.flattenWidths.slice(0, 10).join(',')}] count=${census.flattenWidths.length}`,
        `fabric createNode=${fabric.counts.createNode} appendChild=${fabric.counts.appendChild} clone=${fabric.counts.clone} completeRoot=${fabric.counts.completeRoot}`,
        `walkMs=${profile.walkMs.toFixed(1)} visited=${profile.nodesVisited} writes=${profile.propWrites}/${profile.propNoops} commits=${profile.commits}`,
        `childScans=${profile.childScans} probed=${profile.childScanProbed} flattens=${profile.childFlattens} widest=${profile.widestFlattenedParent ?? '?'}`,
        '',
      ].join('\n'),
    );
    console.log(
      `CENSUS svelte rows=${ROWS} ms=${elapsed.toFixed(1)} nodes=${census.nodes} ` +
        `anchors=${census.anchors} createNode=${fabric.counts.createNode} ` +
        `appendChild=${fabric.counts.appendChild} clone=${fabric.counts.clone} ` +
        `completeRoot=${fabric.counts.completeRoot} | propWrites=${profile.propWrites} ` +
        `propNoops=${profile.propNoops} nodesVisited=${profile.nodesVisited} ` +
        `commits=${profile.commits} walkMs=${profile.walkMs.toFixed(1)} ` +
        `childScans=${profile.childScans} probed=${profile.childScanProbed} ` +
        `flattens=${profile.childFlattens} widest=${profile.widestFlattenedParent ?? '?'}`,
    );
    unmount(ROOT_TAG);
    for (const out of [VIEW_OUT, TEXT_OUT, PRESSABLE_OUT, PARENT_OUT])
      rmSync(out, { force: true });
  });
});
