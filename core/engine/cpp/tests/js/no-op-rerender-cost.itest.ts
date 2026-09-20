// A re-render that changes NOTHING — the commonest shape a real app produces, and the one nothing
// here has measured.
//
// why: every measurement in this file's neighbourhood so far has been a change. A running app spends
// most of its commits on the opposite: a parent's state moves, the framework re-renders the subtree
// under it, and every child writes back the values it already had. React does it, Vue does it,
// Solid's fine-grained effects do it whenever a list-wide signal moves. If that costs work
// proportional to the list, an app pays for the list on every unrelated state change.
//
// THE TWO SPELLINGS ARE THE WHOLE TEST, and they are not the same question:
//
//   same object    the framework hands back the identical reference — `StyleSheet.create`, a
//                  hoisted literal, a resolved CSS class. `setProp`'s `Object.is` guard can see it.
//   equal object   the framework rebuilds an equal one — a style literal inside a component body,
//                  which is what most code actually writes. Identity says "changed".
//
// The second is the one that matters, because it is the one an author does not know they are
// choosing. When this file was written it cost 9.7 ms against 0.3 for a thousand rows, all of it
// converting each fresh object to a `folly::dynamic` so that `diffProps` could find it unchanged.
// `routeProp` now refuses it in JS first (`isSameShallowStyle`), so the two spellings cost the same
// and neither reaches the platform at all — which is what the assertions at the foot pin.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

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

