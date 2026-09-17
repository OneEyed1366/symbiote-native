// A React state update has to reach the screen on every render, while the targeted-replace path is
// running underneath it.
//
// why: device regression 2026-09-17 on `examples/react`, first Release build carrying the re-enabled
// `canReplaceInPlace`. Read the symptoms together and they are ONE symptom — a slider label stuck at
// 50% while its thumb moves, `dx 0 dy 0` under a live drag, benchmark counters frozen at zero,
// "native tag —" where a tag should print. None of that is "events are dead"; it is state that
// stopped painting. `ShadowNode::replaceChild` ends in `react_native_assert(false && "Child to
// replace was not found.")`, and an assert is NOTHING in a Release build: it returns having replaced
// nothing and the mutation is dropped in silence.
//
// Five hand-built `RCTView` fixtures have now failed to reproduce it
// (`targeted-replace-keeps-events.itest.ts`: single change, runs of changes, layout churn
// interleaved, real subtrees, text changes — all green with the path confirmed taken). What every
// one of them lacks is the ADAPTER: a real reconciler that re-renders a component, diffs, and emits
// its mutations interleaved with the structural reads that drain the op buffer. That is the layer
// this file adds, and it is the layer the user's broken build is built on.
//
// A state SETTER rather than a simulated gesture, deliberately. A press has to travel through the
// responder negotiation and the press machine before it becomes a state change, so a failure there
// would be indistinguishable from the one under test. Calling the setter asks the narrow question:
// once React has decided to re-render, does what it renders end up on the screen.
//
// ── THIS FILE REPRODUCES THE DEVICE BUG, and the A/B is what makes that a fact ───────────────────
//
// Both arms, same binary, only `canReplaceInPlace`'s first line differing:
//
//   path OFF   round 1 mountingLogs=101   rounds 2-10 mountingLogs=1  Update {type: "Paragraph"}
//   path ON    round 1 mountingLogs=101   rounds 2-10 mountingLogs=0  nothing at all
//
// `shadow=true` in EVERY round of BOTH arms — the committed shadow tree carries the new text either
// way. So the tree is right and the screen is stale, which is the one sentence that covers every
// symptom reported: the slider's thumb moves (native) while its label holds at 50%, the drag moves
// while `dx 0 dy 0` holds, the counters freeze at zero, `findNodeHandle` prints the tag it printed
// last time. Nothing is "dead"; nothing is being TOLD.
//
// The first update lands and every one after it is dropped, which is the disabling comment's own
// prediction — the record goes stale during the first targeted replace and the NEXT commit pays.
//
// WHY EVERY EARLIER FIXTURE MISSED IT: they asserted on `committedTexts()` / `mounted()`, i.e. on
// OUR side of the commit, and our side is correct. The differ's output is the only thing that says
// what a screen would show, and `mountingLogs()` is the only instrument in this harness that reads
// it. Six green fixtures asked the wrong question before this one asked the right one.

import { createElement, useState } from 'react';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount } from '@symbiote-native/react';

import {
  committedTexts,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  mountingLogs,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 24;

let setCounter: ((next: number) => void) | undefined;

/**
 * A header whose text follows state, over a list of rows that never change.
 *
 * That shape is the point: the rows hold still, so the list parent reaches `materialize`'s update
 * branch with exactly one moved slot — which is the shape `canReplaceInPlace` accepts and the shape
 * a real screen produces every time one row of a list re-renders.
 */
function Screen(): ReturnType<typeof createElement> {
  const [counter, setCounterState] = useState(0);
  setCounter = setCounterState;

  const rows = [];
  for (let id = 0; id < ROWS; id += 1) {
    rows.push(
      createElement(
        'view',
        { key: id, testID: `row-${id}`, style: { height: 44 } },
        createElement('text', null, `row ${id}`),
      ),
    );
  }

  return createElement(
    'view',
    { testID: 'screen', style: { flexDirection: 'column' } },
    createElement('text', { testID: 'header' }, `count ${counter}`),
    ...rows,
  );
}

describe('a react state update reaches the screen with the targeted path live', () => {
  it('paints every counter value across a run of renders', () => {
    const surface = mount(ROOT_TAG, createElement(Screen));
    flushTimers();
    surface.commit();

    // THE CONTROL. A fixture that never paints the first value reports the same miss a dropped
    // mutation does — this file's predecessor produced exactly that false alarm twice.
    const first = committedTexts();
    print(
      `DEBUG initial texts include "count 0": ${String(first.includes('count 0'))}`,
    );
    expect(first.includes('count 0')).toBe(true);

    const misses: string[] = [];
    let replaced = 0;
    readSurfaceTelemetry(ROOT_TAG);
    for (let round = 1; round <= 10; round += 1) {
      setCounter?.(round);
      flushTimers();
      surface.commit();
      flushTimers();
      // PULLS THE TRANSACTION. Until a transaction is pulled no platform — real or stub — has seen
      // the commit, so `mountingLogs()` would be empty for every commit ever made and the assertion
      // below would be a tautology. (It was, for one run: a `sed` with `/2` replaces the second match
      // ON A LINE, not in the file, so this call silently never landed.)
      mounted();
      replaced += readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

      const wanted = `count ${round}`;
      const texts = committedTexts();
      if (!texts.includes(wanted)) {
        misses.push(
          `round ${round}: "${wanted}" never reached the shadow tree`,
        );
      }

      // THE QUESTION EVERY ASSERTION SO FAR HAS MISSED, and it is the one the device asked.
      // `committedTexts()` reads the committed SHADOW tree — our side of the commit. What reaches a
      // screen is the DIFFER's output: `calculateShadowViewMutations` compares the old and new
      // revisions and leans on "an identical child pointer means an identical subtree" to skip whole
      // subtrees. A targeted replace that leaves the shadow tree perfectly correct can still hand the
      // differ a shape it reads as unchanged — and then the tree is right and the screen is stale,
      // which is exactly "the thumb moves, the label does not".
      //
      // `mountingLogs()` is what the platform was actually TOLD to do since the last read. Empty
      // means nothing was told, whatever the shadow tree says.
      const told = mountingLogs();
      if (told.length === 0) {
        misses.push(`round ${round}: the platform was told NOTHING`);
      }
      print(
        `DEBUG round ${round} shadow=${String(texts.includes(wanted))} ` +
          `mountingLogs=${told.length} ${told.slice(0, 2).join(' | ')}`,
      );
    }

    for (const miss of misses) print(`DEBUG MISS ${miss}`);
    print(`DEBUG targetedReplaces total=${replaced}`);
    expect(misses.length).toBe(0);
    // why: green with the path never taken proves nothing at all. If this reads zero, React's
    // reconciler does not produce the shape `canReplaceInPlace` accepts and this whole fixture is
    // aimed at the wrong layer — which is a finding, not a pass.
    expect(replaced > 0).toBe(true);
  });
});

report();
