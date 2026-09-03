// The SHARED verdict table (`@symbiote-native/components/lowering-fixtures`) answered by BOTH Vue
// lowering transforms.
//
// WHY VUE RUNS IT TWICE. Vue is the only adapter carrying two lowering paths, and they cannot share
// plumbing: `@vue/compiler-sfc` hands a transform an expression as SOURCE TEXT while the JSX path
// holds a Babel AST. Two mechanisms implementing one rule is the shape that drifts, and the drift
// is silent — the same call site lowers in TSX, stays a component in SFC, both suites green, and
// the only symptom is one authoring style being mysteriously slower. So the two paths are asserted
// EQUAL to each other before either is compared to the table: a divergence must read as the paths
// disagreeing, not as whichever the table lists first being wrong. Both are then checked against
// the table, because agreement alone is satisfied by two identically-broken transforms.
//
// Adding a row to the shared table with no snippet here fails loudly, which is the point — a new
// case forces every transform to declare where it stands rather than silently skipping.

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

import loweringFixtures from '@symbiote-native/components/lowering-fixtures';
import {
  renderSwitch,
  renderTextInput,
  resolveTextInputProps,
} from '@symbiote-native/components';

const require_ = createRequire(import.meta.url);

// The `TextInput` entry the two `intrinsic-choice` rows need, from the ONE shared self-expiring
// module rather than a local copy — two copies of this entry have already drifted once (`aliases:
// {}` against the real `ID_ALIAS`), and the tests then measured a configuration that does not ship.
//
// WITHOUT it those rows still PASS, which is the whole reason it is here: `<TextInput>` is not a
// lowerable primitive at all, so it refuses, and `refuse` is what the table expects. The row would
// be green while the rule it names was never reached. The control below answers "did the rule get
// reached"; this answers "does the rule exist at all", and a row needs both.
//
// It lives in `core/test-utils` and NOT beside the spec it shadows, which is worth stating because
// `core/components` is the intuitive answer and the wrong one: the three `.cjs` files next to
// `host-primitives.cjs` are public subpaths of a shipped package, and a module whose entire job is
// to MUTATE the spec cannot be public API. What is shared here is a test fixture, not a
// specification.
//
const {
  HOST_PRIMITIVES,
}: {
  HOST_PRIMITIVES: Record<
    string,
    { intrinsic: string; intrinsicWhen?: { intrinsic: string } }
  >;
} = require_('@symbiote-native/components/host-primitives');
const symbioteVueJsx = require_('./babel-jsx.cjs');
const metroVueTransformer = require_('./metro-vue-transformer.cjs');

const { LOWERING_CASES }: { LOWERING_CASES: ILoweringCase[] } =
  loweringFixtures;

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

interface ILoweringCase {
  id: string;
  what: string;
  expected: 'lower' | 'refuse';
  why: string;
}

/**
 * The same case in each syntax. `sfc`/`jsx` are spliced into the opening tag of `tag`, which
 * defaults to `Pressable` — the primitive most rows are about. A row whose rule belongs to a
 * different primitive names it, with the intrinsic that counts as "lowered" for it.
 */
const SNIPPETS: Record<
  string,
  {
    sfc: string;
    jsx: string;
    child?: boolean;
    tag?: string;
    lowered?: string;
    /**
     * The shape on this same tag that MUST lower — the positive control, required whenever `tag`
     * is set. Without it a `refuse` row is satisfied by the primitive not being lowerable AT ALL,
     * which is the state the spec is in whenever an entry is withheld: the row reports the
     * expected verdict having never invoked the detection. Measured 2026-08-31 — both
     * intrinsic-choice rows passed green the moment `HOST_PRIMITIVES.TextInput` was withdrawn.
     */
    control?: { sfc: string; jsx: string };
  }
