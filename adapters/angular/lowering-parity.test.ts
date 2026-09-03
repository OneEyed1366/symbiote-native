// The SHARED verdict table (`@symbiote-native/components/lowering-fixtures`), answered by Angular.
//
// Angular's lowering transform (`babel-lower-host-primitives.cjs`) covers `View`/`Text`/
// `Pressable`/`TextInput` as of 2026-09-01 — the same four every other adapter lowers. Every
// fixture row below is written against a Pressable-shaped snippet (or TextInput, for the two
// `intrinsic-choice-*` rows), matching the other four runners' own convention.
//
// TWO ROWS ARE NOT MERELY UNSUPPORTED, THEY ARE UNWRITABLE. Angular's template expression grammar
// has NO arrow-function syntax — `parseTemplate` throws a real parser error
// ("Unexpected token '=>'") on `[style]="({pressed}) => ({...})"`. Verified 2026-08-31 against the
// installed `@angular/compiler`; every other adapter's syntax (JSX, Vue template, Svelte) accepts a
// function literal as a bound expression, so `specialisable-state-style` and
// `nested-function-state-style` have no Angular snippet at all, not merely a refusing one. Marked
// `it.skip` below with the parser error attached, not silently omitted.
//
// A THIRD ROW IS UNWRITABLE FOR THE SAME REASON, caught late: `spread-attributes` was first
// answered with `[attr.data-x]="1"`, on the theory that a computed/interpolated attribute NAME is
// the closest real Angular hazard to a spread. It is not one. `[attr.data-x]="1"` is an ORDINARY
// bound attribute — `data-x` is a STATIC token in Angular's own binding syntax
// (`[attr.<literal-name>]`), only the VALUE (`1`) is dynamic, and the transform can read the
// attribute list exactly as well as it can for any other bound attribute. Angular's grammar has no
// construct at all for an unenumerable attribute set OR a dynamically-named one — verified against
// the installed `@angular/compiler`, 2026-09-01 — so there is no snippet here that actually tests
// `unreadableAttributeSet`, and the earlier one silently tested nothing. See
// `.claude/rules/adapter-parity-audit.md`'s "Admission test for a row in the shared lowering
// table" — a row whose transforms could never disagree proves nothing, and a snippet that answers
// the wrong hazard is worse: it *looks* like coverage.
//
// PLUMBING. Angular's seam is neither a live JSX/template AST (Solid, Vue JSX) nor source text a
// preprocessor reads and re-emits (Svelte, Vue SFC) — it is the ALREADY-COMPILED
// `ɵɵngDeclareComponent({...})` call ngc's Stage A emits, with `template` a plain string and
// `dependencies` a plain array. So the "snippet" here is that call, hand-built to the exact shape
// ngc produces (verified against a real compile in this file's sibling test), rather than a
// JSX/SFC fragment — matching the OBJECT the plugin actually reads, not a stand-in for it.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformSync } from '@babel/core';

import loweringFixtures from '@symbiote-native/components/lowering-fixtures';

interface ILoweringCase {
  id: string;
  what: string;
  expected: 'lower' | 'refuse';
  why: string;
}

const { LOWERING_CASES }: { LOWERING_CASES: readonly ILoweringCase[] } =
  loweringFixtures;

const require_ = createRequire(import.meta.url);
const lowerHostPrimitives = require_('./babel-lower-host-primitives.cjs');

// Pressable's own selector is a single string ('Pressable', pressable/index.ts) — the vestigial
// 'symbiote-pressable, Pressable' dual spelling was retired 2026-08-31 (see this file's own
// header). View/Text keep the dual selector, so their control-block deps below still carry it.
const PRESSABLE_DEP =
  '{ kind: "component", type: Pressable, selector: "Pressable" }';
const TEXT_DEP =
  '{ kind: "component", type: Text, selector: "symbiote-text, Text" }';