import {
  describe,
  expect,
  it,
  mounted,
  mountingLogs,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

function buildRow(id: number): ISymbioteNode {
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

type IPass = {
  wall: number;
  convertMs: number;
  told: number;
  cloned: number;
  created: number;
  valueEntries: number;
};

describe('a re-render that changes nothing', () => {
  it('costs nothing at the platform, whichever way the values are spelled', () => {
    const surface = createSurface(ROOT_TAG);
    const list = createElement('RCTView');
    routeProp(list, 'style', { flex: 1 });
    const rows: ISymbioteNode[] = [];
    for (let id = 0; id < ROWS; id += 1) {
      const row = buildRow(id);
      rows.push(row);
      appendChild(list, row);
    }
    surface.appendChild(list);
    flushOps();
    surface.commit();
    mounted();
    // BOTH instruments drained before the first pass, not just the telemetry. `mountingLogs()`
    // accumulates since its last READ, so leaving it unread here makes the first pass inherit the
    // create's ten thousand mutations and report that the platform was told everything.
    readSurfaceTelemetry(ROOT_TAG);
    mountingLogs();

    const pass = (name: string, act: () => void): IPass => {
      const startedAt = performance.now();
      act();
      flushOps();
      surface.commit();
      const wall = performance.now() - startedAt;
      // Drains the transaction, which is what makes `mountingLogs()` mean anything below.
      mounted();

      const telemetry = readSurfaceTelemetry(ROOT_TAG);
      if (telemetry === undefined)
        throw new Error(`no telemetry after ${name}`);
      const measured: IPass = {
        wall,
        convertMs: telemetry.propConvertMs,
        told: mountingLogs().length,
        cloned: telemetry.nodesCloned,
        created: telemetry.nodesCreated,
        valueEntries: telemetry.valueEntries,
      };
      print(
        `DEBUG ${name.padEnd(12)} wall=${wall.toFixed(1)} walk=${telemetry.walkMs.toFixed(1)} ` +
          `apply=${telemetry.applyMs.toFixed(1)} ` +
          `jsValueToDynamic=${telemetry.propConvertMs.toFixed(1)} told=${measured.told}`,
      );
      print(
        `DEBUG ${name.padEnd(12)} created=${measured.created} cloned=${measured.cloned} ` +
          `reused=${telemetry.nodesReused} ` +
          `values=${measured.valueEntries} converted=${telemetry.valueConversions}`,
      );
      return measured;
    };

    // The guard `setProp` already has. Nothing should even reach the buffer.
    const sameObject = pass('same object', () => {
      for (const row of rows) routeProp(row, 'style', ROW_STYLE);
    });

    // The one an author does not know they are choosing: a fresh literal per row, equal to what is
    // standing. Every write gets past the identity guard and the node goes dirty.
    const equalObject = pass('equal object', () => {
      for (const row of rows) {
        routeProp(row, 'style', {
          height: 44,
          flexDirection: 'row',
          paddingLeft: 10,
        });
      }
    });

    // The whole row's props rewritten, which is what a component body actually does on a re-render.
    const wholeRow = pass('whole row', () => {
      for (let id = 0; id < ROWS; id += 1) {
        routeProp(rows[id], 'style', {
          height: 44,
          flexDirection: 'row',
          paddingLeft: 10,
        });
        routeProp(rows[id], 'testID', `row-${id}`);
      }
    });

    // ── WHAT MUST HOLD, and none of it is a stopwatch ──────────────────────────────────────────────
    //
    // Nothing may reach the platform. `mountingLogs()` is the differ's output — what a host was
    // actually told to do — and it is the only instrument here that can say so.
    //
    // It is used INSTEAD of `commitMs`, and the reason is a trap worth not re-discovering:
    // `readSurfaceTelemetry` reads `getCurrentRevision().telemetry`, so a commit that was SKIPPED
    // leaves the previous commit's numbers standing. All three passes below report the CREATE's
    // `fabric=8.4 layout=7.6` — not their own cost, and asserting on it would have asserted that
    // eight milliseconds of somebody else's work were zero.
    for (const [name, measured] of [
      ['same object', sameObject],
      ['equal object', equalObject],
      ['whole row', wholeRow],
    ] as const) {
      if (
        measured.created !== 0 ||
        measured.cloned !== 0 ||
        measured.told !== 0
      ) {
        print(
          `DEBUG MISS ${name}: created=${measured.created} ` +
            `cloned=${measured.cloned} told=${measured.told}`,
        );
      }
      expect(measured.created).toBe(0);
      expect(measured.cloned).toBe(0);
      expect(measured.told).toBe(0);
    }

    // ── THE TWO SPELLINGS NOW COST THE SAME, AND THAT IS THE POINT ─────────────────────────────────
    //
    // `valueEntries` counts what crossed into the host's value table. This file was written while the
    // rebuilt literal cost one entry per row and a `folly::dynamic` conversion each, and it measured:
    //
    //                   before    after     (build-release, 1 000 rows, nothing changed)
    //   hoisted style      0.3      0.6
    //   rebuilt literal    9.7      0.6     16x — the whole gap was the conversion
    //   whole row         12.9      2.3     the 1 000 left are the per-row testID strings, which
    //                                       genuinely differ and are cheap
    //
    // `routeProp` now compares a rebuilt style against the standing one key for key before anything
    // is recorded (`isSameShallowStyle`), so an app that writes its style inline pays what an app
    // that hoists it pays. ZERO here for both is the assertion, and a non-zero `equalObject` would
    // mean the guard stopped firing — which is invisible on screen and costs the size of the list on
    // every unrelated state change.
    print(
      `DEBUG spelling cost: hoisted=${sameObject.wall.toFixed(1)} ms ` +
        `(${sameObject.valueEntries} values, convert ${sameObject.convertMs.toFixed(1)} ms) · ` +
        `rebuilt=${equalObject.wall.toFixed(1)} ms ` +
        `(${equalObject.valueEntries} values, convert ${equalObject.convertMs.toFixed(1)} ms) · ` +
        `wholeRow=${wholeRow.wall.toFixed(1)} ms ` +
        `(${wholeRow.valueEntries} values, convert ${wholeRow.convertMs.toFixed(1)} ms)`,
    );
    expect(sameObject.valueEntries).toBe(0);
    expect(equalObject.valueEntries).toBe(0);
  });
});

report();
