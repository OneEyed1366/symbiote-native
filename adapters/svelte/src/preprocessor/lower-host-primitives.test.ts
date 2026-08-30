// The lowering preprocessor. Two halves are tested and both matter: what it REWRITES, and what it
// REFUSES to rewrite. The refusals are the safety property — an element whose attribute set this
// file cannot fully read must stay a component, because a half-read set is a silently wrong bag.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compile } from 'svelte/compiler';
import { resolveTextProps } from '@symbiote-native/components';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { LOWERING_CASES } from '@symbiote-native/components/lowering-fixtures';
import { lowerHostPrimitives } from './lower-host-primitives';
import { scopedStyles } from './scoped-styles';

const lower = (source: string): string =>
  lowerHostPrimitives().markup({ content: source, filename: 'Probe.svelte' })
    .code;

const IMPORT = `<script>\n  import { View, Text } from '@symbiote-native/svelte';\n</script>\n`;

// Proves the rewritten source still COMPILES, and compiles to the element path rather than the
// component path. A string assertion alone would pass on output svelte/compiler rejects.
const compiled = (source: string): string =>
  compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'Probe.svelte',
  }).js.code;

describe('lowerHostPrimitives rewrites', () => {
  it('lowers an imported View to its intrinsic tag with a prop bag', () => {
    const out = lower(`${IMPORT}<View class="row">hi</View>`);
    expect(out).toContain('<symbiote-view p={{class: "row"}}>');
    expect(out).toContain('</symbiote-view>');
    expect(out).not.toContain('<View');
  });

  it('keeps the children between the tags byte-for-byte', () => {
    const out = lower(`${IMPORT}<View class="row"><Slot /> {x} tail</View>`);
    expect(out).toContain('><Slot /> {x} tail</symbiote-view>');
  });

  it('carries an expression attribute through parenthesised', () => {
    const out = lower(`${IMPORT}<View onLayout={a || b}>x</View>`);
    expect(out).toContain('p={{onLayout: (a || b)}}');
  });

  it('turns a mixed quoted value into a template literal', () => {
    const out = lower(`${IMPORT}<View class="a {b} c">x</View>`);
    expect(out).toContain('p={{class: `a ${b} c`}}');
  });

  it('reads a boolean shorthand as true', () => {
    const out = lower(`${IMPORT}<View focusable>x</View>`);
    expect(out).toContain('p={{focusable: true}}');
  });

  it('quotes a key that is not a JS identifier', () => {
    const out = lower(`${IMPORT}<View aria-label="hi">x</View>`);
    expect(out).toContain('"aria-label": "hi"');
  });

  it('handles a self-closing element', () => {
    const out = lower(`${IMPORT}<View class="row" />`);
    expect(out).toContain('<symbiote-view p={{class: "row"}} />');
    expect(out).not.toContain('</symbiote-view>');
  });

  it('follows an aliased import', () => {
    const out = lower(
      `<script>\n  import { View as Box } from '@symbiote-native/svelte';\n</script>\n<Box class="row">x</Box>`,
    );
    expect(out).toContain('<symbiote-view p={{class: "row"}}>');
  });

  // why: proves the output is on Svelte's ELEMENT path, which is the entire point — a component
  // boundary is what costs the anchors. `$.from_tree` with the tag name present, and no component
  // call for View, is the signature.
  it('compiles to the element path, not a component instantiation', () => {
    const out = compiled(lower(`${IMPORT}<View class="row">hi</View>`));
    expect(out).toContain('symbiote-view');
    expect(out).not.toMatch(/View\(/);
  });
});

describe('lowerHostPrimitives folds what the wrapper did', () => {
  // why: View.svelte folds RN's `id` onto `nativeID` and drops the raw key. Losing this ships a
  // dead `id` prop to Fabric and a missing nativeID — device-only and silent.
  it('aliases id onto nativeID and drops the raw key', () => {
    const out = lower(`${IMPORT}<View id="hero">x</View>`);
    expect(out).toContain('nativeID: "hero"');
    expect(out).not.toContain('id: "hero"');
  });

  // why: this file used to fold `id` on View only — an `else` branch that skipped Text — so
  // `<Text id="x">` lowered to a raw `id`, which no ViewConfig declares and Fabric drops in
  // silence. The shared spec carries the alias on BOTH tags (Text.js:222 `const _nativeID = id ??
  // nativeID;`) and driving the fold from it is what closed the gap.
  it('aliases id onto nativeID on Text too, not only on View', () => {
    const out = lower(`${IMPORT}<Text id="label">hi</Text>`);
    expect(out).toContain('nativeID: "label"');
    expect(out).not.toContain('id: "label"');
  });

  it('lets id win over an authored nativeID, as View.js does', () => {
    const out = lower(`${IMPORT}<View nativeID="old" id="new">x</View>`);
    expect(out).toContain('nativeID: "new"');
    expect(out).not.toContain('"old"');
  });

  // why: Text.svelte applies RN's Text.js defaults through resolveTextProps. Without them a
  // clamped <Text> clips mid-word instead of ellipsising — the exact device-only failure Vue's
  // twin had to fix after lowering.
  it('applies RN Text defaults when the author set neither', () => {
    const out = lower(`${IMPORT}<Text>hi</Text>`);
    expect(out).toContain('ellipsizeMode: "tail"');
    expect(out).toContain('allowFontScaling: true');
  });

  it('keeps an authored ellipsizeMode and still defaults a missing one', () => {
    const out = lower(`${IMPORT}<Text ellipsizeMode={mode}>hi</Text>`);
    expect(out).toContain('ellipsizeMode: (mode) ?? "tail"');
  });

  // why: `!== false`, not `?? true` — RN treats a missing prop and an explicit undefined alike,
  // and only a literal false opts out.
  it('reproduces allowFontScaling !== false rather than ?? true', () => {
    const out = lower(`${IMPORT}<Text allowFontScaling={flag}>hi</Text>`);
    expect(out).toContain('allowFontScaling: (flag) !== false');
  });
});

// The bag object literal out of `<symbiote-text p={{…}}>`, brace-matched rather than regexed so a
// nested object in a value cannot truncate it.
function bagSourceOf(lowered: string): string {
  const open = lowered.indexOf('p={') + 'p={'.length;
  let depth = 0;
  for (let index = open; index < lowered.length; index += 1) {
    const character = lowered[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      if (depth === 0) return lowered.slice(open, index);
      depth -= 1;
    }
  }
  throw new Error('unterminated prop bag');
}

// why: this is the exact divergence that shipped in Solid's plugin — its defaults map held VALUES
// and applied them only when the incoming value was `undefined`, so `<Text ellipsizeMode={null}>`
// produced `null` on the lowered tag and `'tail'` through the wrapper. Device-only, invisible to
// every string assertion above, because those pin the operator and not what it evaluates to.
//
// So this evaluates the emitted bag and holds it against `resolveTextProps`, the authority both
// paths are supposed to reproduce. Anyone who "simplifies" the emitted `?? "tail"` back into a
// literal fails here rather than on a device.
describe('lowerHostPrimitives agrees with resolveTextProps on every value', () => {
  const evaluateBag = (
    mode: unknown,
    flag: unknown,
  ): Record<string, unknown> => {
    const lowered = lower(
      `${IMPORT}<Text ellipsizeMode={mode} allowFontScaling={flag}>hi</Text>`,
    );
    const build: unknown = new Function(
      'mode',
      'flag',
      `return (${bagSourceOf(lowered)});`,
    );
    if (typeof build !== 'function') throw new Error('bag did not compile');
    const bag: unknown = build(mode, flag);
    if (typeof bag !== 'object' || bag === null)
      throw new Error('bag is not an object');
    return { ...bag };
  };

  for (const value of [undefined, null, 'clip', 'head']) {
    it(`folds ellipsizeMode ${JSON.stringify(value)} the same way the wrapper does`, () => {
      const lowered = evaluateBag(value, undefined);
      const wrapper = resolveTextProps({ ellipsizeMode: value });
      expect(lowered.ellipsizeMode).toBe(wrapper.ellipsizeMode);
    });
  }

  for (const value of [undefined, null, false, true]) {
    it(`folds allowFontScaling ${JSON.stringify(value)} the same way the wrapper does`, () => {
      const lowered = evaluateBag(undefined, value);
      const wrapper = resolveTextProps({ allowFontScaling: value });
      expect(lowered.allowFontScaling).toBe(wrapper.allowFontScaling);
    });
  }
});

// The two extra refusals a STATEFUL primitive carries. `HOST_PRIMITIVES` has no `Pressable` entry
// yet — the architect places it last, once all five transforms refuse correctly — so these drive
// the real code path against a locally declared entry, saved and restored around the block. That
// is deliberate: testing the detection through a stand-in proves the transform, and a test that
// waited for the entry would let the entry land against an unproven refusal, which is the exact
// ordering the whole plan exists to avoid.
describe('lowerHostPrimitives refuses a stateful primitive that reads its own state', () => {
  const STATEFUL = 'Pressable';
  let saved: unknown;

  beforeAll(() => {
    saved = Reflect.get(HOST_PRIMITIVES, STATEFUL);
    Reflect.set(HOST_PRIMITIVES, STATEFUL, {
      intrinsic: 'symbiote-pressable',
      aliases: { id: 'nativeID' },
      defaults: {},
      observesState: true,
    });
  });

  afterAll(() => {
    if (saved === undefined) Reflect.deleteProperty(HOST_PRIMITIVES, STATEFUL);
    else Reflect.set(HOST_PRIMITIVES, STATEFUL, saved);
  });

  const IMPORT_STATEFUL = `<script>\n  import { Pressable } from '@symbiote-native/svelte';\n</script>\n`;

  // The positive control. Without it every assertion below would also pass if the refusals fired
  // on everything, which is the failure mode a refusal test is most likely to have.
  it('still lowers one whose style is an inert literal and whose child is plain', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={{opacity: 1}}>tap</Pressable>`,
    );
    expect(out).toContain('<symbiote-pressable p={{');
  });

  // why: a functional style used to REFUSE — the template reads press state and tier 2 resolves
  // that below the framework. Invocation covers it instead: the callback is called once per state
  // at bag-build time and both looks ride the bag, so the element can be an intrinsic tag.
  it('splits a functional style instead of refusing it', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={({pressed}) => ({opacity: pressed ? 0.5 : 1})}>tap</Pressable>`,
    );
    expect(out).toContain('<symbiote-pressable p={{');
    expect(out).toContain('...__symbioteStateStyle(');
  });

  // why: ONE call, spread, never two. Two calls would evaluate the author's expression twice and
  // allocate two closures for the very literal this exists to stop allocating per press.
  it('calls the helper once and spreads it', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={({pressed}) => ({opacity: pressed ? 0.5 : 1})}>tap</Pressable>`,
    );
    expect(out.match(/__symbioteStateStyle\(/g)).toHaveLength(1);
  });

  // why: this is the shape NO compile-time substitution can decide — an Identifier could hold an
  // object or a function, so every transform refused it. A runtime `typeof` decides it for free,
  // which is why invocation covers strictly more than substitution rather than the same set.
  it('lowers a style it cannot prove is inert, which substitution never could', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={styleFn}>tap</Pressable>`,
    );
    expect(out).toContain('<symbiote-pressable p={{');
    expect(out).toContain('...__symbioteStateStyle((styleFn))');
  });

  // why: the helper has to BE there. An emitted call with no import is a file that lowers and then
  // throws at runtime, which is strictly worse than refusing.
  it('injects the helper import exactly once, after the package import', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={styleFn}>tap</Pressable>`,
    );
    expect(
      out.match(/import \{ resolveStateStyle as __symbioteStateStyle \}/g),
    ).toHaveLength(1);
    expect(out.indexOf('resolveStateStyle')).toBeGreaterThan(
      out.indexOf("from '@symbiote-native/svelte'"),
    );
  });

  // why: the import must not appear on a file that never needed it — a dead import in every
  // lowered file is a real cost and an obvious tell that the flag is not wired.
  it('does not inject the helper when no style needed splitting', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable style={{opacity: 1}}>tap</Pressable>`,
    );
    expect(out).toContain('<symbiote-pressable p={{');
    expect(out).not.toContain('resolveStateStyle');
  });

  it('refuses a children snippet that takes the state as a parameter', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable>{#snippet children({ pressed })}<i>{pressed}</i>{/snippet}</Pressable>`,
    );
    expect(out).not.toContain('symbiote-pressable');
  });

  // why: every child of a Svelte component is a snippet whether the author wrote one or not, so
  // refusing on "has a snippet" would refuse every Pressable in existence. Only ARITY separates a
  // render prop from an ordinary lazy child.
  it('lowers one whose children snippet takes no parameter', () => {
    const out = lower(
      `${IMPORT_STATEFUL}<Pressable>{#snippet children()}<i>x</i>{/snippet}</Pressable>`,
    );
    expect(out).toContain('<symbiote-pressable p={{');
  });

  // why: the refusals are gated on the spec flag, not on the tag. View and Text carry no
  // `observesState`, so a functional style on a View is somebody else's problem and must still
  // lower — otherwise turning the flag on for one primitive quietly changes four others.
  // Both gates, not one: an earlier version of this test only exercised the style gate, and
  // deleting the flag check on the SNIPPET refusal then failed nothing — a stateless primitive
  // would have silently stopped lowering wherever an author wrote a parameterised snippet.
  it('leaves View and Text unaffected by the stateful refusals', () => {
    const styled = lower(`${IMPORT}<View style={({x}) => x}>a</View>`);
    expect(styled, 'style gate is flag-scoped').toContain(
      '<symbiote-view p={{',
    );

    const snippeted = lower(
      `${IMPORT}<View>{#snippet children({ x })}<i>{x}</i>{/snippet}</View>`,
    );
    expect(snippeted, 'snippet gate is flag-scoped').toContain(
      '<symbiote-view p={{',
    );
  });
});

