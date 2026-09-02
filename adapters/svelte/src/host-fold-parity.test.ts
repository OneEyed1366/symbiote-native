// A primitive's FOLDS must reach the committed payload by every path that can produce its host
// node — the lowered tag, the component wrapper, and any adapter component that hand-authors the
// raw tag instead of composing the wrapper.
//
// The defect class, found in Angular first and then here (2026-08-31): lowering deletes the
// wrapper, and the wrapper was the thing applying `HOST_PRIMITIVES`'s `aliases` and `defaults`.
// A path that loses them renders a Text that CLIPS instead of ellipsising, or ships Fabric a raw
// `id` key no ViewConfig declares. Nothing goes red: `tsc` is happy, the tree shape is identical,
// and the two arms agree on every count. Only the committed KEY NAMES disagree, and only on a
// device does that become visible.
//
// THREE arms, one per path that can produce the node: the lowered tag, the component wrapper, and
// a tag written by hand. The third is the one `button.svelte` failed, and it is the reason the fold
// now lives in the shim's `p` setter rather than only in the preprocessor — that setter is the one
// layer all three cross.
//
// A structural twin of this test existed briefly — "every hand-authored tag in the adapter must
// call its fold" — and was deleted once the shim covered them, because breaking a component's own
// redundant fold no longer produces a defect. A test that goes red on a non-defect is worse than
// no test: it teaches the next reader to keep a call that does nothing.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { installFabric } from '@symbiote-native/test-utils';
import { lowerHostPrimitives } from './preprocessor/lower-host-primitives';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const SRC_DIR = __dirname;
const COMPONENTS_DIR = join(SRC_DIR, 'components');

