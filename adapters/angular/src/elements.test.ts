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
import {
  ANCHOR_COMPONENT,
  parentOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
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
      `<view class="a" [class]="value" [style]="style" (layout)="hit()" (press)="hit()"></view>`,
      // `style` was `unknown` here while `[style]` belonged to Angular's styling engine, which
      // type-checks nothing. It is a declared input now, so the fixture has to hand it a real
      // style — which is the point of declaring it.
      `style = { opacity: 1 };`,
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
  // THE HYPHENATED SPELLING IS THE SAME TAG, and until 2026-09-18 it was not. The renderer has always
  // mapped `symbiote-view` onto `view` (`PRIMITIVE_SELECTOR_ALIAS`), so both commit the identical
  // node — but the directive's selector was the bare `view` alone, so the hyphenated form matched
  // NOTHING. An app that imports `SYMBIOTE_ELEMENTS` and writes it got the schema route instead: no
  // type check, no declared inputs, none of the directive's behaviour, and no diagnostic saying so.
  //
  // `[testID]="42"` is the same wrong value as the case above. If the two spellings are one tag it
  // is caught twice; if they are not, this one compiles clean and the trap is open.
  T2_hyphenated_spelling_is_the_same_tag: {
    source: fixture('T2', `<symbiote-view [testID]="42"></symbiote-view>`),
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
  // What declaring `style` buys beyond making it reach the engine: a TYPE. Angular's styling
  // engine accepts any expression on `[style]`, so this was uncheckable until the input existed.
  Z_wrongly_typed_style: {
    source: fixture('Z', `<view [style]="42"></view>`),
    expect: 'not assignable',
  },
  X_wrongly_typed_primitive_prop: {
    source: fixture('X', `<text-input [maxLength]="value"></text-input>`),
    expect: 'not assignable',
  },
  // The `[(value)]` sugar the adapter documents, and the one case that forced an `@Output` into a
  // file whose header says events are not declared: the sugar desugars to `[value]` + `(valueChange)`
  // and ngtsc requires both halves on the SAME target, so a declared input beside an unclaimed event
  // is NG8007. Only a real ngc run reports it — tsc is clean and a JIT mount happily binds it.
  Y_two_way_value: {
    source: fixture(
      'Y',
      `<text-input [(value)]="value"></text-input><switch [(value)]="flag"></switch>`,
      `flag = false;`,
    ),
    expect: undefined,
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRoot = 8_900;

// A plain, pre-unmount SNAPSHOT — not a live `ILiveNode`. `mountTemplate` unmounts before
// returning, and a gated event flag (`onLayout` and its five siblings) is cleared by the
// listener's own teardown on unmount; a live `.payload` getter re-read afterward would see that
// clear. `handle` stays live (structural links survive unmount, same as every other converted tag
// suite in this batch), so `parentOf` still answers correctly.
type ISnapshotNode = {
  viewName: string;
  payload: Record<string, unknown>;
  handle: ISymbioteNode;
};

const MAX_SETTLE_TICKS = 20;
async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    const current = fabric.commits;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

async function mountTemplate(
  template: string,
  extraImports: readonly Type<unknown>[] = [],
): Promise<{ all: ISnapshotNode[]; hits: number }> {
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
  const walk = (node: ReturnType<typeof live.nodeOf>): ISnapshotNode[] => [
    { viewName: node.viewName, payload: node.payload, handle: node.handle },
    ...node.children.flatMap(walk),
  ];
  const all = walk(live.nodeOf(live.appRoot()));
  unmount(root);
  return { all, hits: 0 };
}

const propsOf = (
  all: ISnapshotNode[],
  testID: string,
): Record<string, unknown> =>
  all.find(node => node.payload.testID === testID)?.payload ?? {};

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

  // The OBSERVABLE changed and the question did not. This asserts that a bare tag gets its host
  // behavior attached; it used to read `submitBehavior`, which was a fold output, and that fold is
  // the engine's now (`foldTextInputAliases`, `SymbioteFabricProps.cpp`) — invisible to a recording
  // host, which reports props as the OPS named them.
  //
  // `mostRecentEventCount` is the right observable and arguably always was: the MACHINE writes it,
  // at attach, as a real prop op. It proves the thing the test is named for rather than a rule that
  // happened to run nearby. Switch's `value` followed text-input's into the engine one commit
  // later (`foldSwitchProps`), so the second tag is now here for the mechanism — two tags is what
  // makes this a claim about the REGISTRY rather than about text-input — and its payload is
  // asserted in `core/engine/cpp/tests/js/switch-payload.itest.ts`.
  it('still attaches the host behavior to a bare tag', async () => {
    const { all } = await mountTemplate(
      `<text-input [testID]="'probe'"></text-input><switch [testID]="'sw'"></switch>`,
    );
    expect(propsOf(all, 'probe')).toMatchObject({ mostRecentEventCount: 0 });
    expect(propsOf(all, 'sw').testID).toBe('sw');
  });

  // why: the transitional state, and it is reachable today — `ViewHost` matches the tag itself and is exported as `View` for an app's `imports:`, so
  // an app that has both in `imports` has a component
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
      const node = all.find(candidate => candidate.payload.testID === 'probe');
      // A tag whose descriptor names the ANCHOR component commits NOTHING by design — RN's
      // TouchableNativeFeedback renders no view and clones onto its single child. Asserted as an
      // absence rather than skipped, so a tag that starts committing a real view goes red here.
      if (COMPONENT_DESCRIPTORS[tag]?.component === ANCHOR_COMPONENT) {
        expect(node).toBeUndefined();
        return;
      }
      // An anchor host commits nothing, so `node` would be undefined — a bare viewName comparison
      // would then pass for both an anchor and a wrong view.
      expect(node).toBeDefined();
      // A COMPOSED primitive redirects every prop it does not keep — `testID` included — onto the
      // node its behavior built, exactly as RN's wrappers do (`ImageBackground.js:81` spreads
      // `...props` onto the inner Image, `ActivityIndicator.js:99` onto the spinner). So the probe
      // may sit one level below the tag. ONE hop via `parentOf` — the engine's own answer, not a
      // `children`-includes scan, which a live getter's fresh-array-per-read defeats.
      const parentHandle =
        node === undefined ? undefined : parentOf(node.handle);
      const parent = all.find(candidate => candidate.handle === parentHandle);
      expect([node?.viewName, parent?.viewName]).toContain(
        COMPONENT_DESCRIPTORS[tag]?.component,
      );
    },
  );
});