describe('lowerHostPrimitives refuses', () => {
  it('leaves a View this file did not import from us alone', () => {
    const out = lower(
      `<script>\n  import View from './my/View.svelte';\n</script>\n<View class="row">x</View>`,
    );
    expect(out).toContain('<View class="row">');
  });

  // why: THE safety rule. A spread means the attribute set is not fully visible, so neither the
  // id/nativeID fold nor the Text defaults can be applied correctly.
  it('leaves an element carrying a spread alone', () => {
    const out = lower(`${IMPORT}<View {...rest} class="row">x</View>`);
    expect(out).toContain('<View {...rest}');
  });

  it('leaves an element with a bind: directive alone', () => {
    const out = lower(`${IMPORT}<View bind:this={host} class="row">x</View>`);
    expect(out).toContain('<View bind:this={host}');
  });

  it('leaves an element with an {@attach} alone', () => {
    const out = lower(`${IMPORT}<View {@attach fn} class="row">x</View>`);
    expect(out).toContain('<View {@attach fn}');
  });

  // Was `Pressable` until the spec gained it on 2026-08-23. The case still matters — a primitive
  // absent from HOST_PRIMITIVES stays a component however familiar its name looks — so it moved to
  // one that genuinely is not listed.
  it('does not touch a primitive we do not lower', () => {
    const out = lower(
      `<script>\n  import { Image } from '@symbiote-native/svelte';\n</script>\n<Image class="row" src="x" />`,
    );
    expect(out).toContain('<Image class="row"');
  });

  it('returns the source untouched when nothing was imported from us', () => {
    const source = `<script>\n  let x = 1;\n</script>\n<div>{x}</div>`;
    expect(lower(source)).toBe(source);
  });
});

