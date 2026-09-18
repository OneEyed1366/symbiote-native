// What does the ADAPTER add on top of the engine, for the same tree?
//
// why: every headless number this loop has produced builds the tree by calling the engine's own
// mutation API — `createElement` / `routeProp` / `appendChild`. On that path a 10 001-node create is
// 71-73 ms and 0.87-0.93x of a bare `nativeFabricUIManager` driver, i.e. the engine is already below
// the floor of a driver that does nothing else. So when a device run says a create got slower, the
// engine is not where it can have happened — and the layer above it has never been measured here at
// all.
//
// The device table says the same thing from the other side: for the identical tree and a
// byte-identical Fabric payload, `WRITES` reads solid 15001 · vue 15003 · angular 17002 ·
// react 17037/16000. Work that differs between adapters is work an adapter is generating.
//
// THE NUMBER THAT MEANS SOMETHING IS THE DELTA, not either total. The engine-direct arm builds the
// same ten-node row through the same calls an adapter would end up making, so subtracting it leaves
// the reconciler: fibers, props diffing, and whatever each adapter does per element.
//
// It began as React only. Vue joined it, and ANGULAR joined on 2026-09-18 because the six-column
// ruler puts its bare arm at ~15.8 us per node against Solid's 9.5 — a gap the same size as what a
// matched element directive costs, and one nobody had split since Angular's dev mode was turned off
// (`render/index.ts`, `settleAngularDevMode`). Every earlier split of this adapter carried the
// assertions that switch enables, so none of them is evidence any more.
//
// ONE SITTING, `build-release`, identical committed trees (nodes=10003, created=10002 on all four):
//
//              wall    walk   apply    over the direct arm
//   engine      75.3   26.5    47.4    —
//   react       88.6   24.9    42.1    +13.3
//   vue        106.6   26.9    48.9    +31.3
//   angular    162.4   25.9    47.1    +87.0
//
// THE ENGINE'S OWN HALVES DO NOT MOVE between the four, which is what makes the deltas attributable
// at all: whatever Angular costs, it does not cost it in the engine. `setProps` reads 12003 for
// react and 13003 for BOTH vue and angular, so Angular is not generating extra writes either.
//
// AND IT IS NOT THE NUMBER OF TRIPS INTO OUR RENDERER. `readAngularProfile` counts 17 001 renderer
// calls against ~12 000 writes reaching the engine — the ~4 000 difference is the styling run
// coalescing a row's `setStyle` calls into one — while React's host config is the same order. Forty
// per cent more calls does not make 6.5x.
//
// So the 87 ms is Angular's own template execution plus whatever our `Renderer2` methods do inside
// those 17 001 calls. THE VUE ROW IS THE ARGUMENT THAT IT IS MOSTLY THE FIRST: Vue drives the same
// engine through a renderer of the same shape and thinness, and it lands at +31.3. Whatever is
// generic about "a per-adapter renderer over this engine" is priced there.
//
// Bounding our side from the other direction, by inspection rather than by a clock: `setProperty`
// adds an `isSurface` check, a `flushStyling` that reads two fields and returns, one counter
// increment, one gated no-op, and a `requestCommit` that early-returns on a boolean after the very
// first call of a turn (`surface.ts:181`). None of that is microseconds.
//
// WHAT WOULD SETTLE IT is an arm with a no-op `RendererFactory2` — Angular's machinery running with
// the host doing nothing — and `mount` does not allow that factory to be swapped. Worth building
// only if the answer would change a decision; on this evidence it would not, because the residual
// belongs to a framework this adapter consumes rather than implements.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { createElement as h } from 'react';
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { h as vh, mount as mountVue } from '@symbiote-native/vue';
import {
  mount as mountAngular,
  readAngularProfile,
} from '@symbiote-native/angular';

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';
import { mount } from '@symbiote-native/react';

