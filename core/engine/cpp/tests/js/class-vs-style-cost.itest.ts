// The device screens compare two DIFFERENT styling mechanisms, and this suite has never priced the
// difference — because headless, both arms write a style object.
//
// `examples/react/screens/BenchmarkScreen.tsx:412` styles its row with `className="bench-row"`,
// resolved at runtime through the class registry and `pushClassStyle`. Its baseline,
// `examples/bare-rn/screens/BenchmarkScreen.tsx:415`, writes `style={styles.benchRow}` — a hoisted
// `StyleSheet.create` object with stable identity. Meanwhile every arm of the headless suite writes
// a style object (`react-suite.itest.tsx:41`), so the class path is exercised on the DEVICE and
// nowhere in the comparison the ratios come from.
//
// That asymmetry is the same class of defect as the five fixture mismatches found on 2026-09-21,
// moved one level up: not between two arms of the suite, but between the suite and the app it is
// supposed to describe. Which makes two questions worth separating, and this file answers them in
// that order:
//
//   1. does a class resolve to the SAME committed payload as the equivalent style object?
//      A correctness question, and the oracle. If the answer is no, no timing matters yet.
//   2. what does the class path COST per node against the object path?
//      The number the device ratio may or may not be carrying.
//
// The select step is measured too, and separately, because it is where the two mechanisms diverge
// most: ours swaps a class STRING (a fresh resolve plus a republished pair), stock swaps an object
// REFERENCE (an identity hit `isSameShallowStyle` turns away). A create prices the cold path; the
// select prices the one a mounted tree pays.
//
// RUN ON `bench:itest` — the assert build's list append is O(N^2) and its numbers carry no verdict.

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  routeProp,
} from '@symbiote-native/engine';