describe('order against scopedStyles', () => {
  // why: this is the one ordering that is load-bearing rather than stylistic, and getting it
  // backwards fails SILENTLY — lowering turns `class="card"` into a bag expression, and the style
  // scoper only rewrites a plain `class` attribute, so a reversed chain leaves every scoped class
  // in the file unscoped with nothing red anywhere. Asserted as the real chain runs it.
  it('keeps a scoped class scoped when lowering runs after the style pass', async () => {
    const source = [
      `<script>`,
      `  import { View } from '@symbiote-native/svelte';`,
      `</script>`,
      `<View class="card">x</View>`,
      `<style>.card { flex: 1; }</style>`,
    ].join('\n');

    const scoped = await scopedStyles().markup({
      content: source,
      filename: 'Card.svelte',
    });
    const out = lowerHostPrimitives().markup({
      content: scoped.code,
      filename: 'Card.svelte',
    }).code;

    const bag = /p=\{\{class: "([^"]+)"\}\}/.exec(out);
    expect(bag, 'the element was lowered').not.toBeNull();
    expect(bag?.[1], 'the class carries the scope suffix').not.toBe('card');
    expect(bag?.[1]).toContain('card');
  });
});

// The FIFTH parity surface (`.claude/rules/adapter-parity-audit.md`). Four transforms answer one
// rule set over three different plumbings, and sharing the spec proves nothing about the answer
// each gives. So the QUESTION and the EXPECTED ANSWER are shared and the snippet asking it is not —
// `<Pressable {...rest}>` and `<Pressable v-bind="rest">` are the same case in two syntaxes.
//
// A row with no snippet FAILS rather than skipping: adding a case to the shared table is what
// forces this transform to declare where it stands on it.
describe('shared lowering verdicts', () => {
  const SNIPPETS: Readonly<Record<string, string>> = {
    'inert-object-style': `<Pressable style={{opacity: 1}}>tap</Pressable>`,
    'hoisted-identifier-style': `<Pressable style={styleFn}>tap</Pressable>`,
    'specialisable-state-style': `<Pressable style={({pressed}) => ({opacity: pressed ? 0.5 : 1})}>tap</Pressable>`,
    'nested-function-state-style': `<Pressable style={({pressed}) => ({transform: sizes.map((n) => n * (pressed ? 2 : 1))})}>tap</Pressable>`,
    'call-expression-style': `<Pressable style={getStyle()}>tap</Pressable>`,
    'computed-member-style': `<Pressable style={bag[i]}>tap</Pressable>`,
    'conditional-style': `<Pressable style={flag ? a : b}>tap</Pressable>`,
    'zero-arity-child': `<Pressable>{#snippet children()}<i>x</i>{/snippet}</Pressable>`,
    'render-prop-child': `<Pressable>{#snippet children({ pressed })}<i>{pressed}</i>{/snippet}</Pressable>`,
    'spread-attributes': `<Pressable {...rest} class="row">tap</Pressable>`,
    'instance-bound-directive': `<Pressable bind:this={host} class="row">tap</Pressable>`,
  };

  const IMPORT_PRESSABLE = `<script>\n  import { Pressable } from '@symbiote-native/svelte';\n</script>\n`;

  it('supplies a snippet for every case in the shared table', () => {
    expect(Object.keys(SNIPPETS).sort()).toEqual(
      LOWERING_CASES.map(testCase => testCase.id).sort(),
    );
  });

  for (const testCase of LOWERING_CASES) {
    it(`${testCase.expected}s when ${testCase.what}`, () => {
      const snippet = SNIPPETS[testCase.id];
      expect(snippet, `no snippet for "${testCase.id}"`).toBeDefined();

      const out = lower(`${IMPORT_PRESSABLE}${snippet}`);
      const verdict = out.includes('<symbiote-pressable') ? 'lower' : 'refuse';

      expect(verdict, testCase.why).toBe(testCase.expected);
    });
  }
});

