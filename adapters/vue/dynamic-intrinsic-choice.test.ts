// REFUSAL_CATEGORIES.dynamicIntrinsicChoice on BOTH Vue lowering paths.
//
// `TextInput` is the first primitive whose PROP picks the Fabric view: `symbiote-text-input` and
// `symbiote-text-input-multiline` are two different native views, not one with a flag
// (core/components/src/view/render-text-input.ts). A transform prints a static tag, so it can
// resolve `multiline` only from a compile-time literal — and getting it wrong is worse than the
// value categories, because no later prop write moves a node between views.
//
// THE SPEC ENTRY IS INJECTED, and it has been real once already. `HOST_PRIMITIVES.TextInput` landed
// on 2026-08-31 and was withdrawn the same day: nothing calls `registerTextInputBehavior()` except
// its own test, so a lowered `<TextInput>` was a bare tag with no machine installed — no controlled
// handshake, no event counter, no autoFocus, and nothing red. The entry returns when the machine is
// wired and the tag question below it is settled, and the injection here is what keeps this file
// meaningful in the meantime.
//
// The guard below removes the injection AUTOMATICALLY when that happens. It has fired once, in both
// directions, which is the whole argument for having it: Solid's Pressable test kept an injection
// past the real entry and silently overrode it with a poorer copy (`aliases: {}` against the real
// `ID_ALIAS`), so seven green tests measured a configuration that does not ship.
//
// Both modules are CJS singletons in one process, so the mutation must happen BEFORE either
// transform is required — each builds its lowerable map at module load. vitest isolates per file.

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

const require_ = createRequire(import.meta.url);

// ONE definition of the injected entry, shared with lowering-parity.test.ts and with Solid's two
// files, from a self-expiring module: it throws the moment `HOST_PRIMITIVES.TextInput` exists
// again, so the cleanup is forced rather than remembered. A local copy is what the previous round
// of this had, and two copies drifted — one carried `aliases: {}` against the real `ID_ALIAS`, so
// seven green tests measured a configuration that does not ship.
//
// In `core/test-utils`, deliberately not beside the spec it shadows: the `.cjs` files next to
// `host-primitives.cjs` are public subpaths of a shipped package, and a module that exists to
// MUTATE the spec cannot be public API. The shared thing here is a fixture, not a specification.
//
// Must run BEFORE either transform is required — each snapshots HOST_PRIMITIVES at module load.
const {
  HOST_PRIMITIVES,
}: {
  HOST_PRIMITIVES: Record<
    string,
    { intrinsic: string; intrinsicWhen: { prop: string; intrinsic: string } }
  >;
} = require_('@symbiote-native/components/host-primitives');

const SINGLELINE = HOST_PRIMITIVES.TextInput.intrinsic;
const MULTILINE = HOST_PRIMITIVES.TextInput.intrinsicWhen.intrinsic;

// The snippets below spell `multiline` literally, because a case built out of a variable is
// unreadable. This keeps that safe: change the selector and this throws with the reason, instead of
// every case quietly becoming a refusal that passes two rows and fails five.
if (HOST_PRIMITIVES.TextInput.intrinsicWhen.prop !== 'multiline') {
  throw new Error(
    `the intrinsic selector is now "${HOST_PRIMITIVES.TextInput.intrinsicWhen.prop}" — update the snippets`,
  );
}

const metroVueTransformer = require_('./metro-vue-transformer.cjs');
const symbioteVueJsx = require_('./babel-jsx.cjs');

const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;

// Named for the OUTCOME rather than for the tag, so a spec that renames an intrinsic changes one
// constant above and no case below.
type IVerdict = 'singleline' | 'multiline' | 'refuse';

let nextFile = 0;

