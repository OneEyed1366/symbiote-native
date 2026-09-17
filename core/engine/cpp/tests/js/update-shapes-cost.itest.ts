// Where an UPDATE spends itself — the half of `materialize` nothing has measured yet.
//
// why: every number this loop has produced so far came off one create-shaped step, and every run
// printed `cloned=0`. So the clone branch of `materialize` — the one a real app runs on every
// render, all day — has never been timed at all, and the two branches share almost nothing: a create
// calls `UIManager::createNode`, a clone calls `diffProps`, `countChangedPositions`,
// `canReplaceInPlace` and `cloneNode`.
//
// The shapes are the benchmark screen's, on one standing 1 000-row list, in a fixed order, because
// each one leaves the tree it hands to the next:
//
//   select      one prop on one row          the shape a list selection makes
//   partial     one prop on every tenth row  100 dirty rows among 900 clean ones
//   swap        two rows exchange places     a structural change with no prop change
//   removeOne   one row leaves               a child list that shrinks by one
//   append      1 000 more rows              a create against a STANDING parent, not an empty one
//   clear       every row leaves             the teardown
//
// What to read first, and it is not a millisecond: `reused` against `cloned`. A tree where one row
// changed should clone the path to that row and reuse everything else, so `cloned` in the single
// digits beside `reused` in the thousands is the walk behaving. The interesting failure is the
// other one — work proportional to the list rather than to the change.
//
// RUN ON `build-release` (`pnpm run bench:itest`); the assert build's shape is wrong, see
// `raw-fabric-vs-engine.itest.ts`.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  insertBefore,
  readSurfaceTelemetry,
  removeChild,
  routeProp,
  setText,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };
// TWO selected styles, and the difference between them is the whole point of the pair of steps
// below. `paintOnly` keeps every layout property the row already had and adds a colour; `reflow`
// drops `paddingLeft`, which Yoga has to re-measure. `canReplaceInPlace` refuses a clone that is not
// layout-clean (F-51), so the second must fall back to handing the whole child list over and the
// first must not — and no test in this repository had ever asked which one a real selection is.
const SELECTED_PAINT_ONLY = {
  height: 44,
  flexDirection: 'row',
  paddingLeft: 10,
  backgroundColor: '#333',
};
const SELECTED_REFLOW = {
  height: 44,
  flexDirection: 'row',
  backgroundColor: '#444',
};

/**
 * The ten-node benchmark row, with the nodes a later step needs held by reference.
 *
 * Held rather than looked up, because there is nothing to look up: the tree lives in C++ and an
 * `ISymbioteNode` in JS is an address with no `children`. That is the architecture working — a JS
 * fixture has exactly the handles an adapter would have kept, and no more.
 */
type IRow = { node: ISymbioteNode; text: ISymbioteNode };

function buildRow(id: number): IRow {
  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'testID', `row-${id}`);

  const label = (text: string): { node: ISymbioteNode; raw: ISymbioteNode } => {
    const node = createElement('RCTText');
    routeProp(node, 'ellipsizeMode', 'tail');
    routeProp(node, 'allowFontScaling', true);
    const raw = createRawText(text);
    appendChild(node, raw);
    return { node, raw };
  };

  const head = label(String(id));
  appendChild(row, head.node);
  for (const text of [`row ${id}`, 'x']) {
    const cell = createElement('RCTView');
    routeProp(cell, 'style', CELL_STYLE);
    appendChild(cell, label(text).node);
    appendChild(row, cell);
  }
  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'style', INPUT_STYLE);
  routeProp(input, 'text', `input ${id}`);
  appendChild(row, input);
  return { node: row, text: head.raw };
}

