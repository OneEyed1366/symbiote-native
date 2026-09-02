// Svelte's arm of the shared lowering-equivalence oracle: mount every lowerable primitive BOTH ways
// with the same props and require the committed Fabric trees to be identical.
//
// WHY THIS ARM IS THE SENSITIVE ONE, and it is worth knowing before reading a green run as proof
// about the other four. The oracle's header warns that a fold living in a layer BOTH arms traverse
// moves both arms identically, so equivalence alone stays green when that layer breaks — measured on
// Vue, where emptying PROP_ALIASES left 4 of 5 cases passing. That warning is about adapters whose
// two arms share a renderer. Svelte's do not: the lowered path funnels EVERY attribute through one
// `p={{…}}` bag into the shim's `p` setter and out through `routeProp`, while the component path
// writes its props from inside the wrapper. The arms differ in MECHANISM, not merely in wrapping.
//
// So this arm can catch a one-path loss that a shared-renderer arm structurally cannot — and it is
// still not sufficient on its own, which is why every case here also carries the ABSOLUTE assertion.
// Do not read "Svelte is green" as evidence for any other adapter.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Component } from 'svelte';
import {
  assertArmsAreDistinct,
  assertCommittedSomething,
  compareLoweringEquivalence,
  expectCommittedProps,
  installFabric,
  waitForQuiet,
  type IFakeNode,
  type IEquivalenceResult,
} from '@symbiote-native/test-utils';
import {
  censusRetainedTree,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import './register';
import { mount, unmount } from './render';
import { lowerHostPrimitives } from './preprocessor/lower-host-primitives';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const PROBE_TEST_ID = 'probe';
const PROBE_ID = 'ident';

// Named for this suite alone — two files sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const SUFFIX = '-for-lowering-equivalence';
const PROBE_OUT = join(__dirname, `.smoke-compiled-probe${SUFFIX}.mjs`);
const written: string[] = [PROBE_OUT];

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// A FIXED tick count is what made this suite disagree with itself — two runs of identical code
// reported two failures and then four, with `Text` and `InputAccessoryView` joining and leaving. The
// wrappers do not all settle in the same number of ticks (a `$effect` that syncs attachments takes
// more than a pure render), so three ticks reads a half-built tree for some of them and a finished
// one for others, run to run. `waitForQuiet` samples until the commit count stops moving, which is
// the repair this repo already made for the same shape (`core/test-utils/src/wait-for.ts`).
const settle = async (label: string): Promise<void> => {
  await waitForQuiet(
    () => fabric.committed.length + fabric.created.length,
    label,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// The wrapper file for a primitive comes from the components barrel, never from its NAME. Deriving
// `./${name.toLowerCase()}.svelte` held only while every primitive was one word in a flat file, and
// broke on the first two-word one — the coincidence-shaped rule in
// `.claude/rules/adapter-parity-audit.md`. The barrel is the mapping, so a rename or a move follows.
function wrapperPathFor(name: string): string {
  const barrel = join(__dirname, 'components', 'index.ts');
  const source = readFileSync(barrel, 'utf8');
  const direct = new RegExp(
    `export \\{ default as ${name} \\} from '([^']+)'`,
  ).exec(source);
  if (direct !== null) return join(__dirname, 'components', direct[1]);

  // A primitive whose component value carries STATICS is re-exported by name from a sibling `.ts`
  // that attaches them (`Image` — `imageStatics` cannot hang off a `.svelte` module), so the barrel
  // holds `export { Image } from './image'` and the component is one hop further in. Follow the hop
  // rather than special-casing the name: the next primitive to gain statics takes the same shape.
  const reexport = new RegExp(`export \\{ ${name} \\} from '([^']+)'`).exec(
    source,
  );
  if (reexport !== null) {
    const moduleDir = join(__dirname, 'components', reexport[1]);
    const hop = /import \w+ from '(\.[^']*\.svelte)'/.exec(
      readFileSync(join(moduleDir, 'index.ts'), 'utf8'),
    );
    if (hop !== null) return join(moduleDir, hop[1]);
  }

  throw new Error(
    `${name} is in HOST_PRIMITIVES but the components barrel exports no component for it`,
  );
}

// What the folds PRODUCE, derived from the primitive's own spec rather than restated. The oracle's
// doc is explicit that an expectation echoing the author's input passes with the fold deleted, so
// `id="ident"` must be asserted as `nativeID`, and Text's seeded defaults as their resolved values.
function expectedFoldOutput(name: string): Record<string, unknown> {
  const primitive = HOST_PRIMITIVES[name];
  const expected: Record<string, unknown> = {};
  for (const to of Object.values(primitive.aliases)) expected[to] = PROBE_ID;
  for (const [key, rule] of Object.entries(primitive.defaults)) {
    if (!isRecord(rule)) continue;
    expected[key] = rule.op === 'notFalse' ? true : rule.value;
  }
  return expected;
}

