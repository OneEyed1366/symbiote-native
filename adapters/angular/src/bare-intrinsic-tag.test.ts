// A HAND-WRITTEN intrinsic tag, in an ordinary Angular template — the only shape there is now that
// no lowering transform stands between an app and the engine.
//
// This is deliberately NOT `lowering-equivalence.test.ts`. That file asks whether the two
// SPELLINGS of a primitive agree, and answers it by mounting both. It cannot see the question
// here, which is whether the bare spelling is usable AT ALL from app code: it supplies its own
// fixture, so it never exercises the props, events and defaults an app actually binds, and it
// compiles through JIT, which does not enforce `schemas` (measured — a bare `<view>` mounts clean
// under JIT with no schema and no warning, while ngtsc rejects the same template outright). The
// compile half therefore lives in its own file, `bare-intrinsic-tag-aot.test.ts`, and neither file
// is sufficient alone: this one would stay green for a template no app could build.
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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';
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

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled rather than a fixed count, mirroring `lowering-equivalence.test.ts`: a half-built tree is
// indistinguishable from a missing prop in the assertions below. The cap is a failure, not a
// fallback.
const MAX_SETTLE_TICKS = 20;

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error(
    `the tree never settled: completeRoot still moving after ${MAX_SETTLE_TICKS} ticks`,
  );
}

// `fabric.committed` is the ROOT child set, not a flat list — a `find` across it alone sees only
// the AppContainer and reports every probe below as absent.
function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

let nextRoot = 8_600;

interface IMounted {
  node: IFakeNode | undefined;
  all: IFakeNode[];
  thrown: string;
}

// A fixture per case, compiled at run time, so a case differs from its neighbour by exactly its
// template and schema instead of by a hand-written class that can drift.
async function mountTemplate(
  template: string,
  schema: typeof NO_ERRORS_SCHEMA | typeof CUSTOM_ELEMENTS_SCHEMA,
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
  const all = flatten(fabric.committed);
  const node = all.find(candidate => candidate.props.testID === 'probe');
  try {
    unmount(root);
  } catch {
    // A fixture that threw on mount has nothing to tear down; the assertion reports the throw.
  }
  return { node, all, thrown };
}

beforeEach(() => fabric.reset());

describe('a bare intrinsic tag, hand-written, no lowering transform', () => {
  it('commits a real native view and folds id -> nativeID', async () => {
    const { node } = await mountTemplate(
      `<view [id]="'probe-id'" [testID]="'probe'"></view>`,
      NO_ERRORS_SCHEMA,
    );
    expect(node?.viewName).toBe('RCTView');
    // The alias is the renderer's, not a wrapper's — the composed `<View>` has no `id` @Input at
    // all, so this is the one fold the bare path has and the component path lacks.
    expect(node?.props).toMatchObject({
      nativeID: 'probe-id',
      testID: 'probe',
    });
  });

  it('seeds the two Text defaults and takes a raw-text child', async () => {
    const { node, all } = await mountTemplate(
      `<text testID="probe">hello</text>`,
      NO_ERRORS_SCHEMA,
    );
    expect(node?.viewName).toBe('RCTText');
    // RN's Text.js applies both unconditionally; without them a clamped Text cuts mid-word with no
    // ellipsis, on device only.
    expect(node?.props).toMatchObject({
      ellipsizeMode: 'tail',
      allowFontScaling: true,
    });
    expect(
      all.find(candidate => candidate.viewName === 'RCTRawText')?.props,
    ).toMatchObject({ text: 'hello' });
  });

  it('routes an (event) binding through to the engine, gate flag included', async () => {
    const { node } = await mountTemplate(
      `<view testID="probe" (layout)="hit()"></view>`,
      NO_ERRORS_SCHEMA,
    );
    // `onLayout` is one of the six events Fabric's C++ emits only when a BOOLEAN prop reaches the
    // payload, so the flag IS the observable: a listener that never set it is dead on device with
    // nothing red anywhere. Asserting the committed payload, not the listener map.
    expect(node?.props.onLayout).toBe(true);
  });

  it('attaches the host behavior, so a bare tag carries its folds', async () => {
    const { all } = await mountTemplate(
      `<text-input testID="probe"></text-input><switch testID="sw"></switch>`,
      CUSTOM_ELEMENTS_SCHEMA,
    );
    // The behavior registry is keyed by the intrinsic TAG. A renderer that handed it the resolved
    // Fabric name instead would attach nothing and these defaults would silently vanish.
    expect(
      all.find(node => node.props.testID === 'probe')?.props,
    ).toMatchObject({
      submitBehavior: 'blurAndSubmit',
      underlineColorAndroid: 'transparent',
    });
    expect(all.find(node => node.props.testID === 'sw')?.props.value).toBe(
      false,
    );
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

  it('control: the spec yielded a non-empty tag list', () => {
    expect(intrinsics.length).toBeGreaterThan(0);
  });

  it.each(intrinsics)('<%s> paints its own native view', async tag => {
    const { node } = await mountTemplate(
      `<${tag} testID="probe"></${tag}>`,
      NO_ERRORS_SCHEMA,
    );
    // An anchor commits nothing, so `node` would be undefined — a bare `toBe(undefined)` on the
    // viewName would pass for both an anchor and a wrong view.
    expect(node).toBeDefined();
    expect(node?.viewName).toBe(COMPONENT_DESCRIPTORS[tag]?.component);
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
      expect(aliased.node?.props).toEqual(bare.node?.props);
    },
  );

  it('carries bound props and event gates through the alias too', async () => {
    const { node } = await mountTemplate(
      `<symbiote-view [id]="'probe-id'" [testID]="'probe'" (layout)="hit()"></symbiote-view>`,
      CUSTOM_ELEMENTS_SCHEMA,
    );
    expect(node?.viewName).toBe('RCTView');
    expect(node?.props).toMatchObject({
      nativeID: 'probe-id',
      testID: 'probe',
      onLayout: true,
    });
  });
});

describe('style on a bare tag: what works and what cannot', () => {
  it('takes a plain object [style], which Angular decomposes per key', async () => {
    const { node } = await mountTemplate(
      `<view testID="probe" [style]="{ opacity: 1 }"></view>`,
      NO_ERRORS_SCHEMA,
    );
    // Angular compiles `[style]` to ɵɵstyleMap -> one setStyle call per key; the renderer merges
    // them back into the single `style` prop RN wants.
    expect(node?.props.opacity).toBe(1);
  });

  it('LIMITATION: an ARRAY [style] throws inside Angular, before the renderer sees it', async () => {
    const { thrown } = await mountTemplate(
      `<view testID="probe" [style]="[{ opacity: 1 }]"></view>`,
      NO_ERRORS_SCHEMA,
    );
    // ɵɵstyleMap parses its argument as a CSS string and calls `.indexOf` on it. An RN StyleProp
    // array never survives that, and no directive can reclaim the binding name — same constraint
    // already recorded for a FUNCTION `[style]`. `[symbioteStyle]` below is the supported spelling;
    // this case exists so the failure is a documented one rather than a device-only surprise.
    expect(thrown).toContain('indexOf is not a function');
  });

  it('takes an array through [symbioteStyle], the alias that dodges the styling engine', async () => {
    const { node } = await mountTemplate(
      `<view testID="probe" [symbioteStyle]="[{ opacity: 1 }, { margin: 2 }]"></view>`,
      NO_ERRORS_SCHEMA,
    );
    expect(node?.props).toMatchObject({ opacity: 1, margin: 2 });
  });
});
