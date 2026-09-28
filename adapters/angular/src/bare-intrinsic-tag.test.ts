// A HAND-WRITTEN intrinsic tag, in an ordinary Angular template — the only shape there is.
//
// The question is whether the tag is usable AT ALL from app code, so the templates below carry the
// props, events and defaults an app actually binds. It mounts through JIT, which does not enforce
// `schemas` (measured — a bare `<view>` mounts clean under JIT with no schema and no warning, while
// ngtsc rejects the same template outright), so the COMPILE half lives in its own file,
// `bare-intrinsic-tag-aot.test.ts`. Neither is sufficient alone: this one would stay green for a
// template no app could build.
//
// EACH FIXTURE CARRIES THE SCHEMA ITS TAG GENUINELY NEEDS, and the two differ on purpose:
//   dashless `<view>`          -> NO_ERRORS_SCHEMA      (nothing else compiles it)
//   hyphenated `<symbiote-view>` -> CUSTOM_ELEMENTS_SCHEMA
// so every template below is literally app code the AOT file proves builds. Writing one schema
// throughout would be shorter and would quietly test a template that does not compile.
import '@angular/compiler';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  NO_ERRORS_SCHEMA,
  type Type,
} from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { ANCHOR_COMPONENT, parentOf } from '@symbiote-native/engine';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';
import { SYMBIOTE_ELEMENTS } from './elements';
// SIDE-EFFECT IMPORT. `register.ts` installs the host behaviors, and a behavior's `foldPayload` is
// the bare path's ONLY source for the folds a wrapper would otherwise apply — without it
// `text-input`/`switch`/`image` below commit a payload missing every default. An app reaches this
// through the package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

// The spec is a `.cjs` (Babel/Metro consumers run before TS exists), so it comes in untyped and is
// narrowed by a guard rather than a cast.
const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES }: { HOST_PRIMITIVES: Record<string, unknown> } =
  require_('@symbiote-native/components/host-primitives');

interface IPrimitiveSpec {
  intrinsic: string;
  intrinsicWhen?: { intrinsic: string };
}

function isPrimitive(value: unknown): value is IPrimitiveSpec {
  if (typeof value !== 'object' || value === null) return false;
  const { intrinsic } = { ...value };
  return typeof intrinsic === 'string';
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled rather than a fixed count: a half-built tree is indistinguishable from a missing prop in
// the assertions below. The cap is a failure, not a fallback.
const MAX_SETTLE_TICKS = 20;

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.commits;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error(
    `the tree never settled: completeRoot still moving after ${MAX_SETTLE_TICKS} ticks`,
  );
}

// Root included, the same shape `fabric.committed`'s flatten had — a `find` across children alone
// would see only the AppContainer and report every probe below as absent.
function flatten(nodes: readonly ILiveNode[]): ILiveNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

// The view names the TAG could legitimately have committed, given the node its probe `testID`
// landed on — the probe itself, and the node holding it.
//
// The two are one node for a simple primitive and two for a COMPOSED one: a behavior with a slot
// redirects every prop it does not keep — `testID` included — onto the node it built, exactly as
// RN's own wrappers do (`ImageBackground.js:81` spreads `...props` onto the inner Image,
// `ActivityIndicator.js:99` onto the spinner). So a row reading the probe's OWN view name reports a
// composed primitive as committing the wrong native view.
//
// ONE hop via `parentOf` — the engine's own answer, not a `children`-includes scan (`children` is a
// getter returning fresh `ILiveNode`s per read, so two calls never share a reference to `.includes`
// against). Widening it to the whole ancestor chain would let any name pass, since the container
// root is an RCTView and most descriptors name one.
function committedViewNames(probe: ILiveNode | undefined): string[] {
  if (probe === undefined) return [];
  const parent = parentOf(probe.handle);
  return parent === undefined
    ? [probe.viewName]
    : [probe.viewName, live.nodeOf(parent).viewName];
}

let nextRoot = 8_600;