function compiledPathFor(sourcePath: string): string {
  const base = sourcePath.split('/').slice(-2).join('-').replace(/\./g, '-');
  return join(dirname(sourcePath), `.smoke-compiled-${base}${SUFFIX}.mjs`);
}

async function mountProbe(
  source: string,
  filename: string,
  rootTag: number,
): Promise<{ committed: IFakeNode[]; retainedNodes: number }> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
  fabric.reset();
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle(`${filename} mount`);

  const committed = fabric.committed.map(node => node);
  const retainedNodes = retainedNodeCount();
  unmount(rootTag);
  await settle(`${filename} unmount`);
  return { committed, retainedNodes };
}

// The retained root reached through the probe's own node, so the count belongs to THIS arm.
function retainedNodeCount(): number {
  const seed = fabric.created.find(node => node.props.testID === PROBE_TEST_ID);
  if (seed === undefined) return 0;
  const handle: unknown = seed.instanceHandle;
  if (!isSymbioteNode(handle)) return 0;
  let current: ISymbioteNode = handle;
  while (current.parent !== undefined) current = current.parent;
  return censusRetainedTree([current]).nodes;
}

// The lowered arm is built BY THE TRANSFORM, never hand-written as intrinsic markup. A hand-written
// bag asserts that the author can spell a bag; only the transform's own output asserts what an app
// will actually commit.
function loweredSourceFor(name: string, markup: string): string {
  const authored = [
    '<script>',
    `  import { ${name} } from '@symbiote-native/svelte';`,
    '</script>',
    markup,
  ].join('\n');
  const lowered = lowerHostPrimitives().markup({
    content: authored,
    filename: `${name}Lowered.svelte`,
  }).code;

  // Once the tag is an element the primitive import is dead, and node would try to resolve
  // `@symbiote-native/svelte` at import time. Strip the block — but only after proving it holds
  // nothing else: the transform ADDS a helper import for a specialised style, and silently dropping
  // that would leave the arm referencing an undefined function.
  const block = /<script>([\s\S]*?)<\/script>\n?/.exec(lowered);
  if (block === null) return lowered;
  const imports = [...block[1].matchAll(/^\s*import .*$/gm)].map(match =>
    match[0].trim(),
  );
  if (imports.length !== 1)
    throw new Error(
      `${name}: the lowered probe's script carries ${imports.length} imports, expected only the primitive import — ${imports.join(' | ')}`,
    );
  return lowered.replace(block[0], '');
}

// KNOWN DIVERGENCES, NARROWED RATHER THAN SKIPPED — the `EAGERLY_FORWARDED_GATES` shape from
// `.claude/rules/fabric-boolean-event-gates.md`. A skip would trade a known red for zero reds and no
// coverage on the primitive that has it, and a standing red hides the next unknown one; this
// subtracts the NAMED keys and leaves every other divergence on those primitives caught.
//
// DELETE AN ENTRY THE DAY ITS FIX LANDS. Each one names what would have to change.
//
// EMPTY as of 2026-09-02, which means `withoutKnown` below is currently a no-op and its quoted-token
// matching is UNEXERCISED. Whoever adds the next entry owes it a break-test rather than trusting the
// matcher: the hazard it guards against — `id` matching inside `nativeID` — cannot surface until
// something is in this list to over-subtract.
const KNOWN_DIVERGENCES: ReadonlyArray<{
  readonly primitive: string;
  readonly keys: readonly string[];
  readonly why: string;
}> = [
  // TRACED AND CLOSED 2026-09-02, and the cause was one line below every hypothesis this entry
  // recorded. `FOLD_PLAN_BY_TAG` was keyed on a primitive's LOWERED spellings only, so the two
  // primitives with a `-managed` twin — the only two — had no plan on their component path and
  // `foldHostBag` handed the bag back untouched. Not an accessibility fold, not this adapter's
  // wrapper: `tagsOf` in `core/components/src/fold-host-bag.ts` now emits the managed spelling too.
];

// Drop only the differences that NAME an allowlisted key, matched as a quoted token. The quotes are
// not decoration: `id` is a substring of `nativeID`, so a bare match would silently swallow the
// nativeID differences of every primitive — the same prefix hazard this repo has now hit in a tag
// alphabet, a bag key and here.
function withoutKnown(
  result: IEquivalenceResult,
  primitive: string,
): IEquivalenceResult {
  const keys = KNOWN_DIVERGENCES.filter(
    entry => entry.primitive === primitive,
  ).flatMap(entry => entry.keys);
  if (keys.length === 0) return result;
  const differences = result.differences.filter(
    difference => !keys.some(key => difference.includes(`"${key}"`)),
  );
  return { equal: differences.length === 0, differences };
}

function expectEqual(result: IEquivalenceResult, what: string): void {
  expect(result.differences, what).toEqual([]);
}

afterAll(() => {
  for (const path of written) rmSync(path, { force: true });
});