> = {
  'inert-object-style': {
    sfc: ':style="{ borderColor: c }"',
    jsx: 'style={{ borderColor: c }}',
  },
  'hoisted-identifier-style': {
    sfc: ':style="fnStyle"',
    jsx: 'style={fnStyle}',
  },
  'specialisable-state-style': {
    sfc: ':style="({ pressed }) => ({ o: pressed ? 1 : 2 })"',
    jsx: 'style={({ pressed }) => ({ o: pressed ? 1 : 2 })}',
  },
  'nested-function-state-style': {
    sfc: ':style="({ pressed }) => ({ f: () => pressed })"',
    jsx: 'style={({ pressed }) => ({ f: () => pressed })}',
  },
  'call-expression-style': {
    sfc: ':style="getStyle()"',
    jsx: 'style={getStyle()}',
  },
  'computed-member-style': { sfc: ':style="bag[i]"', jsx: 'style={bag[i]}' },
  'conditional-style': {
    sfc: ':style="flag ? a : b"',
    jsx: 'style={flag ? a : b}',
  },
  // Children that do not read the state. An SFC writes them as plain children; a JSX zero-arity
  // function child is the nearest equivalent, and `<template #default>` deliberately is NOT —
  // that construct refuses on the SFC path for a codegen reason of its own, pinned in
  // metro-vue-transformer.test.ts rather than smuggled in here as if it were this case.
  'zero-arity-child': { sfc: '', jsx: '', child: true },
  'render-prop-child': { sfc: 'v-slot="{ pressed }"', jsx: '', child: true },
  // Neither Vue transform ever carried a `bagFold` refusal, so both already lowered this — the
  // aliases then reached Fabric unfolded, which the engine's fold in `fabricProps` now closes.
  // Behaviour pinned end to end in fold-parity.test.ts; this row only records the verdict.
  'aria-bag-fold': {
    sfc: 'role="button" aria-label="x"',
    jsx: 'role="button" aria-label="x"',
  },
  'spread-attributes': { sfc: 'v-bind="rest"', jsx: '{...rest}' },
  // TextInput, not Pressable: `multiline` is the only prop in the spec that selects between two
  // intrinsics, and the rule under test does not exist on a primitive with one tag.
  //
  // `symbiote-text-input` is a PREFIX of `symbiote-text-input-multiline`, so this `lowered`
  // string matches either tag. That is correct here and deliberately noted: both rows expect
  // `refuse`, so any emitted tag must fail them, and a prefix match is the widest net. A future
  // row asserting WHICH tag was chosen cannot be expressed this way and does not belong in this
  // table at all — see the fixture file's note beside these ids.
  'intrinsic-choice-dynamic': {
    sfc: ':multiline="isLong"',
    jsx: 'multiline={isLong}',
    tag: 'TextInput',
    lowered: 'symbiote-text-input',
  },
  'intrinsic-choice-nonboolean-literal': {
    sfc: ':multiline="1"',
    jsx: 'multiline={1}',
    tag: 'TextInput',
    lowered: 'symbiote-text-input',
  },
  // `ref` is the construct that binds the INSTANCE in both syntaxes, and lowering changes what it
  // yields — a component instance becomes an engine node.
  'instance-bound-directive': { sfc: 'ref="handle"', jsx: 'ref={handle}' },
  // A fold-only primitive carries no attribute worth refusing, so this row is about the DEFAULT
  // verdict rather than about a construct. The attribute is `alt` — one the fold CONSUMES — so a
  // pass here cannot come from the transform simply ignoring a primitive it does not know.
  'image-fold-only': {
    sfc: 'alt="a"',
    jsx: 'alt="a"',
    tag: 'Image',
    lowered: 'symbiote-image',
  },
  // The second fold-only name. `nativeID` is the one prop this primitive genuinely carries, so the
  // row cannot pass on a transform that recognises the tag but drops everything on it.
  // Switch is the first row whose base tag is a PREFIX of a real sibling
  // (`symbiote-switch-managed`), so what proves the verdict is the runner's quoted marker plus the
  // wrapper-tag throw above — not `includes('symbiote-switch')`, which both names satisfy.
  //
  // `value` rather than a bare tag: the primitive's own controlled prop, so a pass cannot come from
  // a transform that recognises the name and drops what is on it.
  'switch-fold-only': {
    sfc: ':value="flag"',
    jsx: 'value={flag}',
    tag: 'Switch',
    lowered: 'symbiote-switch',
  },
  'input-accessory-view-fold-only': {
    sfc: 'nativeID="bar"',
    jsx: 'nativeID="bar"',
    tag: 'InputAccessoryView',
    lowered: 'symbiote-input-accessory-view',
  },
};

const CHILDREN: Record<string, { sfc: string; jsx: string }> = {
  'zero-arity-child': { sfc: '<Text>y</Text>', jsx: '{() => <Text>y</Text>}' },
  'render-prop-child': {
    sfc: '{{ pressed }}',
    jsx: '{({ pressed }) => <Text>{pressed}</Text>}',
  },
};

const DEFAULT_TAG = 'Pressable';
const DEFAULT_LOWERED = 'symbiote-pressable';