interface IMounted {
  node: ILiveNode | undefined;
  all: ILiveNode[];
  thrown: string;
  // `node?.payload` snapshotted BEFORE `unmount()`, for the one thing unmount changes: `onLayout`
  // and its five siblings are cleared by the listener's own teardown
  // (`setEventListener(target, name, undefined)`), so `.payload` — a live getter — would re-run
  // `propsOf` and see the clear too if read after `unmount()` returns. Structural props (`nativeID`,
  // `testID`, `style`…) are unaffected; only a gated event flag needs the pre-unmount snapshot.
  payload: Record<string, unknown> | undefined;
}

// A fixture per case, compiled at run time, so a case differs from its neighbour by exactly its
// template and schema instead of by a hand-written class that can drift.
async function mountTemplate(
  template: string,
  schema: typeof NO_ERRORS_SCHEMA | typeof CUSTOM_ELEMENTS_SCHEMA,
  // The element directives, when the case is about what MATCHING one changes. An app imports them
  // from the package barrel; a schema alone leaves the tag unmatched, which is a different shape
  // and the reason `[style]` behaves differently in the two.
  imports: readonly Type<unknown>[] = [],
): Promise<IMounted> {
  fabric.reset();
  nextRoot += 1;
  const root = nextRoot;

  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision,
    // which is noise this file would otherwise have to explain in every run.
    selector: `bare-tag-fixture-${root}`,
    standalone: true,
    schemas: [schema],
    imports: [...imports],
    template,
  })
  class BareTagFixture {
    handled = 0;
    hit(): void {
      this.handled += 1;
    }
  }

  let thrown = '';
  try {
    mount(root, BareTagFixture satisfies Type<unknown>);
    await flushUntilSettled();
  } catch (error) {
    thrown = String(error);
  }
  // Angular can throw before the surface's own root ever committed (the `[style]` array-without-
  // directive case below) — `appRoot()` then has nothing to find and throws, which the old mirror's
  // `fabric.committed` (defaulted to `[]`) tolerated silently.
  let all: ILiveNode[] = [];
  try {
    all = flatten([live.nodeOf(live.appRoot())]);
  } catch {
    // Nothing committed before the throw; `all`/`node` stay empty, same as the mirror's `[]`.
  }
  const node = all.find(candidate => candidate.payload.testID === 'probe');
  const payload = node?.payload;
  try {
    unmount(root);
  } catch {
    // A fixture that threw on mount has nothing to tear down; the assertion reports the throw.
  }
  return { node, all, thrown, payload };
}

beforeEach(() => fabric.reset());

describe('a bare intrinsic tag, hand-written', () => {
  it('commits a real native view and folds id -> nativeID', async () => {
    const { node } = await mountTemplate(
      `<view [id]="'probe-id'" [testID]="'probe'"></view>`,
      NO_ERRORS_SCHEMA,
    );
    expect(node?.viewName).toBe('RCTView');
    // The alias is the renderer's, not a wrapper's — the composed `<view>` has no `id` @Input at
    // all, so this is the one fold the bare path has and the component path lacks.
    expect(node?.payload).toMatchObject({
      nativeID: 'probe-id',
      testID: 'probe',
    });
  });

  it('commits as RCTText and takes a raw-text child', async () => {
    const { node, all } = await mountTemplate(
      `<text testID="probe">hello</text>`,
      NO_ERRORS_SCHEMA,
    );
    // RN's two Text defaults are the engine's rule (`foldTextDefaults`), keyed on exactly this
    // component name — so the name IS the claim; the values are read in
    // `core/engine/cpp/tests/js/committed-payload.itest.ts`.
    expect(node?.viewName).toBe('RCTText');
    expect(node?.payload).toMatchObject({ testID: 'probe' });
    expect(
      all.find(candidate => candidate.viewName === 'RCTRawText')?.payload,
    ).toMatchObject({ text: 'hello' });
  });

  it('routes an (event) binding through to the engine, gate flag included', async () => {
    const { payload } = await mountTemplate(
      `<view testID="probe" (layout)="hit()"></view>`,
      NO_ERRORS_SCHEMA,
    );
    // `onLayout` is one of the six events Fabric's C++ emits only when a BOOLEAN prop reaches the
    // payload, so the flag IS the observable: a listener that never set it is dead on device with
    // nothing red anywhere. Asserting the committed payload, not the listener map.
    expect(payload?.onLayout).toBe(true);
  });

  it('attaches the host behavior to a bare tag', async () => {
    const { all } = await mountTemplate(
      `<text-input testID="probe"></text-input><switch testID="sw"></switch>`,
      CUSTOM_ELEMENTS_SCHEMA,
    );
    // The behavior registry is keyed by the intrinsic TAG. A renderer that handed it the resolved
    // Fabric name instead would attach nothing and this would silently vanish.
    //
    // `mostRecentEventCount` rather than `submitBehavior`: the latter was a fold output and the
    // fold is the engine's now (`foldTextInputAliases`, `SymbioteFabricProps.cpp`), which this
    // harness's payload — built by the TypeScript `fabricProps` — cannot see. The count is written
    // by the MACHINE at attach, so it is the observable this test was always reaching for.
    // The `<switch>` used to corroborate this through its folded `value`, and no longer can for the
    // same reason — `foldSwitchProps` is the engine's too. It stays in the template because the
    // claim is about the RENDERER handing over a tag, and a second tag is what makes the case about
    // the mechanism rather than about text-input; its own payload is asserted in
    // `core/engine/cpp/tests/js/switch-payload.itest.ts`.
    const probePayload = all.find(
      node => node.payload.testID === 'probe',
    )?.payload;
    expect(probePayload).toMatchObject({ mostRecentEventCount: 0 });
    expect(all.find(node => node.payload.testID === 'sw')).toBeDefined();
  });
});