// The tag family is now FOUR names, each a prefix of the next, and every one of them is a substring
// trap for a helper built on `includes`:
//
//   symbiote-text-input                      lowered, single line
//   symbiote-text-input-multiline            lowered, multiline
//   symbiote-text-input-managed              component path, single line
//   symbiote-text-input-multiline-managed    component path, multiline
//
// The `-managed` pair belongs to the WRAPPER (core/components/src/view/render-text-input.ts) and is
// produced at render time, so it should never appear in a transform's output. If it ever did, a
// naive `includes` would read a REFUSAL — the component surviving — as a successful lowering, which
// is the exact false green this file exists to prevent. So it is rejected explicitly rather than
// left to the fact that it does not currently leak.
function verdictOf(code: string): IVerdict {
  const managed = `${SINGLELINE}-managed`;
  if (code.includes(managed)) {
    throw new Error(
      `a transform emitted the wrapper's own tag (${managed}) — every verdict below would read a ` +
        'refusal as a lowering',
    );
  }
  // Longest first: MULTILINE contains SINGLELINE as a prefix, and the reverse order reports every
  // multiline lowering as single-line with the whole table passing for the wrong reason.
  if (code.includes(MULTILINE)) return 'multiline';
  if (code.includes(SINGLELINE)) return 'singleline';
  return 'refuse';
}

async function sfcVerdict(attributes: string): Promise<IVerdict> {
  nextFile += 1;
  const source = `<script setup lang="ts">
import { TextInput } from '@symbiote-native/vue';
declare const isLong: boolean;
</script>
<template><TextInput ${attributes} /></template>`;
  return verdictOf(await compileSfc(source, `/choice/${nextFile}.vue`));
}

async function jsxVerdict(attributes: string): Promise<IVerdict> {
  const result = await transformAsync(
    `import { TextInput } from '@symbiote-native/vue';
const isLong = true;
const el = <TextInput ${attributes} />;`,
    {
      filename: 'choice.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx(),
    },
  );
  return verdictOf(result?.code ?? '');
}

// One table, both paths. The two mechanisms are different by construction — `@vue/compiler-sfc`
// hands over an expression as SOURCE TEXT, Babel hands over an AST — so they are asserted EQUAL to
// each other before either is compared to the expected verdict. A divergence must read as the paths
// disagreeing, not as whichever is checked first being wrong.
const CASES: ReadonlyArray<{
  what: string;
  sfc: string;
  jsx: string;
  expected: IVerdict;
}> = [
  {
    what: 'a bare multiline attribute is the template spelling of true',
    sfc: 'multiline',
    jsx: 'multiline',
    expected: 'multiline',
  },
  {
    what: 'an explicit literal true',
    sfc: ':multiline="true"',
    jsx: 'multiline={true}',
    expected: 'multiline',
  },
  {
    what: 'no multiline prop at all',
    sfc: '',
    jsx: '',
    expected: 'singleline',
  },
  {
    what: 'an explicit literal false',
    sfc: ':multiline="false"',
    jsx: 'multiline={false}',
    expected: 'singleline',
  },
  {
    what: 'a runtime value the transform cannot resolve',
    sfc: ':multiline="isLong"',
    jsx: 'multiline={isLong}',
    expected: 'refuse',
  },
  {
    // Not in the five shapes the category was specified with, and it refuses on purpose: the
    // component would read this string as truthy, and `multiline="false"` is truthy too. Pinned so
    // the choice is visible rather than incidental.
    what: 'a string attribute that merely looks boolean',
    sfc: 'multiline="false"',
    jsx: 'multiline="false"',
    expected: 'refuse',
  },
  {
    // The boundary is IDENTITY, not truthiness — `1` is not `true`. Found independently by Svelte
    // as `multiline={1}` and by this file as `multiline="false"`: the same hole from two sides, one
    // where a truthy value would wrongly select multiline and one where a truthy value spells a
    // word that means the opposite.
    what: 'a numeric literal is not the boolean true',
    sfc: ':multiline="1"',
    jsx: 'multiline={1}',
    expected: 'refuse',
  },
  {
    // A spread can carry `multiline` and cannot be read, which is indistinguishable from the prop
    // being absent — so it must not fall through to the single-line default.
    what: 'a spread that may hide the selector prop',
    sfc: 'v-bind="rest"',
    jsx: '{...rest}',
    expected: 'refuse',
  },
];

describe('a prop that selects between two intrinsics', () => {
  it.each(CASES)('$what', async testCase => {
    const [sfc, jsx] = await Promise.all([
      sfcVerdict(testCase.sfc),
      jsxVerdict(testCase.jsx),
    ]);

    expect(sfc, 'the SFC and JSX paths must agree').toBe(jsx);
    expect(sfc).toBe(testCase.expected);
  });
});