describe('what an update costs, by shape', () => {
  // why: one case rather than six, because the harness resets the surface between cases and each
  // shape here is defined against the tree the previous one left. Six cases would each measure a
  // freshly built list, which is the create path again.
  it('walks a standing 1 000-row list through every mutation shape', () => {
    const surface = createSurface(ROOT_TAG);
    const list = createElement('RCTView');
    routeProp(list, 'style', { flex: 1 });
    const rows: IRow[] = [];
    for (let id = 0; id < ROWS; id += 1) {
      const row = buildRow(id);
      rows.push(row);
      appendChild(list, row.node);
    }
    surface.appendChild(list);
    flushOps();
    surface.commit();
    mounted();
    readSurfaceTelemetry(ROOT_TAG);

    const step = (
      name: string,
      act: () => void,
    ): { targetedReplaces: number; wall: number } => {
      const startedAt = performance.now();
      act();
      const fill = performance.now() - startedAt;

      const appliedAt = performance.now();
      flushOps();
      const apply = performance.now() - appliedAt;

      const committedAt = performance.now();
      surface.commit();
      const commit = performance.now() - committedAt;
      mounted();

      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      if (telemetry === undefined)
        throw new Error(`no telemetry after ${name}`);
      print(
        `DEBUG ${name.padEnd(9)} wall=${(fill + apply + commit).toFixed(1)} ` +
          `(fill ${fill.toFixed(1)} apply ${apply.toFixed(1)} commit ${commit.toFixed(1)}) ` +
          `walk=${telemetry.walkMs.toFixed(1)} fabric=${telemetry.commitMs.toFixed(1)} ` +
          `layout=${telemetry.layoutMs.toFixed(1)}`,
      );
      print(
        `DEBUG ${name.padEnd(9)} created=${telemetry.nodesCreated} ` +
          `cloned=${telemetry.nodesCloned} reused=${telemetry.nodesReused} ` +
          `targetedReplaces=${telemetry.targetedReplaces} ` +
          `diffProps=${telemetry.diffPropsMs.toFixed(1)} props=${telemetry.propsMs.toFixed(1)}`,
      );
      return {
        targetedReplaces: telemetry.targetedReplaces,
        wall: fill + apply + commit,
      };
    };

    // A selection that only PAINTS differently — the shape a `.row.selected { background: … }` rule
    // makes, and the case `canReplaceInPlace` exists for.
    const paint = step('selectPaint', () => {
      routeProp(rows[500].node, 'style', SELECTED_PAINT_ONLY);
    });

    // The same selection written one property differently, so Yoga has to re-measure the row. The
    // targeted path must refuse this one.
    const flow = step('selectFlow', () => {
      routeProp(rows[501].node, 'style', SELECTED_REFLOW);
    });

    // THE FINDING, pinned as a deterministic pair rather than as a stopwatch. Two spellings of one
    // visual selection, differing only in whether the selected style keeps the row's layout
    // properties, take different paths through `materialize` — and measured on `build-release` the
    // paint-only one costs 0.4 ms against 2.6 ms, because it skips Fabric's commit and Yoga
    // entirely (`fabric=0.0 layout=0.0` above).
    //
    // Nothing in the app can see this. Both spellings paint the same screen, no test in this
    // repository distinguished them before, and a developer who writes the selected style as its own
    // object — the obvious thing to do — silently loses it by dropping one padding.
    print(
      `DEBUG targeted path: paint=${paint.targetedReplaces} flow=${flow.targetedReplaces} · ` +
        `wall ${paint.wall.toFixed(1)} vs ${flow.wall.toFixed(1)} ms`,
    );
    expect(paint.targetedReplaces > 0).toBe(true);
    expect(flow.targetedReplaces).toBe(0);

    step('partial', () => {
      for (let id = 0; id < ROWS; id += 10) {
        setText(rows[id].text, `changed ${id}`);
      }
    });

    step('swap', () => {
      const first = rows[1].node;
      const second = rows[998].node;
      removeChild(list, first);
      insertBefore(list, first, second);
      removeChild(list, second);
      insertBefore(list, second, rows[2].node);
    });

    // Tracked in JS, because JS holds no tree — the same bookkeeping every adapter's reconciler does.
    const standing: ISymbioteNode[] = rows.map(row => row.node);

    step('removeOne', () => {
      removeChild(list, standing[10]);
      standing.splice(10, 1);
    });

    step('append', () => {
      for (let id = ROWS; id < ROWS * 2; id += 1) {
        const row = buildRow(id);
        appendChild(list, row.node);
        standing.push(row.node);
      }
    });

    step('clear', () => {
      for (const child of standing) removeChild(list, child);
      standing.length = 0;
    });

    // why: a step that mutated nothing would print a convincing set of zeros. Counting the whole
    // mounted tree is the check that cannot be satisfied by a fixture that recorded ops nobody
    // applied — ten thousand views went up, and after `clear` none of the rows may be left.
    const countMounted = (view: {
      children: { children: unknown[] }[];
    }): number =>
      1 +
      view.children.reduce(
        (total, child) =>
          total +
          countMounted(child as { children: { children: unknown[] }[] }),
        0,
      );
    const left = countMounted(mounted());
    print(`DEBUG mounted views after clear = ${left}`);
    expect(left < 10).toBe(true);
  });
});

report();