// Two invariants of the state-style split that no behavioural assertion can reach.
describe('state-style split invariants', () => {
  const IMPORT_PRESSABLE = `<script>\n  import { Pressable } from '@symbiote-native/svelte';\n</script>\n`;

  // why: the pair (style, activeStyle) is built by CALLING the authored value twice, and the
  // requirement `REFUSAL_CATEGORIES.emitStyleExpressionOnce` exists because a transform that emits the
  // expression TEXT twice makes the app run the author's code twice — `getStyle()` invoked twice
  // per recompute, `bag[i]` indexed twice, `flag ? a : b` free to take different branches. This
  // transform wraps the expression ONCE and lets the helper call the RESULT twice, so the hazard
  // cannot arise here. That is a property of the emitted text, so it is asserted on the text.
  const occurrences = (haystack: string, needle: string): number =>
    haystack.split(needle).length - 1;

  for (const expression of ['getStyle()', 'bag[i]', 'flag ? a : b']) {
    it(`reads \`${expression}\` exactly once in the emitted bag`, () => {
      const out = lower(
        `${IMPORT_PRESSABLE}<Pressable style={${expression}}>tap</Pressable>`,
      );
      expect(out, 'the element lowered').toContain('<symbiote-pressable');
      expect(occurrences(out, expression)).toBe(1);
    });
  }

  // why: PACKAGE_IMPORT is a module-level /g regex with two consumers. `exec` and `test` WRITE
  // `lastIndex`; `matchAll` clones the regex and writes nothing. One `exec` cost an order-dependent
  // failure that passed in isolation and failed in the full run — the second file in a batch simply
  // stopped lowering. The reset that used to guard it was unfalsifiable (no writer left to break
  // it), so the invariant is asserted directly instead.
  it('never reaches PACKAGE_IMPORT through a lastIndex-writing method', async () => {
    const source = await readFile(
      new URL('./lower-host-primitives.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/PACKAGE_IMPORT\s*\.\s*(exec|test)\b/);
    expect(source).toMatch(/matchAll\(PACKAGE_IMPORT\)/);
  });
});