describe('no intrinsic is swallowed by the anchor-host registry', () => {
  // The registry lowercases its composed selectors, and the composed wrappers are named after the
  // primitives they render — `Image`.toLowerCase() IS the tag `image`. So six of the eight entries
  // below collide with a composed selector by construction, and `createElement` keeps them painting
  // only because it checks the descriptor table FIRST. An intrinsic that lost that race would
  // commit a non-painting anchor: no native view, no error, visible only on a device.
  //
  // Asserted as an OBSERVABLE — the tag commits the native view its descriptor names — rather than
  // by re-reading `isAnchorHostComponent`, which would just restate the renderer's own condition
  // and agree with it however wrong it got.
  const intrinsics = [
    ...new Set(
      Object.values(HOST_PRIMITIVES).flatMap(entry =>
        isPrimitive(entry)
          ? [
              entry.intrinsic,
              ...(entry.intrinsicWhen === undefined
                ? []
                : [entry.intrinsicWhen.intrinsic]),
            ]
          : [],
      ),
    ),
  ].sort();

  // A tag whose descriptor IS the anchor is not a swallowed intrinsic — it is one this project
  // deliberately gives no Fabric view (`touchable-native-feedback`, which clones onto its single
  // child instead: TouchableNativeFeedback.js:289,339). Partitioned off the descriptor table rather
  // than by name, so the two lists cannot disagree with what the renderer will do.
  const paints = intrinsics.filter(
    tag => COMPONENT_DESCRIPTORS[tag]?.component !== ANCHOR_COMPONENT,
  );
  const anchored = intrinsics.filter(
    tag => COMPONENT_DESCRIPTORS[tag]?.component === ANCHOR_COMPONENT,
  );

  it('control: the spec yielded a non-empty tag list, fully partitioned', () => {
    expect(intrinsics.length).toBeGreaterThan(0);
    expect(paints.length + anchored.length).toBe(intrinsics.length);
    // Without this the painting list could empty out and every row below would vanish silently.
    expect(paints.length).toBeGreaterThan(0);
  });

  it.each(paints)('<%s> paints its own native view', async tag => {
    const { node } = await mountTemplate(
      `<${tag} testID="probe"></${tag}>`,
      NO_ERRORS_SCHEMA,
    );
    // An anchor commits nothing, so `node` would be undefined — a bare `toBe(undefined)` on the
    // viewName would pass for both an anchor and a wrong view.
    expect(node).toBeDefined();
    expect(committedViewNames(node)).toContain(
      COMPONENT_DESCRIPTORS[tag]?.component,
    );
  });

  // The inverse, so the partition costs no coverage: an anchor-descriptor tag must commit NOTHING.
  // `all` is what makes this an observation rather than the absence of one — a mount that threw
  // would also leave `node` undefined.
  it.each(anchored)('<%s> commits no node of its own', async tag => {
    const { node, all, thrown } = await mountTemplate(
      `<${tag} testID="probe"></${tag}>`,
      NO_ERRORS_SCHEMA,
    );
    expect(thrown).toBe('');
    expect(all.length).toBeGreaterThan(0);
    expect(node).toBeUndefined();
  });
});