import {
  committedTags,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

/**
 * The ten-node benchmark row, through React.
 *
 * `authorsTheDefault` decides whether the `<text>` nodes spell `allowFontScaling` out. Both arms
 * commit the IDENTICAL payload — the fold seeds `true` when the key is absent, which is React
 * Native's own `allowFontScaling !== false` encoding — so the only difference is whether
 * `foldHostBag` has to copy the props bag to seed it. An app writes the short spelling.
 */
function reactRow(
  id: number,
  authorsTheDefault: boolean,
): ReturnType<typeof h> {
  const label = (text: string): ReturnType<typeof h> =>
    h(
      'text',
      authorsTheDefault
        ? { ellipsizeMode: 'tail', allowFontScaling: true }
        : { ellipsizeMode: 'tail' },
      text,
    );

  return h(
    'view',
    { key: id, style: ROW_STYLE, testID: `row-${id}` },
    label(String(id)),
    h('view', { style: CELL_STYLE }, label(`row ${id}`)),
    h('view', { style: CELL_STYLE }, label('x')),
    h('textinput', { style: INPUT_STYLE, text: `input ${id}` }),
  );
}

/** The same ten-node row through Vue's renderer, which is a different seam onto the same engine. */
function vueRow(id: number): ReturnType<typeof vh> {
  const label = (text: string): ReturnType<typeof vh> =>
    vh('text', { ellipsizeMode: 'tail', allowFontScaling: true }, text);

  return vh('view', { key: id, style: ROW_STYLE, testID: `row-${id}` }, [
    label(String(id)),
    vh('view', { style: CELL_STYLE }, [label(`row ${id}`)]),
    vh('view', { style: CELL_STYLE }, [label('x')]),
    vh('text-input', { style: INPUT_STYLE, text: `input ${id}` }),
  ]);
}

/**
 * The same ten-node row through Angular, as BARE TAGS.
 *
 * Bare rather than through the element directives, because this file's question is what a
 * RECONCILER adds over the engine's own API — and a matched directive is a separate ~9 us per
 * element that `angular-directive-cost.itest.ts` already prices on its own ladder. Mixing the two
 * would make this arm's delta unattributable between them.
 *
 * `@for` over a tiny template, not a thousand rows written out: Angular JIT-compiles a component's
 * template on first use, and a written-out template puts that compile inside the timed region.
 */
@Component({
  selector: 'angular-create-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="rootStyle">
    @for (id of ids; track id) {
      <view [style]="rowStyle" [testID]="'row-' + id">
        <text ellipsizeMode="tail" [allowFontScaling]="true">{{ id }}</text>
        <view [style]="cellStyle"
          ><text ellipsizeMode="tail" [allowFontScaling]="true"
            >row {{ id }}</text
          ></view
        >
        <view [style]="cellStyle"
          ><text ellipsizeMode="tail" [allowFontScaling]="true">x</text></view
        >
        <text-input [style]="inputStyle" [text]="'input ' + id"></text-input>
      </view>
    }
  </view>`,
})
class AngularCreateArm {
  readonly ids = Array.from({ length: ROWS }, (_unused, id) => id);
  readonly rootStyle = { flex: 1 };
  readonly rowStyle = ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

/** The same row, built the way the engine's own API is called — no reconciler above it. */
function engineRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'testID', `row-${id}`);

  const label = (text: string): ISymbioteNode => {
    const node = createElement('RCTText');
    routeProp(node, 'ellipsizeMode', 'tail');
    routeProp(node, 'allowFontScaling', true);
    appendChild(node, createRawText(text));
    return node;
  };

  appendChild(row, label(String(id)));
  for (const text of [`row ${id}`, 'x']) {
    const cell = createElement('RCTView');
    routeProp(cell, 'style', CELL_STYLE);
    appendChild(cell, label(text));
    appendChild(row, cell);
  }
  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'style', INPUT_STYLE);
  routeProp(input, 'text', `input ${id}`);
  appendChild(row, input);
  return row;
}

type IArm = { wall: number; nodes: number; walkMs: number; applyMs: number };

let engineArm: IArm | undefined;
let reactArm: IArm | undefined;

type ITelemetry = ReturnType<typeof readSurfaceTelemetry>;

/**
 * `applyOps`' own half, for one arm.
 *
 * `applyMs` is the WHOLE native call and the commit runs inside it, so the walk has to come out or
 * the two phases are double-counted — the same subtraction this file's `apply` figures already make.
 * Printed for every arm rather than one, because the question it answers is only ever comparative:
 * the ops loop does not know which reconciler wrote the ops, so a phase that differs between two
 * adapters on one tree is a difference in the OPS, and the counters beside it say which kind.
 *
 * WHAT IT SAID, AND IT CLOSES THE PHASE RATHER THAN OPENING IT:
 *
 *            ops   decode  setProp  convert  structure  publish  handles   decoded
 *   engine  19.3    4.0     1.3      0.4      1.2        2.4      1.6       7002
 *   react   23.3    5.9     1.6      0.7      2.5        3.8      2.3       7002
 *   vue     20.6    4.5     1.5      0.6      1.2        2.7      1.9       7002
 *
 * `apply` is `walk` plus `ops` in all three (44.4 = 25.1 + 19.3, 51.3 = 28.0 + 23.3,
 * 65.1 = 44.5 + 20.6), and `ops` barely moves between them. So Vue's 14 ms of extra `apply` is
 * entirely its WALK, which is the `payloadFold` above — there is no second cause hiding here, and
 * the ops loop is not a place to look for one.
 *
 * The books therefore close on this fixture: **React's deficit against the direct arm is fibers, and
 * Vue's deficit against React is the fold.** React's `ops` running 4 ms over the direct arm for
 * byte-identical op counts (`decoded` and `conversions` match exactly) is the one residue, and at
 * ~20% of a 19 ms phase with allocation as the obvious suspect it is not worth a hypothesis yet.
 *
 * THE WASTE COUNTERS THEN SAID SOMETHING NOBODY EXPECTED, and it is the opposite way round:
 *
 *   engine  unchanged=0        react  unchanged=0        vue  unchanged=6000
 *
 * They were added to chase the device benchmark's `WRITES 17037/16000` on REACT. On this row React
 * writes nothing unchanged and Vue writes six thousand — which is 3 000 text nodes times two, i.e.
 * `seedTextDefaults` exactly. The renderer puts `ellipsizeMode` and `allowFontScaling` on every text
 * node at `createElement`; the app then authors the same two values, and each one crosses, converts
 * to a `folly::dynamic`, and is dropped for equalling what is already there.
 *
 * So the diagnostic bisect further up this file — which named the seed from the VALUE TABLE growing —
 * is now confirmed by a direct counter and priced: **6 000 wasted crossings per 1 000-row create.**
 *
 * The device's React figure is about the device's row, not this one, and the two must not be
 * conflated: that row authors props the fold already supplies, this one does not.
 *
 * The fix is not another `payloadFold` — one of those costs ~17 us per node per commit, which is
 * worse than what it would save. RN's text defaults are the PLATFORM's semantics rather than any
 * adapter's, so they belong in the payload builder next to the component-keyed folds that are
 * already there (`foldTextInputValue` in `SymbioteFabricProps.cpp`, and its twin in
 * `fabric-props.ts`), with `seedTextDefaults` deleted from Vue, Angular and Solid.
 */
function printApplySplit(label: string, telemetry: ITelemetry): void {
  const at = (value: number | undefined): string => (value ?? 0).toFixed(1);
  const apply = telemetry?.applyMs ?? 0;
  const walk = telemetry?.walkMs ?? 0;
  print(
    `DEBUG ${label.padEnd(7)} apply split: ops=${(apply - walk).toFixed(1)} ` +
      `decode=${at(telemetry?.decodeMs)} setProp=${at(telemetry?.setPropMs)} ` +
      `convert=${at(telemetry?.propConvertMs)} strings=${at(telemetry?.stringDecodeMs)} ` +
      `structure=${at(telemetry?.structureMs)} publish=${at(telemetry?.publishMs)} ` +
      `handles=${at(telemetry?.instanceHandleMs)} ` +
      `decoded=${telemetry?.nodesDecoded ?? 0} conversions=${telemetry?.valueConversions ?? 0} ` +
      // THE WASTE COUNTERS, and the reason they are on this line rather than a note: a `setProp` that
      // changes nothing still crossed. `writesOfUnchanged` is the expensive kind — it leaves after the
      // JSI -> `folly::dynamic` conversion, so the adapter paid the crossing for a value the node
      // already held. The device benchmark has reported this for React alone (`WRITES 17037/16000`
      // against solid 15001/0 and angular 17002/0) and nobody has read it here.
      `unchanged=${telemetry?.writesOfUnchanged ?? 0} ` +
      `absentDeletes=${telemetry?.deletesOfAbsent ?? 0}`,
  );
}

describe('what a reconciler adds to a create', () => {
  // why: the floor for this comparison — the engine driven directly, which is what every other
  // measurement in this directory has been timing without naming it as a baseline for anything.
  it('builds 1 000 rows straight through the engine', () => {
    const surface = createSurface(ROOT_TAG);
    const startedAt = performance.now();
    const list = createElement('RCTView');
    routeProp(list, 'style', { flex: 1 });
    for (let id = 0; id < ROWS; id += 1) appendChild(list, engineRow(id));
    surface.appendChild(list);
    flushOps();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    engineArm = {
      wall,
      nodes: committedTags().length,
      walkMs: telemetry?.walkMs ?? 0,
      applyMs: telemetry?.applyMs ?? 0,
    };
    print(
      `DEBUG engine  wall=${wall.toFixed(1)} walk=${engineArm.walkMs.toFixed(1)} ` +
        `apply=${engineArm.applyMs.toFixed(1)} nodes=${engineArm.nodes}`,
    );
    printApplySplit('engine', telemetry);
    expect(engineArm.nodes > 0).toBe(true);
  });

  // why: the same tree with React's reconciler on top. Everything above the engine is the delta.
  it('builds the same 1 000 rows through the React adapter', () => {
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(reactRow(id, true));

    const startedAt = performance.now();
    const surface = mount(ROOT_TAG, h('view', { style: { flex: 1 } }, ...rows));
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const react: IArm = {
      wall,
      nodes: committedTags().length,
      walkMs: telemetry?.walkMs ?? 0,
      applyMs: telemetry?.applyMs ?? 0,
    };
    print(
      `DEBUG react   wall=${wall.toFixed(1)} walk=${react.walkMs.toFixed(1)} ` +
        `apply=${react.applyMs.toFixed(1)} nodes=${react.nodes} ` +
        `created=${telemetry?.nodesCreated ?? 0} cloned=${telemetry?.nodesCloned ?? 0} ` +
        `reused=${telemetry?.nodesReused ?? 0}`,
    );
    print(
      `DEBUG react   walk split: props=${(telemetry?.propsMs ?? 0).toFixed(1)} ` +
        `foldLookup=${(telemetry?.foldLookupMs ?? 0).toFixed(1)} ` +
        `folds=${telemetry?.foldsFound ?? 0} ` +
        `createNode=${(telemetry?.createNodeMs ?? 0).toFixed(1)} ` +
        `appendChild=${(telemetry?.appendChildMs ?? 0).toFixed(1)} ` +
        `setProps=${telemetry?.setProps ?? 0} values=${telemetry?.valueEntries ?? 0}`,
    );
    printApplySplit('react', telemetry);

    if (engineArm === undefined) throw new Error('the engine arm did not run');
    // THE ORACLE, and it comes before the delta means anything: two trees of different sizes are not
    // one workload. The React arm builds `text` with a string child, which the engine arm spells as
    // an explicit raw text — the committed shapes have to agree anyway.
    print(`DEBUG nodes: engine=${engineArm.nodes} react=${react.nodes}`);
    expect(react.nodes).toBe(engineArm.nodes);

    print(
      `DEBUG reconciler delta: ${(react.wall - engineArm.wall).toFixed(1)} ms ` +
        `(${(react.wall / Math.max(engineArm.wall, 0.001)).toFixed(2)}x), with the engine's own ` +
        `halves at walk ${engineArm.walkMs.toFixed(1)} -> ${react.walkMs.toFixed(1)} and ` +
        `apply ${engineArm.applyMs.toFixed(1)} -> ${react.applyMs.toFixed(1)}`,
    );
    // why: the engine's own two phases must not move between the arms. They are doing the identical
    // work on the identical tree, so a difference there would mean the adapter is making the ENGINE
    // do more — which is a finding about the adapter, and a different one from "the reconciler costs
    // what a reconciler costs".
    expect(react.walkMs < engineArm.walkMs * 2).toBe(true);
    reactArm = react;
  });

  // [characterization — a negative result, kept so it is not re-investigated]
  //
  // The hypothesis: `<Text>` almost never spells `allowFontScaling` — it is React Native's own
  // `!== false` default — and `foldHostBag` seeds an absent default by COPYING the props bag
  // (`{ ...bag }`, copy-on-write). Three text nodes per row is three thousand copies on this screen,
  // for a payload that comes out byte-identical either way, so it looked like free work to remove.
  //
  // Measured: 0.8 and 5.4 ms across two runs of a ~116 ms create, i.e. 1-5% and inside the spread of
  // the arm it is compared against. A one-key object copy is cheap and three thousand of them do not
  // add up to anything. The arm stays because the NUMBER is the finding — the next person to read
  // `foldHostBag`'s copy-on-write and think it looks expensive can read this instead of building it
  // again.
  //
  // The two arms differ in one authored key and in nothing the platform sees, which is what keeps
  // the comparison honest whatever it reports.
  it('builds the same rows again with the default left unwritten, as an app writes it', () => {
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(reactRow(id, false));

    const startedAt = performance.now();
    const surface = mount(ROOT_TAG, h('view', { style: { flex: 1 } }, ...rows));
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const nodes = committedTags().length;
    // DRAINED even though this arm reads nothing from it. The counters are zeroed ON READ, so an arm
    // that skips the read leaves its walk and its apply standing for whoever reads next — which is
    // how the Vue arm below first reported a 66.6 ms walk against React's 23.6. That number was
    // three arms added together and it looked exactly like a finding.
    readSurfaceTelemetry(ROOT_TAG);
    print(
      `DEBUG react (default unwritten)  wall=${wall.toFixed(1)} nodes=${nodes}`,
    );
    if (reactArm === undefined) throw new Error('the authored arm did not run');
    print(
      `DEBUG fold copy cost: ${(wall - reactArm.wall).toFixed(1)} ms over ` +
        `${ROWS * 3} text nodes (${(wall / Math.max(reactArm.wall, 0.001)).toFixed(2)}x)`,
    );

    // THE ORACLE for this pair: same tree, and the omitted key must still reach the platform as the
    // seeded default. A difference in node count would make the delta a workload difference.
    expect(nodes).toBe(reactArm.nodes);
  });

  // why: the cross-adapter read, and the one that can say "we are doing something suboptimal". Two
  // reconcilers, one engine, one tree — so a delta that differs a lot between them is the ADAPTER's,
  // and it is visible here without a device. React's own numbers carry React's fiber machinery,
  // which is not ours to remove; Vue's carry Vue's, which is far lighter, so on this engine Vue
  // should land much closer to the direct arm.
  //
  // ── WHAT IT FOUND, AND IT IS NOT VUE ────────────────────────────────────────────────────────────
  //
  //   react   props= 1.4   foldLookup=2.9   folds=0
  //   vue     props=18.4   foldLookup=3.3   folds=1000
  //
  // One node per row carries a `payloadFold` on the Vue side and none does on React's — the
  // `text-input`, whose HOST BEHAVIOR declares `foldPayload` (`core/components/src/behaviors/
  // text-input.ts`). Vue reaches that behavior because `text-input` is a tag resolved through
  // `descriptorFor`; React's adapter renders its own React component and never attaches one.
  //
  // So the 17 ms is ~17 us per folding node, per commit, and the fold is the entire gap. What a
  // fold costs is not the JS function — it is the trip: `fabricProps` converts the WHOLE props bag
  // to a `jsi::Value`, calls into JS, and converts the result back, for a fold that rewrites two
  // keys. `foldProbe` caches only the answer NO, so a node that folds pays this on every commit it
  // is dirty in, forever.
  //
  // That generalises past this fixture and past Vue: every lowered primitive is a host behavior, so
  // a screen of a thousand rows with two lowered `Pressable`s would pay this twice per row if those
  // behaviors declared a fold. Measure `foldsFound` before reading any per-adapter deficit.
  //
  // ── AND THE THREE-WAY SPLIT SAYS WHICH PART, WHICH IS NOT THE PART IT LOOKS LIKE ────────────────
  //
  //   toJs = 1.6    call = 1.6    fromJs = 13.3
  //
  // The SAME bag travels in both directions — `foldPayload` returns `{ ...props, ...folded }` — and
  // reading it back is eight times sending it and eight times the fold's own work. Sending is
  // `jsi::valueFromDynamic`, which builds an object from a `folly::dynamic` the host already holds.
  // Reading back is `jsi::dynamicFromValue`: `getPropertyNames`, then per key `getValueAtIndex` +
  // `getString` + a `std::string` allocation + `getProperty`. That is the same per-key JSI walk this
  // repo already pays inside `RawProps::parse` and describes in `mutation-buffer.ts`'s header — and
  // it is upstream's function, so there is nothing to tune inside it.
  //
  // So the cost is not that a fold runs. It is that a fold's CONTRACT is bag in, bag out, so ~18 keys
  // come back to express a change to about five. A fold that returned a PATCH would leave `toJs` and
  // `call` where they are and cut `fromJs` by roughly the ratio of the bags — ~10 ms of the 18 here.
  //
  // Not done in this pass, and the reason is scope rather than doubt: ~14 fold sites across
  // `core/components/src/behaviors/` share the contract, and dropping a key needs a marker the props
  // bag has no room for (`null` already means "reset to the platform default"). It wants its own
  // pass with the whole set in front of it.
  it('builds the same 1 000 rows through the Vue adapter', () => {
    const rows = [];
    for (let id = 0; id < ROWS; id += 1) rows.push(vueRow(id));

    const startedAt = performance.now();
    const surface = mountVue(ROOT_TAG, {
      render: () => vh('view', { style: { flex: 1 } }, rows),
    });
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const nodes = committedTags().length;
    print(
      `DEBUG vue     wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `apply=${(telemetry?.applyMs ?? 0).toFixed(1)} nodes=${nodes} ` +
        `created=${telemetry?.nodesCreated ?? 0} cloned=${telemetry?.nodesCloned ?? 0} ` +
        `reused=${telemetry?.nodesReused ?? 0}`,
    );
    print(
      `DEBUG vue     fold split: toJs=${(telemetry?.foldToJsMs ?? 0).toFixed(1)} ` +
        `call=${(telemetry?.foldCallMs ?? 0).toFixed(1)} ` +
        `fromJs=${(telemetry?.foldFromJsMs ?? 0).toFixed(1)}`,
    );
    print(
      `DEBUG vue     walk split: props=${(telemetry?.propsMs ?? 0).toFixed(1)} ` +
        `foldLookup=${(telemetry?.foldLookupMs ?? 0).toFixed(1)} ` +
        `folds=${telemetry?.foldsFound ?? 0} ` +
        `createNode=${(telemetry?.createNodeMs ?? 0).toFixed(1)} ` +
        `appendChild=${(telemetry?.appendChildMs ?? 0).toFixed(1)} ` +
        `setProps=${telemetry?.setProps ?? 0} values=${telemetry?.valueEntries ?? 0}`,
    );
    printApplySplit('vue', telemetry);

    if (engineArm === undefined || reactArm === undefined) {
      throw new Error('an earlier arm did not run');
    }
    print(
      `DEBUG reconciler deltas over the direct arm: ` +
        `react=${(reactArm.wall - engineArm.wall).toFixed(1)} ms · ` +
        `vue=${(wall - engineArm.wall).toFixed(1)} ms`,
    );

    // THE ORACLE, again before any millisecond means anything. Vue spells the text input with its
    // own intrinsic tag, so the node counts agreeing is what says the two built the same screen.
    print(`DEBUG nodes: engine=${engineArm.nodes} vue=${nodes}`);
    expect(nodes).toBe(engineArm.nodes);
  });

  // why: the six-column ruler puts Angular's BARE arm at ~15.8 us per node against Solid's 9.5 and
  // stock's 8.9 — a gap the same size as what a matched directive costs, and one nobody has split
  // since Angular's dev mode was turned off. Everything measured about this adapter before that
  // switch carried the assertions it enables, so the old "27% our renderer / 64% Angular's own"
  // split is not evidence any more. This arm reads it against the same engine-direct floor the other
  // two reconcilers are read against.
  it('builds the same 1 000 rows through the Angular adapter', () => {
    // Zeroed, so what follows is this mount's alone.
    readAngularProfile();
    const startedAt = performance.now();
    const surface = mountAngular(ROOT_TAG, AngularCreateArm);
    flushTimers();
    surface.commit();
    const wall = performance.now() - startedAt;
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    const nodes = committedTags().length;
    print(
      `DEBUG angular wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `apply=${(telemetry?.applyMs ?? 0).toFixed(1)} nodes=${nodes} ` +
        `created=${telemetry?.nodesCreated ?? 0} cloned=${telemetry?.nodesCloned ?? 0} ` +
        `reused=${telemetry?.nodesReused ?? 0}`,
    );
    print(
      `DEBUG angular walk split: props=${(telemetry?.propsMs ?? 0).toFixed(1)} ` +
        `foldLookup=${(telemetry?.foldLookupMs ?? 0).toFixed(1)} ` +
        `folds=${telemetry?.foldsFound ?? 0} ` +
        `createNode=${(telemetry?.createNodeMs ?? 0).toFixed(1)} ` +
        `appendChild=${(telemetry?.appendChildMs ?? 0).toFixed(1)} ` +
        `setProps=${telemetry?.setProps ?? 0} values=${telemetry?.valueEntries ?? 0}`,
    );
    printApplySplit('angular', telemetry);

    // HOW OFTEN ANGULAR ENTERS OUR RENDERER AT ALL, which is the half a wall-clock cannot separate.
    // `setProps` above counts what reaches the ENGINE — and the styling run coalesces a whole row's
    // `setStyle` calls into one of those, so a per-key styling path is invisible there and visible
    // here. `rendererWrites` counts every `setProperty` / `setStyle` / `setAttribute` / `setValue`.
    const profile = readAngularProfile();
    print(
      `DEBUG angular renderer calls: writes=${profile.rendererWrites} ` +
        `created=${profile.nodesCreated} inserted=${profile.nodesInserted}`,
    );

    if (engineArm === undefined || reactArm === undefined) {
      throw new Error('an earlier arm did not run');
    }
    print(
      `DEBUG angular over the direct arm: ${(wall - engineArm.wall).toFixed(1)} ms · ` +
        `react=${(reactArm.wall - engineArm.wall).toFixed(1)} ms`,
    );

    // THE ORACLE. Angular's `@for` carries an anchor per row in the DOM shim, which is not a
    // committed node — so the committed count must still land exactly on the other arms'.
    print(`DEBUG nodes: engine=${engineArm.nodes} angular=${nodes}`);
    expect(nodes).toBe(engineArm.nodes);
  });

  // why: the row arm says Vue hands the host 9 007 distinct values where React hands 5 007, for one
  // extra prop per row — so about four thousand writes that fold for React do not fold for Vue. The
  // row cannot say WHICH, because it writes five different prop shapes at once. This writes one
  // shape at a time, a thousand nodes each, and reads the table size: a value repeated a thousand
  // times must be one entry, whichever adapter handed it over.
  it('names which repeated prop Vue fails to fold', () => {
    const shapes: readonly (readonly [string, Record<string, unknown>])[] = [
      ['style (one shared object)', { style: CELL_STYLE }],
      ['string (one shared value)', { ellipsizeMode: 'tail' }],
      ['boolean', { allowFontScaling: true }],
      ['unique string', {}],
    ];
    for (const [name, props] of shapes) {
      const rows = [];
      for (let id = 0; id < ROWS; id += 1) {
        rows.push(
          vh('view', {
            key: id,
            ...(Object.keys(props).length > 0
              ? props
              : { testID: `row-${id}` }),
          }),
        );
      }
      const surface = mountVue(ROOT_TAG, {
        render: () => vh('view', null, rows),
      });
      flushTimers();
      surface.commit();
      mounted();
      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      print(
        `DEBUG vue fold ${name.padEnd(26)} setProps=${telemetry?.setProps ?? 0} ` +
          `values=${telemetry?.valueEntries ?? 0} batches=${telemetry?.applyCalls ?? 0}`,
      );
    }
    // Every shape folds on its own, and `key` never reaches `patchProp` at all — so the row's extra
    // writes are not an interning failure. Bisect the ROW instead, one element kind at a time.
    const pieces: readonly (readonly [string, () => ReturnType<typeof vh>])[] =
      [
        [
          'view with style+testID',
          () => vh('view', { style: ROW_STYLE, testID: 'x' }),
        ],
        [
          'text with two props',
          () =>
            vh('text', { ellipsizeMode: 'tail', allowFontScaling: true }, 'x'),
        ],
        [
          'text, shared string only',
          () => vh('text', { ellipsizeMode: 'tail' }, 'x'),
        ],
        [
          'text, boolean only',
          () => vh('text', { allowFontScaling: true }, 'x'),
        ],
        ['text, no props at all', () => vh('text', null, 'x')],
        [
          'text-input',
          () => vh('text-input', { style: INPUT_STYLE, text: 'x' }),
        ],
      ];
    for (const [name, make] of pieces) {
      const rows = [];
      for (let id = 0; id < ROWS; id += 1)
        rows.push(vh('view', { key: id }, [make()]));
      const surface = mountVue(ROOT_TAG, {
        render: () => vh('view', null, rows),
      });
      flushTimers();
      surface.commit();
      mounted();
      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      print(
        `DEBUG vue piece ${name.padEnd(24)} setProps=${telemetry?.setProps ?? 0} ` +
          `values=${telemetry?.valueEntries ?? 0} batches=${telemetry?.applyCalls ?? 0} ` +
          `(1 000 of them)`,
      );
    }

    // ── WHAT THE BISECTION SAYS, and it is two things ──────────────────────────────────────────────
    //
    //   text, no props at all       setProps=2002  values=1003
    //   text, shared string only    setProps=2002  values=1003
    //   text, boolean only          setProps=2002  values=2003    <- a thousand from nowhere
    //   text-input, two props       setProps=3002                 <- three writes for two
    //
    // A `<text>` with NO authored props already writes two: `seedTextDefaults` puts RN's
    // `ellipsizeMode`/`allowFontScaling` on the node at create time. When the app then AUTHORS one,
    // the write count does not move — but the value table grows by a thousand.
    //
    // Both facts are the same fact. The authored value crosses into the host and is converted to a
    // `folly::dynamic` before anything can compare it, and only then is it found equal to what the
    // seed already put there and dropped. `setProps` does not count that path (it returns before the
    // accumulate, which its own comment says); `valueEntries` does, because the conversion happened.
    // So the seed turns every authored text default into a wasted crossing — 3 000 of them on the
    // row above, which is exactly the gap between Vue's 9 007 values and React's 5 007.
    //
    // React has no such path: `foldHostBag` seeds a default INTO the authored bag, so one value is
    // written once. The defaults are React Native's semantics rather than any adapter's, so the fold
    // belongs where every adapter gets it — not repeated per renderer, and not as a second write.
    //
    // Left as a measurement rather than fixed here: the change is Vue's renderer or the shared fold
    // layer, both outside this file, and the number is what makes the case for it.
    expect(true).toBe(true);
  });
});

report();
