// The element directives, on both halves that matter: what ngtsc ACCEPTS, and what the engine
// actually COMMITS. Neither is sufficient alone — vitest mounts through JIT, which does not
// enforce `schemas` or element checks at all (a bare `<view>` mounts clean with no imports and no
// schema), so a runtime-only suite stays green for a template no app can build.
//
// The AOT half derives its per-tag matrix from `COMPONENT_DESCRIPTORS`, so a future primitive
// joins this audit by existing rather than by someone remembering — and a compile-clean
// `<tag [testID]>` is exactly what proves BOTH that a directive exists for the tag and that its
// selector is spelled right, since a tag no directive matches is NG8001.
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: `register.ts` installs the host behaviors, whose `foldPayload` is the bare
// path's only source for the folds a wrapper would otherwise apply.
import './register';
import { mount, unmount } from './render';
import { SYMBIOTE_ELEMENTS } from './elements';
import { ViewHost } from './primitives';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
// Resolved relative to THIS file so Node walks up into `adapters/angular/node_modules` — the
// compiler is not hoisted to the repo root.
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
  messageText: unknown;
  file?: { fileName: string };
}

// Under `build/`, which is gitignored AND excluded from the vitest run — a fixture written into
// `src/` would be collected as a test file of its own on the next run.
const FIXTURE_DIR = join(here, '../build/element-fixtures');

const TAGS = Object.keys(COMPONENT_DESCRIPTORS).sort();

const fixture = (name: string, template: string, body = ''): string => `
import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '../../src';
@Component({ selector: 'el-${name}', standalone: true, imports: [SYMBIOTE_ELEMENTS], template: \`${template}\` })
export class ${name} { value = 'x'; ${body} hit(): void {} }
`;

interface ICase {
  source: string;
  /** Substring every diagnostic list must contain, or `undefined` for "must compile clean". */
  expect: string | undefined;
}

const CASES: Record<string, ICase> = {
  // The whole point of the route, in one template: no schema anywhere, props bound by name.
  P_no_schema_bound_props: {
    source: fixture(
      'P',
      `<view [testID]="value" [id]="value" [pointerEvents]="'box-none'" [accessibilityLabel]="value"></view>`,
    ),
    expect: undefined,
  },
  // Events keep working with no `@Output` declared — see the runtime half below for where they land.
  Q_events_style_and_class: {
    source: fixture(
      'Q',
      `<view class="a" [class]="value" [style]="style" [symbioteStyle]="parts" (layout)="hit()" (press)="hit()"></view>`,
      `style: unknown = { opacity: 1 }; parts = [{ opacity: 1 }];`,
    ),
    expect: undefined,
  },
  R_aria_aliases: {
    source: fixture(
      'R',
      `<view [role]="'button'" [aria-label]="value" [aria-hidden]="true"></view>`,
    ),
    expect: undefined,
  },
  // The two checks that are the reason for this route over `NO_ERRORS_SCHEMA`, which gives up both.
  S_typo_in_the_tag: {
    source: fixture('S', `<vieww [testID]="value"></vieww>`),
    expect: `'vieww' is not a known element`,
  },
  T_wrongly_typed_prop: {
    source: fixture('T', `<view [testID]="42"></view>`),
    expect: 'not assignable',
  },
  U_wrongly_typed_enum_prop: {
    source: fixture('U', `<image [resizeMode]="'nope'"></image>`),
    expect: 'not assignable',
  },
  V_undeclared_prop: {
    source: fixture('V', `<view [nope]="value"></view>`),
    expect: `Can't bind to 'nope'`,
  },
  // Per-primitive props reach the same check.
  W_primitive_props_are_typed: {
    source: fixture(
      'W',
      `<text-input [value]="value" [multiline]="true" [maxLength]="4"></text-input>` +
        `<switch [value]="true"></switch>` +
        `<text [numberOfLines]="2" [ellipsizeMode]="'tail'"></text>`,
    ),
    expect: undefined,
  },
  X_wrongly_typed_primitive_prop: {
    source: fixture('X', `<text-input [maxLength]="value"></text-input>`),
    expect: 'not assignable',
  },
};

// Every tag, derived. A tag whose directive is missing or misspelled is NG8001 here.
for (const tag of TAGS) {
  CASES[`tag_${tag.replaceAll('-', '_')}`] = {
    source: fixture(
      `Tag_${tag.replaceAll('-', '_')}`,
      `<${tag} [testID]="value"></${tag}>`,
    ),
    expect: undefined,
  };
}

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
      // Load-bearing, not tidiness: `performCompilation` reports the program's TS semantic
      // diagnostics and NEVER RUNS the template checker when any exist. The engine reads
      // `process.env`, so without node's types every template case below silently reports CLEAN —
      // including the four that must fail. Measured while writing this file.
      types: ['node'],
      typeRoots: [join(here, '../node_modules/@types')],
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

