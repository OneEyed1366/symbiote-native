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

import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

import symbioteVueJsx from './babel-jsx.cjs';
import metroVueTransformer from './metro-vue-transformer.cjs';
import loweringFixtures from '@symbiote-native/components/lowering-fixtures';

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

/** The same case in each syntax. `sfc`/`jsx` are spliced into a `<Pressable …>` opening tag. */
const SNIPPETS: Record<string, { sfc: string; jsx: string; child?: boolean }> =
  {
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
    'spread-attributes': { sfc: 'v-bind="rest"', jsx: '{...rest}' },
    // `ref` is the construct that binds the INSTANCE in both syntaxes, and lowering changes what it
    // yields — a component instance becomes an engine node.
    'instance-bound-directive': { sfc: 'ref="handle"', jsx: 'ref={handle}' },
  };

const CHILDREN: Record<string, { sfc: string; jsx: string }> = {
  'zero-arity-child': { sfc: '<Text>y</Text>', jsx: '{() => <Text>y</Text>}' },
  'render-prop-child': {
    sfc: '{{ pressed }}',
    jsx: '{({ pressed }) => <Text>{pressed}</Text>}',
  },
};

const LOWERED = 'symbiote-pressable';

const SFC_HEAD = `<script setup lang="ts">
import { Pressable, Text } from '@symbiote-native/vue';
declare const c: string; declare const fnStyle: unknown; declare const flag: boolean;
declare const getStyle: () => object; declare const bag: Record<string, unknown>;
declare const i: string; declare const a: object; declare const b: object;
declare const rest: object; declare const handle: unknown;
</script>
<template>`;

const JSX_HEAD = "import { Pressable, Text } from '@symbiote-native/vue';\n";

function childrenFor(id: string, syntax: 'sfc' | 'jsx') {
  return CHILDREN[id]?.[syntax] ?? (syntax === 'sfc' ? '<Text>y</Text>' : '');
}

async function sfcVerdict(id: string, index: number) {
  const snippet = SNIPPETS[id];
  const src = `${SFC_HEAD}\n  <Pressable class="x" ${snippet.sfc}>${childrenFor(id, 'sfc')}</Pressable>\n</template>`;
  const code = await compileSfc(src, `/parity/sfc-${index}.vue`);
  return code.includes(LOWERED) ? 'lower' : 'refuse';
}

async function jsxVerdict(id: string) {
  const snippet = SNIPPETS[id];
  const result = await transformAsync(
    `${JSX_HEAD}const el = <Pressable class="x" ${snippet.jsx}>${childrenFor(id, 'jsx')}</Pressable>;`,
    {
      filename: 'parity.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx(),
    },
  );
  return (result?.code ?? '').includes(LOWERED) ? 'lower' : 'refuse';
}

describe('the shared lowering table, answered by both Vue paths', () => {
  LOWERING_CASES.forEach((testCase, index) => {
    it(`${testCase.id}: ${testCase.expected} — ${testCase.what}`, async () => {
      expect(
        SNIPPETS[testCase.id],
        `the shared table gained "${testCase.id}" and Vue has not declared a snippet for it`,
      ).toBeDefined();

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
      expect(sfc).toContain(LOWERED);
      expect(jsx).toContain(LOWERED);
    });
  });
});