// Every artifact sits NEXT TO its real source so the compiled output's own relative imports
// resolve, and carries a suffix nobody else uses — View and Text are owned by other suites that
// run concurrently (.claude/rules/smoke-compiled-artifact-collisions.md).
const TEXT_OUT = join(COMPONENTS_DIR, '.smoke-compiled-text-for-fold.mjs');
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-view-for-fold.mjs');
const PROBE_OUT = join(SRC_DIR, '.smoke-compiled-fold-probe.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

/** The committed props of the node carrying this testID, read out of the fake slot. */
function committedProps(testID: string): Record<string, unknown> {
  const walk = (
    nodes: readonly unknown[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const props = node.props;
      if (isRecord(props) && props.testID === testID) return props;
      const children = node.children;
      if (Array.isArray(children)) {
        const hit = walk(children);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  const found = walk(fabric.appRoot().children);
  if (found === undefined)
    throw new Error(`no committed node carries testID ${testID}`);
  return found;
}

// ONE authored markup, two paths. The lowered arm is the preprocessor's real output; the component
// arm is the same source with the package import pointed at the real compiled wrapper, so both
// arms run the shipping code rather than a hand-written imitation of it.
const MARKUP = (testID: string, importLine: string): string =>
  [
    `<script>`,
    `  ${importLine}`,
    `</script>`,
    `<Text testID="${testID}">hello</Text>`,
  ].join('\n');

// The lowered arm must name the PACKAGE — that import is what tells the transform this `Text` is
// ours and not the app's own component. The component arm names the compiled wrapper by path, and
// as a DEFAULT import, which is what `svelte/compiler` emits for a `.svelte` module; rewriting the
// specifier alone leaves a named binding that resolves to undefined, and the arm dies with
// `Text is not a function` instead of committing anything.
const PACKAGE_IMPORT_LINE_SOURCE = `import { Text } from '@symbiote-native/svelte';`;

// Lowering leaves the now-unused `import { Text }` behind, and it must go: the probe is compiled
// to a loose `.mjs` and imported by path, so that specifier would be resolved for real — dragging
// the package barrel, and every `.svelte` in it, through a loader that has no Svelte plugin. The
// arm is still honest precisely BECAUSE the import is dead after lowering; if a `Text` binding
// were still referenced, deleting it would break the compile rather than pass quietly.
const PACKAGE_IMPORT_LINE = /^.*from '@symbiote-native\/svelte';$/m;

const lower = (source: string): string => {
  const result = lowerHostPrimitives().markup({
    content: source,
    filename: 'FoldProbe.svelte',
  });
  const lowered = result === undefined ? source : result.code;
  if (lowered === source) throw new Error('the transform refused the probe');
  return lowered.replace(PACKAGE_IMPORT_LINE, '');
};

async function mountSource(
  source: string,
  filename: string,
  rewrites: ReadonlyArray<readonly [string, string]>,
  rootTag: number,
): Promise<void> {
  compileToFile(source, filename, PROBE_OUT, rewrites);
  // Node caches a dynamic import by resolved path, so the second arm needs a fresh query string or
  // it silently re-runs the first arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle();
}

afterAll(() => {
  for (const path of [TEXT_OUT, VIEW_OUT, PROBE_OUT])
    rmSync(path, { force: true });
});

// Does `unreadableAttributeSet` — the refusal to lower an element carrying `{...spread}` — protect
// anything HERE? The category's stated reason is that a transform cannot enumerate a bag and so
// cannot fold `id` -> `nativeID` in it. That reason is about a COMPILE-time fold, and this adapter
// moved its fold into the shim (`dom-shim/fold-host-bag.ts`), which sees the merged object.
//
// Measured rather than read: the lowered arm is hand-written as exactly what the transform WOULD
// emit for a spread (`p={{...bag}}`), so the comparison is real without changing the transform to
// run it. Byte equality of the committed payloads is the answer.
describe('a spread the transform cannot enumerate', () => {
  it('folds identically once the shim sees the merged bag', async () => {
    compileToFile(
      readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'),
      'View.svelte',
      VIEW_OUT,
    );
    const BAG = `{ id: 'ident', class: 'card', testID: 'spread-%ARM%' }`;

    const component = await (async () => {
      await mountSource(
        [
          `<script>`,
          `  import View from '${VIEW_OUT}';`,
          `  const bag = ${BAG.replace('%ARM%', 'component')};`,
          `</script>`,
          `<View {...bag}></View>`,
        ].join('\n'),
        'SpreadProbe.svelte',
        [],
        8_811,
      );
      return committedProps('spread-component');
    })();

    const lowered = await (async () => {
      await mountSource(
        [
          `<script>`,
          `  const bag = ${BAG.replace('%ARM%', 'lowered')};`,
          `</script>`,
          `<symbiote-view p={{ ...bag }}></symbiote-view>`,
        ].join('\n'),
        'SpreadProbe.svelte',
        [],
        8_812,
      );
      return committedProps('spread-lowered');
    })();

    // testID is the arm label, so it is the one key that must differ.
    const strip = (props: Record<string, unknown>): Record<string, unknown> => {
      const { testID: _ignored, ...rest } = props;
      return rest;
    };
    expect(strip(lowered)).toEqual(strip(component));
    // And the fold actually ran on both — two arms that both lost `id` agree with each other.
    expect(lowered.nativeID, 'lowered folded id').toBe('ident');
    expect(component.nativeID, 'component folded id').toBe('ident');
    expect(lowered, 'raw id dropped').not.toHaveProperty('id');

    unmount(8_811);
    unmount(8_812);
  });
});

describe('a primitive folds identically on the lowered and the component path', () => {
  it('commits the same Text key set either way', async () => {
    compileToFile(
      readFileSync(join(COMPONENTS_DIR, 'Text.svelte'), 'utf8'),
      'Text.svelte',
      TEXT_OUT,
    );

    await mountSource(
      lower(MARKUP('lowered', PACKAGE_IMPORT_LINE_SOURCE)),
      'FoldProbe.svelte',
      [],
      8_801,
    );
    const lowered = committedProps('lowered');

    await mountSource(
      MARKUP('component', `import Text from '${TEXT_OUT}';`),
      'FoldProbe.svelte',
      [],
      8_802,
    );
    const component = committedProps('component');

    // ARM 3 — the hand-authored tag, the path that has neither a transform nor a wrapper. This is
    // the arm `button.svelte` failed, and the only one the shim's fold is the sole cover for.
    await mountSource(
      [
        `<symbiote-text p={{ testID: "handwritten" }}>hello</symbiote-text>`,
      ].join('\n'),
      'FoldProbe.svelte',
      [],
      8_803,
    );
    const handwritten = committedProps('handwritten');
    expect(Object.keys(handwritten).sort()).toEqual(
      Object.keys(component).sort(),
    );

    // KEY NAMES, not values: that is what the Angular defect moved, and comparing whole payloads
    // would also fail on any legitimate per-path difference in a style slot.
    expect(Object.keys(lowered).sort()).toEqual(Object.keys(component).sort());

    // And the fold is actually PRESENT — two arms that both lost it agree with each other.
    // Cross-arm agreement alone cannot see a fold that stopped running for EVERYBODY — deleting
    // the shim's pass moves all three arms together (test-harness-false-greens.md §16). So each
    // arm is also pinned to the absolute key.
    for (const key of Object.keys(HOST_PRIMITIVES.Text.defaults)) {
      expect(lowered, `lowered arm carries ${key}`).toHaveProperty(key);
      expect(component, `component arm carries ${key}`).toHaveProperty(key);
      expect(handwritten, `hand-authored arm carries ${key}`).toHaveProperty(
        key,
      );
    }
    unmount(8_801);
    unmount(8_802);
    unmount(8_803);
  });
});
