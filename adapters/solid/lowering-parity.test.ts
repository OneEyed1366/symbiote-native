// The SHARED verdict table (`@symbiote-native/components/lowering-fixtures`), answered by Solid.
//
// WHY THIS FILE ARRIVED LAST, WHICH IS THE POINT. The table is the fifth parity surface in
// `.claude/rules/adapter-parity-audit.md` — the one no barrel, subpath, `files` or export audit can
// see, because a transform that lowers a call site its sibling refuses leaves every suite green. It
// was written with runners for Svelte and both Vue paths, and Solid's transform was not in it. That
// is the same shape that rule already records twice under "Check Solid last and separately": the
// most recently added member is the one every older list omits, and no audit detects a member
// absent from the list being audited.
//
// Solid's plumbing is a Babel plugin over a real AST, like Vue's JSX path and unlike Vue's SFC path
// (source text) or Svelte's preprocessor (ESTree in, text out). Sharing the spec and the specialiser
// proves nothing about the ANSWER — that is what this file asserts.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

import loweringFixtures from '@symbiote-native/components/lowering-fixtures';

interface ILoweringCase {
  id: string;
  what: string;
  expected: 'lower' | 'refuse';
  why: string;
}

const { LOWERING_CASES }: { LOWERING_CASES: ILoweringCase[] } =
  loweringFixtures;

const require_ = createRequire(import.meta.url);
const {
  HOST_PRIMITIVES,
}: {
  HOST_PRIMITIVES: Record<
    string,
    { intrinsic: string; intrinsicWhen?: { prop: string; intrinsic: string } }
  >;
} = require_('@symbiote-native/components/host-primitives');

// The two `intrinsic-choice` rows read the REAL `HOST_PRIMITIVES.TextInput`, which landed
// 2026-08-31 once the machine was registered and the component path moved off the shared tag. They
// were fed by a self-expiring injection until then, and the control below is what remains of that:
// without an entry `<TextInput>` is not lowerable at all, so it refuses, and `refuse` is what these
// rows expect — green while the rule they name was never reached. The control keeps that
// distinguishable if the entry is ever withdrawn again.
const lowerHostPrimitives = require_('./babel-lower-host-primitives.cjs');
const presetSolid = require_('babel-preset-solid');

const IMPORT =
  "import { Image, InputAccessoryView, Pressable, Switch, Text, TextInput } from '@symbiote-native/solid';\n";

/** The same case as every other adapter asks it, in Solid's syntax. */
const SNIPPETS: Record<
  string,
  { attr: string; child?: string; component?: string }
> = {
  'inert-object-style': { attr: 'style={{ borderColor: c }}' },
  'hoisted-identifier-style': { attr: 'style={fnStyle}' },
  'specialisable-state-style': {
    attr: 'style={({ pressed }) => ({ o: pressed ? 1 : 2 })}',
  },
  'nested-function-state-style': {
    attr: 'style={({ pressed }) => ({ f: () => pressed })}',
  },
  'call-expression-style': { attr: 'style={getStyle()}' },
  'computed-member-style': { attr: 'style={bag[i]}' },
  'conditional-style': { attr: 'style={flag ? a : b}' },
  // A zero-arity function child is Solid's ordinary lazy child, not a render prop — the shape
  // `ActionButton` writes, and the one a naive `typeof child === 'function'` rule would throw away.
  'zero-arity-child': { attr: '', child: '{() => <Text>y</Text>}' },
  'render-prop-child': {
    attr: '',
    child: '{state => <Text>{state().pressed}</Text>}',
  },
  'spread-attributes': { attr: '{...rest}' },
  // `ref` binds the component INSTANCE, which a lowered element does not have.
  'instance-bound-directive': { attr: 'ref={handle}' },
  // Both spellings on one element: `role` has no prefix and the `aria-` family does, and a
  // transform can plausibly detect one and miss the other.
  'aria-bag-fold': { attr: 'role="button" aria-label="close"' },
  // TextInput, not Pressable: these two are about the prop that SELECTS between two intrinsics.
  // Vetted against the spec below — the selector NAME is spelled literally here because a case
  // built from a variable is unreadable, and a literal that stops matching the spec would quietly
  // turn both rows into "a prop the transform has never heard of", which lowers.
  'intrinsic-choice-dynamic': {
    attr: 'multiline={isLong}',
    component: 'TextInput',
  },
  'intrinsic-choice-nonboolean-literal': {
    attr: 'multiline={1}',
    component: 'TextInput',
  },
  // Image, and with NO child: it is a leaf, and the harness's default `<Text>y</Text>` would put a
  // child on an element that cannot have one. The row is about the tag being recognised at all.
  'image-fold-only': { attr: '', child: '', component: 'Image' },
  // Both leaves like Image, so no child. `Switch` is the interesting one: it has an engine machine
  // but no compile-time refusal, so its verdict must not depend on the machine — which is exactly
  // what the shared row says and what this snippet lets Solid answer.
  'input-accessory-view-fold-only': {
    attr: '',
    child: '',
    component: 'InputAccessoryView',
  },
  'switch-fold-only': { attr: '', child: '', component: 'Switch' },
};

