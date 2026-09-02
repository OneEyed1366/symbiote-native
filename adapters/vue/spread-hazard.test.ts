// A spread must refuse EXACTLY where the transform makes a decision the runtime cannot replay.
//
// The rule is not "a spread is unreadable, therefore refuse" and not "every fold is at runtime,
// therefore never" — both were proposed today and both are wrong. What matters is whether the
// decision taken from the attribute list can still be corrected afterwards:
//
//   id -> nativeID          patchProp folds it one key at a time, spread or not   no refusal needed
//   which intrinsic tag     the node is already created                           MUST refuse
//   style -> style+active   the expression is gone by runtime                     MUST refuse
//
// Vue has exactly two of the second kind, and each is guarded by a DIFFERENT mechanism that was
// built for another reason: Pressable by `unreadableAttributeSet` inside `refusesLowering` (reached
// only because Pressable carries `observesState`), TextInput by the spread branch of
// `resolveIntrinsic`. Neither knows about the other, so the coverage is real but assembled — a
// future primitive with a compile-time decision and NEITHER flag would fall through both. That is
// what this file is for; it is not a restatement of the parity table.
//
// The two direct cases are the controls, and they are not decoration: without them "refuse
// everywhere" reads identically to a probe that never compiled anything.

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

const require_ = createRequire(import.meta.url);
const metroVueTransformer = require_('./metro-vue-transformer.cjs');
const symbioteVueJsx = require_('./babel-jsx.cjs');

const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;

/**
 * The intrinsic a path emitted, or `refuse`.
 *
 * This used to carry a second field, `specialised`, reading `code.includes('activeStyle')` — whether
 * the state-style split had rewritten the attribute into a pair. That mechanism is gone: a
 * functional `style` now reaches `routeProp` untouched and the engine resolves it at both values of
 * `pressed`. Nothing emits `activeStyle`, so the field read `false` on every row and could no longer
 * separate anything.
 *
 * The control below does not need it. Its job is to prove that a `refuse` row is a real refusal
 * rather than a primitive nothing can lower, and the TAG alone carries that: the control lowers to
 * `symbiote-pressable` where the spread rows refuse.
 */
type IEmission = { tag: string | 'refuse' };

function emissionOf(code: string): IEmission {
  const match = code.match(/"(symbiote-[a-z-]+)"/);
  return { tag: match === null ? 'refuse' : match[1] };
}

let nextFile = 0;

async function sfcEmission(
  tag: string,
  attributes: string,
): Promise<IEmission> {
  nextFile += 1;
  const source = `<script setup lang="ts">
import { ${tag} } from '@symbiote-native/vue';
declare const bag: Record<string, unknown>;
</script>
<template><${tag} ${attributes} /></template>`;
  return emissionOf(await compileSfc(source, `/spread/${nextFile}.vue`));
}

async function jsxEmission(
  tag: string,
  attributes: string,
): Promise<IEmission> {
  const result = await transformAsync(
    `import { ${tag} } from '@symbiote-native/vue';
const bag = {};
const el = <${tag} ${attributes} />;`,
    {
      filename: 'spread.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx(),
    },
  );
  return emissionOf(result?.code ?? '');
}

const CASES: ReadonlyArray<{
  what: string;
  tag: string;
  sfc: string;
  jsx: string;
  expected: IEmission;
}> = [
  {
    what: 'CONTROL: a direct multiline picks the multiline intrinsic',
    tag: 'TextInput',
    sfc: 'multiline',
    jsx: 'multiline',
    expected: { tag: 'symbiote-text-input-multiline' },
  },
  {
    what: 'a spread that may carry multiline refuses rather than guessing the view',
    tag: 'TextInput',
    sfc: 'v-bind="bag"',
    jsx: '{...bag}',
    expected: { tag: 'refuse' },
  },
  {
    what: 'CONTROL: a direct functional style lowers, so a refusal above is a real refusal',
    tag: 'Pressable',
    sfc: ':style="({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })"',
    jsx: 'style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}',
    expected: { tag: 'symbiote-pressable' },
  },
  {
    what: 'a spread that may carry a functional style refuses rather than dropping it',
    tag: 'Pressable',
    sfc: 'v-bind="bag"',
    jsx: '{...bag}',
    expected: { tag: 'refuse' },
  },
  {
    // The other side of the rule, and the reason it is not "always refuse a spread": `View` takes
    // no decision from its attribute list, so refusing would cost the lowering of a common pattern
    // to guard a hazard it cannot have.
    what: 'a spread on a primitive that decides nothing still lowers',
    tag: 'View',
    sfc: 'v-bind="bag"',
    jsx: '{...bag}',
    expected: { tag: 'symbiote-view' },
  },
];

describe('a spread refuses where the transform decides, and only there', () => {
  it.each(CASES)('$what', async testCase => {
    const [sfc, jsx] = await Promise.all([
      sfcEmission(testCase.tag, testCase.sfc),
      jsxEmission(testCase.tag, testCase.jsx),
    ]);

    expect(sfc, 'the two Vue paths must agree').toEqual(jsx);
    expect(sfc).toEqual(testCase.expected);
  });
});
