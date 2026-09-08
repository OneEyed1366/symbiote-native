// Every primitive in `HOST_PRIMITIVES`, mounted as the BARE TAG an app now writes, must commit the
// folds its spec declares — the `id -> nativeID` alias and Text's RN defaults.
//
// THIS FILE REPLACES `lowering-equivalence.test.ts`, and the reason is that its subject is gone
// rather than that it was wrong. That oracle mounted each primitive twice — once through its
// wrapper component, once through the lowering transform — and compared the committed trees. There
// is no wrapper and no transform: a primitive IS the tag, so there is exactly one path and nothing
// to compare it against.
//
// What survives is the half that oracle called ABSOLUTE, and it is the half that mattered. A
// cross-arm comparison is structurally blind to a fold that stops running for EVERY arm
// (`.claude/rules/test-harness-false-greens.md` §16) — measured on Vue, where emptying PROP_ALIASES
// left 4 of 5 cases passing. So the expectation here is derived from the spec's own `aliases` and
// `defaults` and asserted against the committed payload, never against another mount.
//
// TWO SPELLINGS, both asserted absolutely rather than against each other: attributes on the tag
// (which reach the engine through `ShimElement.setAttribute`) and one `p={{…}}` bag (through the `p`
// setter). Those are two different doors into `foldHostBag`, and an app writes both.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  expectCommittedProps,
  installFabric,
  waitForQuiet,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const PROBE_TEST_ID = 'probe';
const PROBE_ID = 'ident';

// Named for this suite alone — two files sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-probe-for-tag-folds.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// A FIXED tick count is what made the suite this one replaces disagree with itself — two runs of
// identical code reported two failures and then four. `waitForQuiet` samples until the commit count
// stops moving (`core/test-utils/src/wait-for.ts`).
const settle = async (label: string): Promise<void> => {
  await waitForQuiet(
    () => fabric.committed.length + fabric.created.length,
    label,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// What the folds PRODUCE, derived from the primitive's own spec rather than restated. An
// expectation echoing the author's input passes with the fold deleted, so `id="ident"` is asserted
// as `nativeID`, and Text's seeded defaults as their resolved values.
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

async function mountProbe(
  source: string,
  filename: string,
  rootTag: number,
): Promise<IFakeNode[]> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
  fabric.reset();
  // Node caches an ES module by resolved URL, so each arm needs its own query string or it
  // silently re-runs the first one (`test-harness-false-greens.md` §31).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle(`${filename} mount`);

  const committed = fabric.committed.map(node => node);
  unmount(rootTag);
  await settle(`${filename} unmount`);
  return committed;
}

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('a bare primitive tag commits the folds its spec declares', () => {
  // Derived from the spec, so a ninth primitive is covered the day its key lands and cannot be
  // forgotten here (`test-harness-false-greens.md` §24).
  const NAMES = Object.keys(HOST_PRIMITIVES);

  it('covers every primitive', () => {
    expect(NAMES.length).toBeGreaterThan(0);
  });

  // The anti-degeneracy guard for the derived expectation below: every row is conditioned on its
  // own entry's data, so a spec whose aliases and defaults all went empty would leave every row
  // green by agreement (`test-harness-false-greens.md` §23b).
  it('has something to assert — at least one primitive declares a fold', () => {
    const folding = NAMES.filter(
      name => Object.keys(expectedFoldOutput(name)).length > 0,
    );
    expect(folding.length).toBeGreaterThan(0);
  });

  it.each(NAMES)(
    '%s: both spellings reach the fold',
    async name => {
      const tag = HOST_PRIMITIVES[name].intrinsic;
      const expected = expectedFoldOutput(name);

      // The first mount in a process builds surface chrome the later ones reuse
      // (`test-harness-false-greens.md` §18), so a throwaway arm runs before anything is asserted.
      await mountProbe(
        `<view p={{ testID: "warmup" }}></view>`,
        'Warmup.svelte',
        NAMES.indexOf(name) * 10 + 9_800,
      );

      const base = NAMES.indexOf(name) * 10 + 9_800;
      const attributes = await mountProbe(
        `<${tag} id="${PROBE_ID}" testID="${PROBE_TEST_ID}"></${tag}>`,
        `${name}Attributes.svelte`,
        base + 1,
      );
      const bag = await mountProbe(
        `<${tag} p={{ id: "${PROBE_ID}", testID: "${PROBE_TEST_ID}" }}></${tag}>`,
        `${name}Bag.svelte`,
        base + 2,
      );

      expect(
        expectCommittedProps(attributes, PROBE_TEST_ID, expected).differences,
        `${name}: attributes on the tag did not fold`,
      ).toEqual([]);
      expect(
        expectCommittedProps(bag, PROBE_TEST_ID, expected).differences,
        `${name}: the prop bag did not fold`,
      ).toEqual([]);
    },
    20_000,
  );
});