describe('a lowered primitive commits what its wrapper commits', () => {
  // Derived from the spec, so a ninth primitive is covered the day its key lands and cannot be
  // forgotten here (`test-harness-false-greens.md` §24).
  const NAMES = Object.keys(HOST_PRIMITIVES);

  it('covers every lowerable primitive', () => {
    expect(NAMES.length).toBeGreaterThan(0);
  });

  // An allowlist outlives its subject silently — a primitive renamed or dropped leaves an entry that
  // subtracts nothing and reads as live debt forever. Pin it to the spec.
  it('every allowlisted divergence names a primitive that still exists', () => {
    for (const entry of KNOWN_DIVERGENCES)
      expect(NAMES, `${entry.primitive}: ${entry.why}`).toContain(
        entry.primitive,
      );
  });

  it.each(NAMES)(
    '%s: the two paths agree, and both folded',
    async name => {
      const markup = `<${name} id="${PROBE_ID}" testID="${PROBE_TEST_ID}" />`;

      const wrapperPath = wrapperPathFor(name);
      const compiledWrapper = compiledPathFor(wrapperPath);
      written.push(compiledWrapper);
      writeFileSync(
        compiledWrapper,
        compile(readFileSync(wrapperPath, 'utf8'), {
          ...COMPILE_OPTIONS,
          filename: wrapperPath,
        }).js.code,
      );

      const tag = NAMES.indexOf(name) * 10 + 9_800;

      // The first mount in a process builds surface chrome the later ones reuse
      // (`test-harness-false-greens.md` §18), so a throwaway arm runs before anything is compared.
      await mountProbe(
        `<symbiote-view p={{ testID: "warmup" }}></symbiote-view>`,
        'Warmup.svelte',
        tag,
      );

      const componentSource = [
        '<script>',
        `  import ${name} from '${compiledWrapper}';`,
        '</script>',
        markup,
      ].join('\n');
      const loweredSource = loweredSourceFor(name, markup);

      const component = await mountProbe(
        componentSource,
        `${name}Component.svelte`,
        tag + 1,
      );
      const lowered = await mountProbe(
        loweredSource,
        `${name}Lowered.svelte`,
        tag + 2,
      );

      // Both false greens the oracle names, before any comparison is believed: an arm that
      // committed nothing, and two arms that are secretly the same arm.
      expectEqual(
        assertCommittedSomething(component.committed, `${name} component`),
        `${name}: component arm`,
      );
      expectEqual(
        assertCommittedSomething(lowered.committed, `${name} lowered`),
        `${name}: lowered arm`,
      );
      // THE DISTINCTNESS GUARD, AND THE SHARED ONE DOES NOT TRANSFER TO SVELTE UNCHANGED.
      // `assertArmsAreDistinct` discriminates on RETAINED NODE COUNT, on the reasoning that a
      // component form allocates a wrapper the lowered form does not. That holds here only for a
      // primitive whose wrapper takes children — the anchors are what cost the node. `Switch` and
      // `TextInput` render a single childless element with `p={descriptor.props}`, so both arms
      // retain exactly one node and the shared guard reports "the lowered arm did not lower" about
      // two arms that differ perfectly well.
      //
      // The discriminator that IS universal here is the tag the transform emitted: a wrapper renders
      // the `-managed` spelling or a component boundary, and only the lowered source can name the
      // bare intrinsic. Checked on the SOURCE, so it cannot be satisfied by a runtime coincidence.
      expect(
        loweredSource.includes(`<${HOST_PRIMITIVES[name].intrinsic}`),
        `${name}: the transform did not lower — the two arms would be the same arm`,
      ).toBe(true);
      expect(
        componentSource.includes(`<${HOST_PRIMITIVES[name].intrinsic}`),
        `${name}: the component arm already names the intrinsic, so it is not the component path`,
      ).toBe(false);

      // Kept where it applies: for a children-bearing wrapper the node count is real evidence, and
      // it catches a lowering that emitted the right tag while still mounting the wrapper.
      if (component.retainedNodes !== lowered.retainedNodes)
        expectEqual(
          assertArmsAreDistinct(component.retainedNodes, lowered.retainedNodes),
          `${name}: arms are distinct`,
        );

      expectEqual(
        withoutKnown(
          compareLoweringEquivalence(component.committed, lowered.committed),
          name,
        ),
        `${name}: the wrapper and the lowered element committed different trees`,
      );

      // The absolute half, on BOTH arms. Equivalence alone cannot see a fold that both paths lost.
      const expected = expectedFoldOutput(name);
      expectEqual(
        withoutKnown(
          expectCommittedProps(component.committed, PROBE_TEST_ID, expected),
          name,
        ),
        `${name}: the component path did not fold`,
      );
      // The LOWERED arm keeps its FULL expectation, with nothing subtracted. Both known divergences
      // are defects of the component path, and the lowered path is the side that is right — blinding
      // it too would be the cheap symmetry that costs the guard on the only arm currently correct.
      expectEqual(
        expectCommittedProps(lowered.committed, PROBE_TEST_ID, expected),
        `${name}: the lowered path did not fold`,
      );
    },
    20_000,
  );
});