// One snippet shape per row, in ANGULAR's own attribute/binding syntax — `[style]`/`(event)`/
// `#ref`/plain attribute, never a JSX stand-in. `component` defaults to Pressable, matching every
// other adapter's runner; the two `intrinsic-choice-*` rows switch it to TextInput, per the shared
// table's own convention (`declaredSelector` guard below keeps that in sync with the spec).
const SNIPPETS: Record<
  string,
  { attr: string; child?: string; component?: string }
> = {
  'inert-object-style': { attr: '[style]="{ borderColor: c }"' },
  'hoisted-identifier-style': { attr: '[style]="fnStyle"' },
  'call-expression-style': { attr: '[style]="getStyle()"' },
  'computed-member-style': { attr: '[style]="bag[i]"' },
  'conditional-style': { attr: '[style]="flag ? a : b"' },
  'zero-arity-child': { attr: '', child: '<Text>y</Text>' },
  // Angular has no render-prop-child idiom at all (no function-as-child syntax); the closest real
  // shape is a template reference passed to an <ng-template> — out of scope for a same-line
  // attribute-list refusal, so this answers via the instance-bound-directive mechanism instead,
  // which is the actual Angular hazard a "read the primitive's own state back" attempt would hit.
  'render-prop-child': { attr: '#handle', child: '<Text>y</Text>' },
  'instance-bound-directive': { attr: '#handle' },
  'aria-bag-fold': { attr: 'role="button" [attr.aria-label]="label"' },
  'intrinsic-choice-dynamic': {
    attr: '[multiline]="isLong"',
    component: 'TextInput',
  },
  'intrinsic-choice-nonboolean-literal': {
    attr: '[multiline]="1"',
    component: 'TextInput',
  },
  // A fold-only primitive carries no attribute worth refusing, so this row is about the DEFAULT
  // verdict rather than about a construct. `alt` is one the fold CONSUMES (Vue's identical
  // rationale), so a pass here cannot come from the transform simply ignoring a primitive it does
  // not recognise.
  // No child: Image is a leaf, and the harness's default `<Text>y</Text>` would put content on an
  // element that takes none (Solid's own image-fold-only snippet is the same shape, same reason).
  'image-fold-only': { attr: 'alt="a"', child: '', component: 'Image' },
  // The second fold-only name, proving `LOWERABLE_NAMES` is a real list read by the walk rather
  // than a name hardcoded once (`LOWERABLE_NAMES = ['View', 'Text']` was true until this same
  // change). `nativeID` is the one prop this primitive genuinely carries.
  'input-accessory-view-fold-only': {
    attr: 'nativeID="bar"',
    child: '',
    component: 'InputAccessoryView',
  },
  // A third name carrying an engine machine (not fold-only in the runtime sense), but the
  // transform's verdict does not depend on that — neither `observesState` nor `intrinsicWhen` is
  // set, so it lowers through the same generic path. `thumbColor` is a CONSUMED alias (folds to
  // `thumbTintColor`), same rationale as Image's `alt`.
  'switch-fold-only': {
    attr: 'thumbColor="a"',
    child: '',
    component: 'Switch',
  },
};

const UNWRITABLE_IN_ANGULAR = new Set([
  'specialisable-state-style',
  'nested-function-state-style',
  // See the header: no Angular syntax binds an unenumerable attribute set, or a dynamically-named
  // one, at all — `[attr.<name>]` takes a static name and a dynamic VALUE only.
  'spread-attributes',
]);

function dependencyFor(component: string): string {
  if (component === 'Pressable') return PRESSABLE_DEP;
  if (component === 'TextInput') {
    // Also a single-name selector (text-input.ts) — the wrapper renders the DIFFERENT
    // `-managed`/`-multiline-managed` tags internally once mounted, which is why they never
    // collide with the plain lowered pair; they play no part in what selects the component itself.
    return '{ kind: "component", type: TextInput, selector: "TextInput" }';
  }
  if (component === 'Image') {
    return '{ kind: "component", type: Image, selector: "Image" }';
  }
  if (component === 'InputAccessoryView') {
    return '{ kind: "component", type: InputAccessoryView, selector: "InputAccessoryView" }';
  }
  if (component === 'Switch') {
    return '{ kind: "component", type: Switch, selector: "Switch" }';
  }
  throw new Error(`no fixture dependency wired for ${component}`);
}