describe('the hyphenated spelling an ngtsc-checked template can use', () => {
  // Every dashless intrinsic, derived — a future one joins this test by existing rather than by
  // someone remembering to add it. `bare-intrinsic-tag-aot.test.ts` proves the same list is what
  // ngtsc accepts; here it must resolve to the same node the bare tag builds.
  const dashless = Object.keys(COMPONENT_DESCRIPTORS)
    .filter(tag => !tag.includes('-'))
    .sort();

  it('control: the tag alphabet still HAS dashless members', () => {
    // With none, every case below is vacuous and the alias map is dead code that reads as working.
    expect(dashless.length).toBeGreaterThan(0);
  });

  it.each(dashless)(
    'symbiote-%s resolves to the same native view as the bare tag',
    async tag => {
      const bare = await mountTemplate(
        `<${tag} testID="probe"></${tag}>`,
        NO_ERRORS_SCHEMA,
      );
      const aliased = await mountTemplate(
        `<symbiote-${tag} testID="probe"></symbiote-${tag}>`,
        CUSTOM_ELEMENTS_SCHEMA,
      );
      expect(aliased.thrown).toBe('');
      // The control before the comparison: two MISSING nodes compare equal, and an alias that
      // resolved to nothing would pass a bare `toBe` against a bare tag that also failed.
      expect(bare.node?.viewName).toBe(COMPONENT_DESCRIPTORS[tag]?.component);
      expect(aliased.node?.viewName).toBe(bare.node?.viewName);
      expect(aliased.node?.payload).toEqual(bare.node?.payload);
    },
  );

  it('carries bound props and event gates through the alias too', async () => {
    const { node, payload } = await mountTemplate(
      `<symbiote-view [id]="'probe-id'" [testID]="'probe'" (layout)="hit()"></symbiote-view>`,
      CUSTOM_ELEMENTS_SCHEMA,
    );
    expect(node?.viewName).toBe('RCTView');
    expect(payload).toMatchObject({
      nativeID: 'probe-id',
      testID: 'probe',
      onLayout: true,
    });
  });
});

// `[style]` is the ONLY spelling — there is no alias prop, and an app writes what RN writes. Which
// of the two Angular routes carries it is decided by whether the element directive MATCHES, and
// that is the whole content of this block.
describe('[style] on a tag', () => {
  it('takes a plain object through the schema route, decomposed per key', async () => {
    const { node } = await mountTemplate(
      `<view testID="probe" [style]="{ opacity: 1 }"></view>`,
      NO_ERRORS_SCHEMA,
    );
    // Unmatched, `[style]` compiles to ɵɵstyleMap -> one setStyle call per key; the renderer merges
    // them back into the single `style` prop RN wants. An object is the one shape that survives it.
    expect(node?.payload.opacity).toBe(1);
  });

  // why: an RN StyleProp may be an ARRAY; `[styleProp]` is an ordinary property binding, so it
  // reaches the renderer whole and needs no directive instance to claim it.
  it('takes an ARRAY through [styleProp]', async () => {
    const { node, thrown } = await mountTemplate(
      `<view testID="probe" [styleProp]="[{ opacity: 1 }, { margin: 2 }]"></view>`,
      NO_ERRORS_SCHEMA,
      [...SYMBIOTE_ELEMENTS],
    );
    expect(thrown).toBe('');
    expect(node?.payload).toMatchObject({ opacity: 1, margin: 2 });
  });

  // why: `[style]` is Angular's own styling binding, decomposed key by key exactly as on a DOM
  // element, and Angular cannot represent an array there - the same limit a browser app has. Nothing
  // in the adapter claims it any more, with or without the element directives imported.
  it('rejects an array in [style], as Angular does on any element', async () => {
    const { thrown } = await mountTemplate(
      `<view testID="probe" [style]="[{ opacity: 1 }]"></view>`,
      NO_ERRORS_SCHEMA,
      [...SYMBIOTE_ELEMENTS],
    );
    expect(thrown).toContain('indexOf is not a function');
  });
});