// The lowered marker, per component, read from the spec rather than written down.
//
// For TextInput this is `symbiote-text-input`, a PREFIX of BOTH sibling tags — the lowered
// `-multiline` and, since the component path was split off, the wrapper's `-managed`. Here that is
// exactly right rather than the trap it looks like. The table's verdict is lower/refuse, i.e. "did
// ANY intrinsic get emitted", and because the base is a prefix, finding it covers the family while
// not finding it rules the family out. WHICH tag was chosen is a different question, one this table
// cannot ask (its vocabulary has no room for it), and it is pinned in
// `babel-lower-text-input.test.ts` where the output text is available.
//
// `-managed` does not break that, and the reason is measured rather than assumed: the wrapper
// prints its tag at RUNTIME, from inside the component, so it never reaches the compiled call site.
// Verified 2026-08-31 — a refused `<TextInput multiline={isLong} />` contains none of the three,
// a lowered `<TextInput />` contains only the base. If the wrapper ever emitted its tag statically,
// this function would start reading a REFUSAL as a lowering and every `refuse` row here would go
// quietly green.
// The selector name is a literal in the two TextInput snippets above. If the spec renames it, those
// snippets stop naming the selector at all and the rows fail for a reason that has nothing to do
// with the rule — so the mismatch is reported here, in a sentence, rather than as two puzzling
// verdicts. This is the shape a peer proposed for Vue's runner and it is worth having.
const SELECTOR_IN_SNIPPETS = 'multiline';
const declaredSelector = HOST_PRIMITIVES.TextInput?.intrinsicWhen?.prop;
if (declaredSelector !== SELECTOR_IN_SNIPPETS) {
  throw new Error(
    `the TextInput selector is now "${String(declaredSelector)}" but the snippets in this file ` +
      `still write "${SELECTOR_IN_SNIPPETS}" — update them, or the two intrinsic-choice rows ` +
      `stop exercising the rule they name`,
  );
}

// The tag alphabet is a PREFIX FAMILY and the marker must be matched with a boundary, not by
// substring. `symbiote-text-input` is a prefix of `-multiline`, of `-managed`, and of
// `-multiline-managed` — four names as of 2026-08-31, when the component path was moved off the
// lowered tag. A bare `includes` reads any of the four as "the lowered tag is present", so a
// refusal that happened to emit a longer sibling would report LOWER and the detection would never
// be called. babel-preset-solid emits the tag as a quoted string argument
// (`_$createElement("symbiote-text-input")`), so the quotes ARE the boundary and cost nothing.
//
// It cannot leak today — no transform emits a `-managed` tag; the wrappers print it at render time.
// Pinning it on that is the same "safe because nobody has written it yet" the tag split itself was
// made to stop relying on. Found by the Vue session auditing its own oracle after the split.
//
// The quoting closed a false GREEN and opened a false RED, which is the family's two-sided nature
// biting from the other end: `"symbiote-text-input"` is not a substring of
// `"symbiote-text-input-multiline"`, so a MULTILINE lowering read as `refuse`. Measured, not
// reasoned — `<TextInput multiline />` compiled to the multiline tag and the verdict came back
// `refuse`. No row exercises it today (both intrinsic-choice rows expect `refuse` and nothing in
// the table lowers a multiline TextInput), which is exactly why it was silent and would have
// mis-answered the first row that did.
//
// So the marker is the whole FAMILY, not the base: every quoted tag this primitive can emit. The
// verdict asks "did any of them get emitted", which is what lower/refuse means.
function loweredMarkersFor(component: string): string[] {
  const entry = HOST_PRIMITIVES[component];
  if (entry === undefined)
    throw new Error(`no HOST_PRIMITIVES entry for ${component}`);
  const family = [entry.intrinsic];
  if (entry.intrinsicWhen !== undefined)
    family.push(entry.intrinsicWhen.intrinsic);
  return family.map(tag => `"${tag}"`);
}