// A verdict is "did ANY tag this primitive can emit reach the output", and the marker must be a
// FAMILY matched with a boundary. `symbiote-text-input` is the base of four names — `-multiline`,
// `-managed`, `-multiline-managed` — so the two obvious readers are wrong in opposite directions:
// a bare substring reads the wrapper's `-managed` as a lowering (false green), and a single quoted
// tag reads a genuinely lowered `multiline` as a refusal (false red, because `"…-input"` is not a
// substring of `"…-input-multiline"`). Both emitters print the tag as a quoted argument, so the
// quotes are the boundary; the family comes off the spec so a rename cannot leave it behind.
function markersFor(base: string): string[] {
  const entry = Object.values(HOST_PRIMITIVES).find(p => p.intrinsic === base);
  // A base no entry claims would silently degrade to a one-name family — the false-red case, and
  // silent, since a `refuse` verdict is what most rows expect anyway.
  if (entry === undefined) {
    throw new Error(`no HOST_PRIMITIVES entry emits "${base}"`);
  }
  const family = [base];
  if (entry.intrinsicWhen !== undefined)
    family.push(entry.intrinsicWhen.intrinsic);
  return family.map(tag => `"${tag}"`);
}

// Every tag the WRAPPER renders, ASKED OF THE WRAPPER rather than restated. The two `-managed`
// names are module-private constants in render-text-input.ts, so a literal list here would go stale
// on a rename with nothing to say so — and the thing it guards would silently stop being guarded.
// Rendering a descriptor is the cheapest way to make the wrapper answer for itself.
//
// None of these can reach a transform's output today: they are produced at render time. That is
// precisely why the reader THROWS on one instead of deciding — a leak would otherwise read as a
// lowering, and the whole table would go green on refusals.
const WRAPPER_TAGS = [
  ...[false, true].map(multiline => {
    const descriptor = renderTextInput({
      multiline,
      text: undefined,
      mostRecentEventCount: 0,
      folded: resolveTextInputProps({}),
      passthrough: {},
    });
    return `"${descriptor.type}"`;
  }),
  // Switch gained a `-managed` split after this list was written, and a list derived from ONE
  // render fn does not grow with the alphabet — it just silently stops covering the newcomer. The
  // failure here would be a false REFUSE rather than a false lower (the quoted marker
  // `"symbiote-switch"` cannot match `"symbiote-switch-managed"`), which is the safer direction and
  // still reads as a transform verdict rather than as a leak.
  //
  // `platform` is stubbed because the tag does not depend on it — `renderSwitch` ends in an
  // unconditional `el(SWITCH_MANAGED_INTRINSIC, …)` — so the derivation still answers with whatever
  // the render fn currently emits and survives a rename of the private constant.
  `"${renderSwitch({ value: false, passthrough: {} }, { trackColorProps: () => ({}) }).type}"`,
];

function verdictOf(code: string, base: string): 'lower' | 'refuse' {
  const leaked = WRAPPER_TAGS.find(tag => code.includes(tag));
  if (leaked !== undefined)
    throw new Error(
      `the transform emitted ${leaked}, a tag only a component wrapper renders — the verdict ` +
        `below cannot tell that from a lowering`,
    );
  return markersFor(base).some(marker => code.includes(marker))
    ? 'lower'
    : 'refuse';
}

const SFC_HEAD = `<script setup lang="ts">
import { Image, InputAccessoryView, Pressable, Switch, Text, TextInput } from '@symbiote-native/vue';
declare const c: string; declare const isLong: boolean; declare const fnStyle: unknown; declare const flag: boolean;
declare const getStyle: () => object; declare const bag: Record<string, unknown>;
declare const i: string; declare const a: object; declare const b: object;
declare const rest: object; declare const handle: unknown;
</script>
<template>`;

const JSX_HEAD =
  "import { Image, InputAccessoryView, Pressable, Switch, Text, TextInput } from '@symbiote-native/vue';\nconst isLong = true;\n";

function childrenFor(id: string, syntax: 'sfc' | 'jsx') {
  return CHILDREN[id]?.[syntax] ?? (syntax === 'sfc' ? '<Text>y</Text>' : '');
}

async function sfcVerdict(id: string, index: number, useControl = false) {
  const snippet = SNIPPETS[id];
  const tag = snippet.tag ?? DEFAULT_TAG;
  const body =
    snippet.tag === undefined ? `>${childrenFor(id, 'sfc')}</${tag}>` : ' />';
  const attributes = useControl ? (snippet.control?.sfc ?? '') : snippet.sfc;
  const src = `${SFC_HEAD}\n  <${tag} class="x" ${attributes}${body}\n</template>`;
  const code = await compileSfc(src, `/parity/sfc-${index}.vue`);
  return verdictOf(code, snippet.lowered ?? DEFAULT_LOWERED);
}

