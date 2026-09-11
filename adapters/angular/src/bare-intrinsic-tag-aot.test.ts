// Which spellings of an intrinsic tag ngtsc will actually COMPILE — the half of the question no
// JIT test in this repo can answer.
//
// Every Angular test here mounts through JIT, and JIT does not enforce `schemas` at all: a bare
// `<view>` with no schema mounts clean, commits the right node, and logs nothing. ngtsc rejects
// that same template outright. So a suite that only mounts is green for templates no app can
// build, which is how a lowering transform could be deleted on the strength of a passing
// `lowering-equivalence.test.ts` and leave every hand-written tag uncompilable.
//
// THE FINDING THIS PINS: `CUSTOM_ELEMENTS_SCHEMA` admits an unknown element only when the name is
// a valid CUSTOM ELEMENT name, and the HTML spec requires a hyphen. Our tags lost their
// `symbiote-` prefix, so the alphabet split in two — `text-input`/`safe-area-view` still compile
// under that schema with their whole bound-prop and event surface, while `view`/`text`/
// `pressable`/`image`/`switch`/`modal` compile under NO schema. Case B below is the discriminating
// one: if Angular ever admits a dashless custom element, it reddens and the renderer's alias map
// can go.
//
// Compiled through the REAL @angular/compiler-cli with the repo's own `strictTemplates: true`
// (`tsconfig.json`'s `angularCompilerOptions`) — a laxer setting would silently pass cases an app
// build rejects. All fixtures go through ONE program, which is what keeps this under a second.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';

const require_ = createRequire(import.meta.url);
// Resolved relative to THIS file so Node walks up into `adapters/angular/node_modules` — the
// compiler is not hoisted to the repo root, and a bare specifier from the root resolves nowhere.
const ng: {
  performCompilation: (config: unknown) => {
    diagnostics: readonly IDiagnostic[];
  };
} = require_('@angular/compiler-cli');
const ts: {
  ScriptTarget: Record<string, number>;
  ModuleKind: Record<string, number>;
  ModuleResolutionKind: Record<string, number>;
  flattenDiagnosticMessageText: (text: unknown, sep: string) => string;
} = require_('typescript');

interface IDiagnostic {
  code?: number;
  messageText: unknown;
  file?: { fileName: string };
}

// Under `build/`, which is gitignored AND excluded from the vitest run — a fixture written into
// `src/` would be collected as a test file of its own on the next run.
const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../build/aot-fixtures',
);

interface ICase {
  /** Source of the fixture component. */
  source: string;
  /** Substring the diagnostics must contain, or `undefined` for "must compile clean". */
  expect: string | undefined;
  /** Why this case exists, when the verdict alone does not say it. */
  note?: string;
}

// The dashless tags, DERIVED — the set this whole file is about, so reading it off the descriptor
// table means a future dashless intrinsic joins the audit by existing rather than by someone
// remembering. Same reason `adapterNames()` exists.
const DASHLESS = Object.keys(COMPONENT_DESCRIPTORS)
  .filter(tag => !tag.includes('-'))
  .sort();

const component = (
  name: string,
  schemaImport: string,
  schemas: string,
  template: string,
): string => `
import { Component${schemaImport} } from '@angular/core';
@Component({ selector: 'aot-${name}', standalone: true,${schemas} template: \`${template}\` })
export class ${name} { value = 'x'; hit(): void {} }
`;

const WITH_CUSTOM = {
  imp: ', CUSTOM_ELEMENTS_SCHEMA',
  decl: ' schemas: [CUSTOM_ELEMENTS_SCHEMA],',
};
const WITH_NO_ERRORS = {
  imp: ', NO_ERRORS_SCHEMA',
  decl: ' schemas: [NO_ERRORS_SCHEMA],',
};
const NO_SCHEMA = { imp: '', decl: '' };