function buildSource(id: string): string {
  const snippet = SNIPPETS[id];
  const component = snippet.component ?? 'Pressable';
  const child = snippet.child ?? '<Text>y</Text>';
  const dep = dependencyFor(component);
  return `
import * as i0 from '@angular/core';
export class ParityProbe {
  static ɵcmp = i0.ɵɵngDeclareComponent({
    type: ParityProbe,
    isStandalone: true,
    selector: 'parity-probe',
    ngImport: i0,
    template: \`<${component} class="x" ${snippet.attr}>${child}</${component}>\`,
    isInline: true,
    dependencies: [${dep}, ${TEXT_DEP}],
  });
}
`;
}

function verdict(id: string): 'lower' | 'refuse' {
  const source = buildSource(id);
  const result = transformSync(source, {
    filename: 'parity.js',
    babelrc: false,
    configFile: false,
    plugins: [lowerHostPrimitives],
  });
  const code = result?.code ?? '';
  const component = SNIPPETS[id].component ?? 'Pressable';
  return code.includes(`<${component} `) || code.includes(`<${component}>`)
    ? 'refuse'
    : 'lower';
}

describe('the shared lowering table, answered by Angular', () => {
  LOWERING_CASES.forEach(testCase => {
    if (UNWRITABLE_IN_ANGULAR.has(testCase.id)) {
      it.skip(`${testCase.id}: no Angular syntax exists for this case`, () => {});
      return;
    }

    it(`${testCase.id}: ${testCase.expected} — ${testCase.what}`, () => {
      expect(
        SNIPPETS[testCase.id],
        `the shared table gained "${testCase.id}" and Angular has not declared a snippet for it`,
      ).toBeDefined();

      // Derived from the transform's own LOWERABLE_NAMES rather than hardcoded, so this file
      // cannot drift the way its own history already did once (View/Text hardcoded while the
      // transform silently gained Pressable/TextInput).
      const component = SNIPPETS[testCase.id].component ?? 'Pressable';
      const supported = (
        lowerHostPrimitives.LOWERABLE_NAMES as string[]
      ).includes(component);
      const expected = supported ? testCase.expected : 'refuse';
      expect(verdict(testCase.id), testCase.why).toBe(expected);
    });
  });
});