async function jsxVerdict(id: string, useControl = false) {
  const snippet = SNIPPETS[id];
  const tag = snippet.tag ?? DEFAULT_TAG;
  const body =
    snippet.tag === undefined ? `>${childrenFor(id, 'jsx')}</${tag}>` : ' />';
  const result = await transformAsync(
    `${JSX_HEAD}const el = <${tag} class="x" ${useControl ? (snippet.control?.jsx ?? '') : snippet.jsx}${body};`,
    {
      filename: 'parity.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx(),
    },
  );
  return verdictOf(result?.code ?? '', snippet.lowered ?? DEFAULT_LOWERED);
}

// THE READER'S OWN TEST. No row in the table lowers a `multiline`, and no transform can emit a
// wrapper tag, so BOTH failure directions are unreachable through a snippet — a break routed
// through the runner moves nothing. Asserting on `verdictOf` directly is the only form that
// separates the implementations.
describe('the verdict reader handles the prefix family', () => {
  const emit = (tag: string) => `_createElementVNode("${tag}", null)`;

  it('reads either lowered tag as a lowering', () => {
    expect(verdictOf(emit('symbiote-text-input'), 'symbiote-text-input')).toBe(
      'lower',
    );
    // Dropped from the family, this reads `refuse`: a quoted base is not a substring of a quoted
    // longer sibling.
    expect(
      verdictOf(emit('symbiote-text-input-multiline'), 'symbiote-text-input'),
    ).toBe('lower');
  });

  // The negative arm. Without it a reader that answered 'lower' unconditionally would satisfy both
  // cases above — and the table's own refusal rows, which do catch that today, are not this block's
  // to rely on: its whole premise is that the table cannot reach these paths.
  it('reads output carrying no tag of the family as a refusal', () => {
    expect(
      verdictOf('_createVNode(TextInput, null)', 'symbiote-text-input'),
    ).toBe('refuse');
    // A DIFFERENT primitive's tag is not this base's family either.
    expect(verdictOf(emit('symbiote-view'), 'symbiote-text-input')).toBe(
      'refuse',
    );
  });

  // The quotes in `markersFor` are the WHOLE-NAME boundary, and this is the only case that holds
  // them: measured, dropping them leaves the other five green, because the one string that would
  // exploit a prefix match today (`…-managed`) is caught by the leak check first. That makes the
  // boundary look redundant and it is not — the family gained two names in a day, and the next tag
  // sharing this prefix has no reason to be a wrapper tag.
  it('matches a whole tag, not a prefix of a longer one', () => {
    expect(
      verdictOf(emit('symbiote-text-input-someday'), 'symbiote-text-input'),
    ).toBe('refuse');
  });

  // The default base has no `intrinsicWhen`, so its family is one name. Every row but two runs
  // through this path, and nothing else asserts that a single-name family still matches.
  it('handles a base with no second intrinsic', () => {
    expect(verdictOf(emit(DEFAULT_LOWERED), DEFAULT_LOWERED)).toBe('lower');
    expect(verdictOf(emit('symbiote-view'), DEFAULT_LOWERED)).toBe('refuse');
  });

  it('refuses to guess when a wrapper tag leaks into the output', () => {
    expect(() =>
      verdictOf(emit('symbiote-text-input-managed'), 'symbiote-text-input'),
    ).toThrow(/only a component wrapper renders/);
    expect(() =>
      verdictOf(
        emit('symbiote-text-input-multiline-managed'),
        'symbiote-text-input',
      ),
    ).toThrow(/only a component wrapper renders/);
    // Switch, the second `-managed` family. Its own row cannot witness this: no transform emits a
    // managed tag — the wrappers print it at render time — so removing Switch from WRAPPER_TAGS
    // leaves the whole table green. Asserted on the READER directly for that reason, which is the
    // only shape that separates "the guard covers this family" from "nothing reaches the guard".
    expect(() =>
      verdictOf(emit('symbiote-switch-managed'), 'symbiote-switch'),
    ).toThrow(/only a component wrapper renders/);
  });
});