const CASES: Record<string, ICase> = {
  // ---- what an app author would try first, and what actually happens ----
  A_bare_dashless_no_schema: {
    source: component(
      'A',
      NO_SCHEMA.imp,
      NO_SCHEMA.decl,
      `<view [testID]="value"></view>`,
    ),
    expect: `'view' is not a known element`,
  },
  B_bare_dashless_custom_elements_schema: {
    source: component(
      'B',
      WITH_CUSTOM.imp,
      WITH_CUSTOM.decl,
      `<view [testID]="value"></view>`,
    ),
    expect: `'view' is not a known element`,
    note: 'THE finding: the documented escape hatch does not cover a dashless tag.',
  },
  C_bare_dashless_no_errors_schema: {
    source: component(
      'C',
      WITH_NO_ERRORS.imp,
      WITH_NO_ERRORS.decl,
      `<view [testID]="value" (layout)="hit()"></view><pressable (press)="hit()"></pressable>`,
    ),
    expect: undefined,
    note: 'The only schema that compiles a bare dashless tag — at the cost of every element check.',
  },

  // ---- the two repairs that look obvious and are not ----
  D_directive_declared_element_bound_prop: {
    source: `
import { Component, Directive } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewTagDirective {}
@Component({ selector: 'aot-D', standalone: true, imports: [ViewTagDirective], template: \`<view [testID]="value"></view>\` })
export class D { value = 'x'; }
`,
    expect: `Can't bind to 'testID'`,
    note: 'A per-tag directive makes the element known and then makes bound props WORSE: matching a directive turns every binding into an input lookup.',
  },
  E_directive_plus_custom_elements_schema: {
    source: `
import { Component, CUSTOM_ELEMENTS_SCHEMA, Directive } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewTagDirective2 {}
@Component({ selector: 'aot-E', standalone: true, imports: [ViewTagDirective2], schemas: [CUSTOM_ELEMENTS_SCHEMA], template: \`<view [testID]="value"></view>\` })
export class E { value = 'x'; }
`,
    expect: `Can't bind to 'testID'`,
    note: 'The schema does not rescue the directive route either — the tag is still not a custom element.',
  },

  // ---- the route D/E stop one step short of: a directive that DECLARES the props ----
  //
  // D says a directive turns every binding into an input lookup. That is the whole mechanism, and
  // it is a repair rather than a dead end: declare the input and the lookup succeeds. What it buys
  // is strictly more than any schema — the schema branch returns `true` for EVERY property on a
  // matching tag ("we don't know which properties a custom element will get",
  // `dom_element_schema_registry.ts:407`), so a dashed tag under CUSTOM_ELEMENTS_SCHEMA has no
  // prop checking at all, while a declared input has a TYPE.
  I_directive_with_declared_input: {
    source: `
import { Component, Directive, Input } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewTagDirective3 { @Input() testID?: string; }
@Component({ selector: 'aot-I', standalone: true, imports: [ViewTagDirective3], template: \`<view [testID]="value"></view>\` })
export class I { value = 'x'; }
`,
    expect: undefined,
    note: 'No schema anywhere. The element is known because a directive matches it, the prop because the directive declares it.',
  },
  J_directive_route_still_catches_a_typo: {
    source: `
import { Component, Directive, Input } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewTagDirective4 { @Input() testID?: string; }
@Component({ selector: 'aot-J', standalone: true, imports: [ViewTagDirective4], template: \`<vieww [testID]="value"></vieww>\` })
export class J { value = 'x'; }
`,
    expect: `'vieww' is not a known element`,
    note: 'The half NO_ERRORS_SCHEMA gives up and CUSTOM_ELEMENTS_SCHEMA cannot give for a dashless tag.',
  },
  K_directive_route_checks_the_prop_TYPE: {
    source: `
import { Component, Directive, Input } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewTagDirective5 { @Input() testID?: string; }
@Component({ selector: 'aot-K', standalone: true, imports: [ViewTagDirective5], template: \`<view [testID]="42"></view>\` })
export class K {}
`,
    expect: `not assignable`,
    note: 'Strictly beyond every schema: neither schema type-checks a prop on a matching tag, this does.',
  },

  // why: the ergonomics of the directive route, and the only part of it an app sees. Angular
  // flattens a nested array in `imports`, so the whole element set is ONE symbol on the line an
  // Angular app already writes — every component in `examples/angular` carries
  // `imports: [SafeAreaView, Text, View]` today. There is no global-import mechanism for standalone
  // components (by design, angular/angular#43784), so a per-component line is the floor whatever we
  // ship; what this pins is that the line does not GROW with the number of primitives used.
  L_whole_element_set_as_one_import: {
    source: `
import { Component, Directive, Input } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewEl { @Input() testID?: string; }
@Directive({ selector: 'text' })
export class TextEl { @Input() testID?: string; }
export const SYMBIOTE_ELEMENTS = [ViewEl, TextEl] as const;
@Component({ selector: 'aot-L', standalone: true, imports: [SYMBIOTE_ELEMENTS], template: \`<view [testID]="value"><text [testID]="value"></text></view>\` })
export class L { value = 'x'; }
`,
    expect: undefined,
    note: 'One symbol covers every primitive, and it stays one symbol as the set grows.',
  },

  // why: THE chosen route (2026-09-07), and the one thing an app writes ONCE instead of per
  // component. A component DECLARED in an NgModule inherits that module's whole import scope, so a
  // single `imports: [SymbioteElementsModule]` in the app's module gives every component in it the
  // element directives — no `imports` line, no `schemas` line, anywhere else. This is what
  // NativeScript-Angular does, minus their `NO_ERRORS_SCHEMA`, which they need because they have no
  // directives to match.
  //
  // The cost is stated by the case itself: `standalone: false` on every component that wants it.
  // Angular still supports that in v20 — this case is what proves it rather than assuming it.
  M_ngmodule_scope_needs_no_per_component_import: {
    source: `
import { Component, Directive, Input, NgModule } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewElM { @Input() testID?: string; }
@Directive({ selector: 'text' })
export class TextElM { @Input() testID?: string; }
@NgModule({ imports: [ViewElM, TextElM], exports: [ViewElM, TextElM] })
export class SymbioteElementsModule {}

@Component({ selector: 'aot-m-one', standalone: false, template: \`<view [testID]="value"></view>\` })
export class MOne { value = 'x'; }
@Component({ selector: 'aot-m-two', standalone: false, template: \`<text [testID]="value"></text>\` })
export class MTwo { value = 'x'; }

@NgModule({ declarations: [MOne, MTwo], imports: [SymbioteElementsModule] })
export class AppModuleM {}
`,
    expect: undefined,
    note: 'Two components, zero imports/schemas between them — the module is the only place it is written.',
  },
  N_ngmodule_scope_still_catches_a_typo: {
    source: `
import { Component, Directive, Input, NgModule } from '@angular/core';
@Directive({ selector: 'view' })
export class ViewElN { @Input() testID?: string; }
@NgModule({ imports: [ViewElN], exports: [ViewElN] })
export class SymbioteElementsModuleN {}

@Component({ selector: 'aot-n', standalone: false, template: \`<vieww [testID]="value"></vieww>\` })
export class N { value = 'x'; }

@NgModule({ declarations: [N], imports: [SymbioteElementsModuleN] })
export class AppModuleN {}
`,
    expect: `'vieww' is not a known element`,
    note: 'The whole reason to prefer this over NO_ERRORS_SCHEMA, which NativeScript-Angular has to use.',
  },

  // ---- what the renderer's alias map buys ----
  F_hyphenated_alias_full_surface: {
    source: component(
      'F',
      WITH_CUSTOM.imp,
      WITH_CUSTOM.decl,
      `<symbiote-view [testID]="value" [id]="value" (layout)="hit()"></symbiote-view>` +
        `<symbiote-pressable (press)="hit()"></symbiote-pressable>`,
    ),
    expect: undefined,
    note: 'Bound props AND events, under the ordinary schema. This is the spelling the renderer resolves.',
  },
  G_dashed_intrinsic_needs_nothing_new: {
    source: component(
      'G',
      WITH_CUSTOM.imp,
      WITH_CUSTOM.decl,
      `<text-input [testID]="value" [multiline]="true" (changeText)="hit()"></text-input>`,
    ),
    expect: undefined,
    note: 'Half the alphabet was always fine; only the dashless half needed anything.',
  },

  // ---- honesty about what the schema does NOT give ----
  H_typo_in_a_hyphenated_tag_compiles: {
    source: component(
      'H',
      WITH_CUSTOM.imp,
      WITH_CUSTOM.decl,
      `<symbiote-vieww></symbiote-vieww>`,
    ),
    expect: undefined,
    note: 'CUSTOM_ELEMENTS_SCHEMA checks for a DASH, never the name — so the alias buys compilation, not spell-checking. A misspelled tag reaches Fabric and paints "Unimplemented component" on device only.',
  },
};