async function verdict(id: string): Promise<'lower' | 'refuse'> {
  const snippet = SNIPPETS[id];
  const component = snippet.component ?? 'Pressable';
  const child = snippet.child ?? '<Text>y</Text>';
  const result = await transformAsync(
    `${IMPORT}const el = <${component} class="x" ${snippet.attr}>${child}</${component}>;`,
    {
      filename: 'parity.jsx',
      babelrc: false,
      configFile: false,
      plugins: [lowerHostPrimitives],
      presets: [
        [presetSolid, { generate: 'universal', moduleName: '../renderer' }],
      ],
    },
  );
  const code = result?.code ?? '';
  return loweredMarkersFor(component).some(marker => code.includes(marker))
    ? 'lower'
    : 'refuse';
}

// THE ORACLE'S OWN TEST, because the hazard it guards cannot be reached through the transform.
// No transform emits a `-managed` tag — the wrappers print it at render time — so flipping the
// marker back to a bare substring leaves every row green, and a break-test routed through
// `verdict()` is an arm that moves nothing (`.claude/rules/verify-the-deciding-side.md`). Asserting
// on the reader directly is the only form that distinguishes the implementations.
//
// Phrased as what the reader ANSWERS, not as what a marker contains. The first version of this
// block asserted the multiline tag must NOT match, which pinned the false RED the quoting had just
// introduced: a lowered `<TextInput multiline />` is a LOWERING, and an oracle that calls it a
// refusal is wrong in the other direction. The family fails both ways and a test written from one
// side ratifies the other.
describe('what the lowered-marker reader answers', () => {
  const read = (code: string): 'lower' | 'refuse' =>
    loweredMarkersFor('TextInput').some(marker => code.includes(marker))
      ? 'lower'
      : 'refuse';

  it.each([
    ['the base tag', '_$createElement("symbiote-text-input")', 'lower'],
    // A lowering too — it is the tag the transform picks for `multiline`.
    [
      'the multiline tag',
      '_$createElement("symbiote-text-input-multiline")',
      'lower',
    ],
    // The WRAPPER's tag: the element stayed a component, so this is a refusal.
    [
      'the managed tag',
      '_$createElement("symbiote-text-input-managed")',
      'refuse',
    ],
  ])('reads %s as %s', (_what, code, expected) => {
    expect(read(code)).toBe(expected);
  });

  // The boundary property the quoting exists for, stated once: no member of the family may be
  // satisfied by a LONGER sibling. Under a bare `includes(entry.intrinsic)` the managed row above
  // reads `lower` and the whole guard is gone.
  it('matches each tag with a boundary, not as a prefix', () => {
    for (const marker of loweredMarkersFor('TextInput')) {
      expect(marker.startsWith('"')).toBe(true);
      expect(marker.endsWith('"')).toBe(true);
    }
  });
});

describe('the shared lowering table, answered by Solid', () => {
  LOWERING_CASES.forEach(testCase => {
    it(`${testCase.id}: ${testCase.expected} — ${testCase.what}`, async () => {
      expect(
        SNIPPETS[testCase.id],
        `the shared table gained "${testCase.id}" and Solid has not declared a snippet for it`,
      ).toBeDefined();

      expect(await verdict(testCase.id), testCase.why).toBe(testCase.expected);
    });
  });
});

// `REFUSAL_CATEGORIES.emitStyleExpressionOnce`. The three opaque shapes lower, and that verdict is
// only correct while the emitted code reads the expression ONCE — an inline guard prints it on both
// the resting and the pressed prop, so `getStyleOnce()` would run twice per bag build and
// `flagOnce ? a : b` could take different branches on the two reads. Asserting the verdict alone
// would ratify exactly the emission that rule forbids, so the count is asserted on the OUTPUT TEXT,
// which is the only place the property is observable.
describe('an opaque style expression reaches the output exactly once', () => {
  const OPAQUE = [
    { id: 'call', expr: 'getStyleOnce()', token: 'getStyleOnce' },
    { id: 'computed', expr: 'bagOnce[iOnce]', token: 'bagOnce' },
    { id: 'conditional', expr: 'flagOnce ? aOnce : bOnce', token: 'flagOnce' },
  ];

  function occurrences(source: string, token: string) {
    return source.split(token).length - 1;
  }

  OPAQUE.forEach(shape => {
    it(`${shape.id}: read once`, async () => {
      const result = await transformAsync(
        `${IMPORT}const el = <Pressable class="x" style={${shape.expr}}><Text>y</Text></Pressable>;`,
        {
          filename: 'once.jsx',
          babelrc: false,
          configFile: false,
          plugins: [lowerHostPrimitives],
          presets: [
            [presetSolid, { generate: 'universal', moduleName: '../renderer' }],
          ],
        },
      );
      expect(occurrences(result?.code ?? '', shape.token)).toBe(1);
    });
  });
});
