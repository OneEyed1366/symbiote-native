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
// React only, and deliberately: it is the heaviest reconciler in the repo and the one whose host
// config is closest to what the other four do through their own seams. A per-adapter sweep is a
// bigger fixture and belongs in its own file if this one shows the delta is worth chasing.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import { createElement as h } from 'react';

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
        `apply=${react.applyMs.toFixed(1)} nodes=${react.nodes}`,
    );

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
});

report();