const results = new Map<string, string[]>();

beforeAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const rootNames: string[] = [];
  const byFile = new Map<string, string>();
  for (const [name, testCase] of Object.entries(CASES)) {
    const file = join(FIXTURE_DIR, `${name}.ts`);
    writeFileSync(file, testCase.source);
    rootNames.push(file);
    byFile.set(file, name);
    results.set(name, []);
  }

  const { diagnostics } = ng.performCompilation({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      compilationMode: 'partial',
      // The repo's own setting (adapters/angular/tsconfig.json). A laxer value would pass cases a
      // real app build rejects.
      strictTemplates: true,
    },
  });

  for (const diagnostic of diagnostics) {
    const name = byFile.get(diagnostic.file?.fileName ?? '');
    if (name === undefined) continue;
    results
      .get(name)
      ?.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
  }
});

afterAll(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

describe('what ngtsc accepts for a hand-written intrinsic tag', () => {
  it('control: the compilation actually ran and produced verdicts', () => {
    // An empty result map and a set of clean compilations are the same green. Without this, a
    // beforeAll that threw before `performCompilation` would leave every `expect: undefined` case
    // passing against a program that never compiled.
    expect(results.size).toBe(Object.keys(CASES).length);
    const failing = [...results.values()].filter(list => list.length > 0);
    expect(failing.length).toBeGreaterThan(0);
    // And a count of failures is not enough on its own: `performCompilation` reports the program's
    // TS semantic diagnostics and NEVER RUNS the template checker when any exist, so ONE ordinary
    // type error anywhere in the program silences every case here while this count stays positive.
    // Pin a diagnostic only the template checker can produce. Measured on `elements.test.ts`,
    // whose fixtures import the package and therefore pull in a module reading `process.env`.
    expect(results.get('A_bare_dashless_no_schema')?.join('\n')).toContain(
      'is not a known element',
    );
  });

  it('control: the tag alphabet still has a dashless half', () => {
    // If it does not, this whole file — and the renderer's alias map — is dead weight, and that
    // should be visible rather than silently vacuous.
    expect(DASHLESS.length).toBeGreaterThan(0);
    expect(DASHLESS).toContain('view');
  });

  it.each(Object.entries(CASES))('%s', (name, testCase) => {
    const diagnostics = results.get(name) ?? [];
    if (testCase.expect === undefined) {
      expect(diagnostics).toEqual([]);
      return;
    }
    expect(diagnostics.join('\n')).toContain(testCase.expect);
  });
});