describe('what ngtsc accepts once an element directive matches the tag', () => {
  it('control: the TEMPLATE checker ran, not just the TS program', () => {
    // A count of failures alone is NOT enough here: a stray TS error would satisfy it while every
    // template check was skipped. Pin the one diagnostic only the template checker can produce.
    expect(results.size).toBe(Object.keys(CASES).length);
    expect(results.get('S_typo_in_the_tag')?.join('\n')).toContain(
      'is not a known element',
    );
  });

  it('control: the tag alphabet is non-empty', () => {
    // With none, the whole per-tag matrix below is vacuous and reads as full coverage.
    expect(TAGS.length).toBeGreaterThan(0);
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

const fabric = installFabric();
let nextRoot = 8_900;

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

const MAX_SETTLE_TICKS = 20;
async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

async function mountTemplate(
  template: string,
  extraImports: readonly Type<unknown>[] = [],
): Promise<{ all: IFakeNode[]; hits: number }> {
  fabric.reset();
  nextRoot += 1;
  const root = nextRoot;

  @Component({
    selector: `element-fixture-${root}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS, ...extraImports],
    template,
  })
  class ElementFixture {
    hits = 0;
    hit(): void {
      this.hits += 1;
    }
  }

  mount(root, ElementFixture satisfies Type<unknown>);
  await flushUntilSettled();
  const all = flatten(fabric.committed);
  unmount(root);
  return { all, hits: 0 };
}

const propsOf = (all: IFakeNode[], testID: string): Record<string, unknown> =>
  all.find(node => node.props.testID === testID)?.props ?? {};

describe('what the element directives commit', () => {
  beforeEach(() => fabric.reset());

  // why: the deciding fact of the whole route. A binding a directive input CLAIMS never reaches
  // `Renderer2.setProperty` on its own, so without the base's one generic `ngOnChanges` loop a
  // bare tag would compile perfectly and commit nothing.
  it('forwards a claimed input onto the engine node, alias included', async () => {
    const { all } = await mountTemplate(
      `<view [testID]="'probe'" [id]="'probe-id'" [pointerEvents]="'box-none'"></view>`,
    );
    expect(propsOf(all, 'probe')).toMatchObject({
      nativeID: 'probe-id',
      pointerEvents: 'box-none',
    });
  });

  // why: an @Output would CONSUME `(layout)` exactly as an @Input consumes a prop, and the loss is
  // silent. `onLayout` is one of the six events Fabric emits only when a BOOLEAN prop reaches the
  // payload, so the flag in the committed payload IS the observable.
  it('leaves an (event) binding to the renderer, which sets the gate flag', async () => {
    const { all } = await mountTemplate(
      `<view [testID]="'probe'" (layout)="hit()"></view>`,
    );
    expect(propsOf(all, 'probe').onLayout).toBe(true);
  });

  it('still attaches the host behavior, so a bare tag keeps its folds', async () => {
    const { all } = await mountTemplate(
      `<text-input [testID]="'probe'"></text-input><switch [testID]="'sw'"></switch>`,
    );
    expect(propsOf(all, 'probe')).toMatchObject({
      submitBehavior: 'blurAndSubmit',
      underlineColorAndroid: 'transparent',
    });
    expect(propsOf(all, 'sw').value).toBe(false);
  });

  // why: the transitional state, and it is reachable today — `ViewHost` is exported as `View` and
  // carries the DUAL selector `'view, View'`, so an app that has both in `imports` has a component
  // AND a directive matching one tag. Angular allows that, and both write the same prop through
  // the same renderer, so the node must not end up with a doubled or dropped payload.
  it('coexists with the primitive host component on the same tag', async () => {
    const { all } = await mountTemplate(
      `<view [testID]="'probe'" [id]="'probe-id'"></view>`,
      [ViewHost],
    );
    expect(propsOf(all, 'probe')).toMatchObject({ nativeID: 'probe-id' });
  });

  it.each(TAGS)(
    '<%s> commits the native view its descriptor names',
    async tag => {
      const { all } = await mountTemplate(
        `<${tag} [testID]="'probe'"></${tag}>`,
      );
      const node = all.find(candidate => candidate.props.testID === 'probe');
      // An anchor host commits nothing, so `node` would be undefined — a bare viewName comparison
      // would then pass for both an anchor and a wrong view.
      expect(node).toBeDefined();
      expect(node?.viewName).toBe(COMPONENT_DESCRIPTORS[tag]?.component);
    },
  );
});