describe('the shared lowering table, answered by both Vue paths', () => {
  LOWERING_CASES.forEach((testCase, index) => {
    it(`${testCase.id}: ${testCase.expected} — ${testCase.what}`, async () => {
      expect(
        SNIPPETS[testCase.id],
        `the shared table gained "${testCase.id}" and Vue has not declared a snippet for it`,
      ).toBeDefined();

      // A row on a NON-DEFAULT tag runs its control first. A `refuse` verdict is ambiguous by
      // construction — "the transform refused" and "the primitive is not lowerable at all" produce
      // the same string — and the second is a live state, not a hypothetical: the spec withholds an
      // entry whenever its runtime half is not wired yet. Without this, both intrinsic-choice rows
      // report green with the detection never invoked, which is the exact failure this table exists
      // to prevent.
      const snippet = SNIPPETS[testCase.id];
      if (snippet.tag !== undefined) {
        const [sfcControl, jsxControl] = await Promise.all([
          sfcVerdict(testCase.id, index + LOWERING_CASES.length, true),
          jsxVerdict(testCase.id, true),
        ]);
        const unanswerable =
          `<${snippet.tag}> does not lower even in its control shape, so this row cannot ` +
          'distinguish a refusal from the primitive being absent from HOST_PRIMITIVES';
        expect(sfcControl, `SFC: ${unanswerable}`).toBe('lower');
        expect(jsxControl, `TSX: ${unanswerable}`).toBe('lower');
      }

      const [sfc, jsx] = await Promise.all([
        sfcVerdict(testCase.id, index),
        jsxVerdict(testCase.id),
      ]);

      expect(sfc, `SFC and TSX must agree on "${testCase.id}"`).toBe(jsx);
      expect(sfc, testCase.why).toBe(testCase.expected);
    });
  });
});

// `REFUSAL_CATEGORIES.emitStyleExpressionOnce` — the requirement the three opaque shapes exist for.
// Their verdict is `lower`, which is only correct while the emitted code READS the expression once;
// an inline guard prints it on both props, so `getStyle()` would run four times per bag build and
// `flag ? a : b` could take different branches. Asserting the verdict alone would ratify exactly
// the emission this rule forbids, so the count is asserted too — on the OUTPUT TEXT, which is the
// only place the property is observable.
describe('an opaque style expression reaches the output exactly once', () => {
  const OPAQUE = [
    {
      id: 'call',
      sfc: 'getStyleOnce()',
      jsx: 'getStyleOnce()',
      token: 'getStyleOnce',
    },
    {
      id: 'computed',
      sfc: 'bagOnce[iOnce]',
      jsx: 'bagOnce[iOnce]',
      token: 'bagOnce',
    },
    {
      id: 'conditional',
      sfc: 'flagOnce ? aOnce : bOnce',
      jsx: 'flagOnce ? aOnce : bOnce',
      token: 'flagOnce',
    },
  ];

  // NO `declare const` here, unlike the table above, and that is the test working rather than a
  // shortcut: a declaration survives into the compiled output and counts as an occurrence, so the
  // assertion failed on the FIXTURE while the transform was emitting exactly once. An undeclared
  // name simply compiles to `_ctx.name`, which is what a template reference is anyway.
  const HEAD = `<script setup lang="ts">
import { Pressable, Text } from '@symbiote-native/vue';
</script>
<template>`;

  function occurrences(source: string, token: string) {
    return source.split(token).length - 1;
  }

  OPAQUE.forEach((shape, index) => {
    it(`${shape.id}: read once by both paths`, async () => {
      const sfc = await compileSfc(
        `${HEAD}\n  <Pressable class="x" :style="${shape.sfc}"><Text>y</Text></Pressable>\n</template>`,
        `/once/sfc-${index}.vue`,
      );
      const jsx =
        (
          await transformAsync(
            `${JSX_HEAD}const el = <Pressable class="x" style={${shape.jsx}}>y</Pressable>;`,
            {
              filename: 'once.jsx',
              babelrc: false,
              configFile: false,
              plugins: symbioteVueJsx(),
            },
          )
        )?.code ?? '';

      // The declaration is stripped from the compiled SFC, so every remaining occurrence is one the
      // transform emitted. In JSX the import head carries none of these names either.
      expect(
        occurrences(sfc, shape.token),
        'SFC emitted it more than once',
      ).toBe(1);
      expect(
        occurrences(jsx, shape.token),
        'TSX emitted it more than once',
      ).toBe(1);
      expect(sfc).toContain(DEFAULT_LOWERED);
      expect(jsx).toContain(DEFAULT_LOWERED);
    });
  });
});