// THE CONTROL every `refuse` reading above needs, per `lowering-fixtures.cjs`'s own admission
// test: "a refuse row is unproven until a control on the same primitive goes the other way" — a
// green `refuse` is produced equally by a real refusal and by a primitive/mechanism the transform
// can never lower at all, and the two are indistinguishable without a case that goes the other way
// on the SAME mechanism.
//
// Two mechanisms are exercised by the refuse rows above, and each gets its own control:
// `render-prop-child`/`instance-bound-directive` both refuse via `hasInstanceBoundRef` (`#handle`),
// covered by the View/Text pair below. `intrinsic-choice-dynamic`/`intrinsic-choice-nonboolean-
// literal` refuse via TextInput's `intrinsicWhen` (`selectsIntrinsicStatically`) — a DIFFERENT
// mechanism, on a DIFFERENT primitive, that the View/Text control cannot speak to at all, so it
// gets its own control further down.
describe('control: the harness can tell lower from refuse at all', () => {
  it('lowers a plain View/Text pair with no refusing construct', () => {
    const source = `
import * as i0 from '@angular/core';
export class ControlProbe {
  static ɵcmp = i0.ɵɵngDeclareComponent({
    type: ControlProbe,
    isStandalone: true,
    selector: 'control-probe',
    ngImport: i0,
    template: \`<View class="x"><Text>{{ label }}</Text></View>\`,
    isInline: true,
    dependencies: [
      { kind: "component", type: View, selector: "symbiote-view, View" },
      { kind: "component", type: Text, selector: "symbiote-text, Text" },
    ],
  });
}
`;
    const result = transformSync(source, {
      filename: 'control.js',
      babelrc: false,
      configFile: false,
      plugins: [lowerHostPrimitives],
    });
    const code = result?.code ?? '';
    expect(code).toContain('symbiote-view');
    expect(code).toContain('symbiote-text');
    expect(code).not.toContain('<View');
    expect(code).not.toContain('<Text>');
    expect(code).toMatch(/dependencies:\s*\[\s*\]/);
  });

  it('refuses the SAME View when it carries #ref (control for instance-bound-directive)', () => {
    const source = `
import * as i0 from '@angular/core';
export class ControlProbe2 {
  static ɵcmp = i0.ɵɵngDeclareComponent({
    type: ControlProbe2,
    isStandalone: true,
    selector: 'control-probe-2',
    ngImport: i0,
    template: \`<View #handle class="x"><Text>y</Text></View>\`,
    isInline: true,
    dependencies: [
      { kind: "component", type: View, selector: "symbiote-view, View" },
      { kind: "component", type: Text, selector: "symbiote-text, Text" },
    ],
  });
}
`;
    const result = transformSync(source, {
      filename: 'control2.js',
      babelrc: false,
      configFile: false,
      plugins: [lowerHostPrimitives],
    });
    const code = result?.code ?? '';
    // View refuses (kept its dependency, template untouched); Text — no #ref anywhere on it —
    // still lowers. Proves the all-or-nothing rule is scoped PER TAG NAME, not to the whole
    // template.
    expect(code).toContain('<View #handle');
    expect(code).toContain('symbiote-text');
    expect(code).toContain('type: View');
  });

  // Control for `intrinsic-choice-dynamic`/`intrinsic-choice-nonboolean-literal` — a DIFFERENT
  // mechanism from the #ref control above, so it needs its own positive case: TextInput must be
  // shown to lower at all before "it refuses on a dynamic `multiline`" means anything. Three arms,
  // one harness — absent and a literal `true` both resolve statically (to the two DIFFERENT
  // intrinsics `intrinsicWhen` exists to choose between), and only the bound identifier refuses.
  it('lowers TextInput when `multiline` resolves statically, to the intrinsic it selects', () => {
    const dep = dependencyFor('TextInput');
    const build = (attr: string) => `
import * as i0 from '@angular/core';
export class TextInputControlProbe {
  static ɵcmp = i0.ɵɵngDeclareComponent({
    type: TextInputControlProbe,
    isStandalone: true,
    selector: 'text-input-control-probe',
    ngImport: i0,
    template: \`<TextInput class="x" ${attr} />\`,
    isInline: true,
    dependencies: [${dep}],
  });
}
`;
    const run = (attr: string) =>
      transformSync(build(attr), {
        filename: 'control3.js',
        babelrc: false,
        configFile: false,
        plugins: [lowerHostPrimitives],
      })?.code ?? '';

    // Bounded on the character AFTER the name — `symbiote-text-input` is a prefix of
    // `symbiote-text-input-multiline`, and the tag sits inside a template string here (not a
    // quoted call argument the way Solid's does), so the boundary is the tag's own closing
    // delimiter (a space before another attribute, or `/` on a self-closing tag), not a quote.
    const absent = run('');
    expect(absent).toMatch(/<symbiote-text-input[ /]/);
    expect(absent).not.toMatch(/<symbiote-text-input-multiline[ /]/);
    expect(absent).not.toContain('<TextInput');

    const literalTrue = run('[multiline]="true"');
    expect(literalTrue).toMatch(/<symbiote-text-input-multiline[ /]/);
    expect(literalTrue).not.toContain('<TextInput');

    // isLong is a runtime value — the SAME shape as `intrinsic-choice-dynamic` — so this arm must
    // refuse, proving the lower/refuse split tracks resolvability, not the primitive.
    const dynamic = run('[multiline]="isLong"');
    expect(dynamic).toContain('<TextInput');
    expect(dynamic).toContain('type: TextInput');
  });
});