import {
  committedTree,
  describe,
  expect,
  it,
  payloadOf,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const NODES = 5_000;

// The device row's own declarations (`examples/react/App.css:1024`), as the object half writes them
// and as the CSS half resolves to. Spelled ONCE so the two arms cannot drift into measuring
// different styles — which is exactly the bug this file exists to catch one level up.
const ROW_STYLE = {
  height: 44,
  flexDirection: 'row',
  alignItems: 'center',
  paddingTop: 6,
  paddingBottom: 6,
  backgroundColor: 0xff13243a,
} as const;

const SELECTED_STYLE = {
  ...ROW_STYLE,
  backgroundColor: 0xff3a2c10,
  borderLeftWidth: 3,
  borderLeftColor: 0xfff5a623,
} as const;

function registerRowRules(): void {
  registerRules([
    {
      tokens: ['bench-row'],
      specificity: [0, 1, 0],
      order: 0,
      style: ROW_STYLE,
    },
    {
      tokens: ['bench-row-selected'],
      specificity: [0, 1, 0],
      order: 1,
      style: {
        backgroundColor: 0xff3a2c10,
        borderLeftWidth: 3,
        borderLeftColor: 0xfff5a623,
      },
    },
  ]);
}

type IWriter = (node: ReturnType<typeof createElement>) => void;

/**
 * Time `NODES` fresh nodes written by `write`, tree building excluded, and return the wall.
 *
 * Under a CONTAINER rather than straight on the surface: a surface is not a node, so a node-level
 * `appendChild` onto it records no op and the commit dies naming a node the batch never created.
 */
function timeWrites(label: string, write: IWriter, warmUp?: IWriter): number {
  const surface = createSurface(ROOT_TAG);
  const container = createElement('RCTView');
  routeProp(container, 'nativeID', 'container');
  surface.appendChild(container);
  const nodes = [];
  for (let at = 0; at < NODES; at += 1) {
    const node = createElement('RCTView');
    nodes.push(node);
    appendChild(container, node);
  }

  if (warmUp !== undefined) {
    for (const node of nodes) warmUp(node);
    // COMMITTED BETWEEN THE TWO WRITES, so the second one is what a mounted tree pays rather than a
    // second write into a node the host has never seen. Without it the select arms measure a cold
    // path wearing a warm one's name.
    surface.commit();
  }

  const startedAt = performance.now();
  for (const node of nodes) write(node);
  const wall = performance.now() - startedAt;

  surface.commit();
  print(
    `DEBUG ${label.padEnd(12)} ${wall.toFixed(1)} ms · ${((wall * 1_000) / NODES).toFixed(2)} us/node`,
  );
  return wall;
}

/** One node written by `write`, committed, as a payload dump. */
function payloadWritten(write: IWriter): string {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView');
  surface.appendChild(node);
  write(node);
  surface.commit();

  const root = committedTree();
  if (root === undefined) throw new Error('nothing committed');
  const row = root.children[0];
  if (row === undefined) throw new Error('no row under the surface');
  return payloadOf(row);
}

let styleCost: number | undefined;
let selectStyleCost: number | undefined;

describe('a CSS class against the equivalent style object', () => {
  // why: THE ORACLE, and it comes first — a cost comparison between two paths that commit different
  // payloads is a comparison of two different workloads, which is the trap §2 of the measurement
  // skill exists for. The product rule is the one the whole class pipeline rests on: a registered
  // class and the object it was compiled from are the same style, so the platform must not be able
  // to tell them apart.
  it('commits the payload the style object commits', () => {
    registerRowRules();
    const byClass = payloadWritten(node =>
      routeProp(node, 'class', 'bench-row'),
    );
    const byObject = payloadWritten(node =>
      routeProp(node, 'style', ROW_STYLE),
    );
    clearGlobalStyles();

    print(`DEBUG class  :: ${byClass}`);
    print(`DEBUG object :: ${byObject}`);
    expect(byClass).toBe(byObject);
  });

  // why: THE SAME ORACLE FOR THE SELECTED PAIR, without which the select timing below compares two
  // writes nobody proved are the same style — a merge of two rules against one nine-key object.
  it('commits the same payload for the selected pair', () => {
    registerRowRules();
    const byClass = payloadWritten(node =>
      routeProp(node, 'class', 'bench-row bench-row-selected'),
    );
    const byObject = payloadWritten(node =>
      routeProp(node, 'style', SELECTED_STYLE),
    );
    clearGlobalStyles();

    expect(byClass).toBe(byObject);
  });

  // why: the CREATE path — a first write on a node the host has never seen, which is what a
  // thousand-row create does five times a row.
  it('prices a first write through each path', () => {
    styleCost = timeWrites('style', node =>
      routeProp(node, 'style', ROW_STYLE),
    );

    registerRowRules();
    const classCost = timeWrites('class', node =>
      routeProp(node, 'class', 'bench-row'),
    );
    clearGlobalStyles();

    if (styleCost === undefined) throw new Error('the object arm did not run');
    print(
      `DEBUG CREATE   style=${styleCost.toFixed(1)} class=${classCost.toFixed(1)} ms · ` +
        `the class path costs ${(((classCost - styleCost) * 1_000) / NODES).toFixed(2)} us/node ` +
        `(${(classCost / styleCost).toFixed(2)}x)`,
    );
    expect(classCost).toBeGreaterThan(0);
  });

  // why: THE SELECT STEP, where the device screens diverge most. Ours writes a new class STRING and
  // stock swaps an object REFERENCE — and those two reach different guards: the object path can end
  // at `isSameShallowStyle`'s identity check, the class path cannot, because `pushClassStyle` builds
  // a fresh pair on every write.
  it('prices a select-shaped rewrite through each path', () => {
    selectStyleCost = timeWrites(
      'style select',
      node => routeProp(node, 'style', SELECTED_STYLE),
      node => routeProp(node, 'style', ROW_STYLE),
    );

    registerRowRules();
    const classCost = timeWrites(
      'class select',
      node => routeProp(node, 'class', 'bench-row bench-row-selected'),
      node => routeProp(node, 'class', 'bench-row'),
    );
    clearGlobalStyles();

    if (selectStyleCost === undefined)
      throw new Error('the object select arm did not run');
    print(
      `DEBUG SELECT   style=${selectStyleCost.toFixed(1)} class=${classCost.toFixed(1)} ms · ` +
        `the class path costs ` +
        `${(((classCost - selectStyleCost) * 1_000) / NODES).toFixed(2)} us/node ` +
        `(${(classCost / selectStyleCost).toFixed(2)}x)`,
    );
    expect(classCost).toBeGreaterThan(0);
  });
});

report();
