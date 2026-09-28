// A targeted replace must leave every SIBLING it did not touch still reachable — by tag, and by the
// event the platform aims at that tag.
//
// why: device regression, the first Release build carrying the re-enabled
// `canReplaceInPlace`. Taps did nothing, a slider moved its thumb without its label following,
// `findNodeHandle` printed "native tag —", and a drag reported `dx 0 dy 0` while visibly dragging.
// Every one of those is the same shape: the view is on screen and the platform is talking to it, but
// the JS side can no longer name it. Nothing in the existing suite catches that — 128 itests, 317
// C++ tests and 5 552 vitest tests were green on the build that shipped it, because every one of
// them asks what the COMMITTED TREE looks like and none asks whether JS can still address it
// afterwards.
//
// The targeted path only rewrites the slots that moved. The siblings it skips keep pointers that
// were minted against an earlier revision of the parent, so "did the untouched neighbour survive" is
// exactly the question this path puts at risk and exactly the one no shape assertion covers.
//
// **IT PASSES, AND IT DOES NOT YET REPRODUCE THE DEVICE BUG — read that before trusting it.** On
// this fixture — a flat list of `RCTView`s with touch listeners, one layout-neutral prop change, the
// targeted path confirmed taken — tags survive and events arrive for the changed row and its
// untouched siblings alike. So whatever breaks the app is NOT reached here, and the gap is what this
// fixture lacks against a real screen: host behaviors (Pressable's press machine, `childHost`,
// wrappers), third-party native views (the slider), `setNativeProps`, and the deferred-attach path.
// That is where the next fixture has to go.
//
// It earns its place anyway as the shape no other file asserts, and as the record of how it was
// nearly misread: two earlier versions of this file reported ZERO arrivals and looked exactly like
// the device regression. Both were the fixture — first an interceptor registered before
// `createSurface` replaced it, then a counter read before the beat had turned. A control that taps
// BEFORE anything changes is what told them apart, and it is why that assertion is first.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  getNativeTag,
  readSurfaceTelemetry,
  routeProp,
  setEventListener,
  setText,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  committedTexts,
  describe,
  dispatchEvent,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 24;
/** The row the change lands on. Every assertion below is about a DIFFERENT row. */
const TOUCHED = 12;
const UNTOUCHED = 5;

const ROW_STYLE = { height: 44, flexDirection: 'row' };

const TOUCH = {
  touches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
  changedTouches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
  identifier: 1,
  pageX: 12,
  pageY: 4,
};

let rows: ISymbioteNode[] = [];
let labels: ISymbioteNode[] = [];
let surface: ReturnType<typeof createSurface> | undefined;

function build(): void {
  surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flexDirection: 'column' });
  surface.appendChild(list);

  rows = [];
  labels = [];
  for (let id = 0; id < ROWS; id += 1) {
    const row = createElement('RCTView');
    routeProp(row, 'style', ROW_STYLE);
    routeProp(row, 'nativeID', `row-${id}`);
    // The listener is what makes this node a real event TARGET; the interceptor below is what counts
    // arrivals, so the body has nothing to do.
    setEventListener(row, 'onTouchStart', () => {});

    // A REAL SUBTREE under every row, not a leaf. The disabling comment's failure is that our record
    // of a parent's children "can be stale at any depth", and a leaf row has no depth to be stale
    // at: `cloneChildInPlace` needs a laid-out child to clone in place before anything can go wrong.
    // Text is also what every reported symptom is made of.
    const label = createElement('RCTText');
    routeProp(label, 'nativeID', `label-${id}`);
    const text = createRawText(`row ${id}`);
    appendChild(label, text);
    appendChild(row, label);
    labels.push(text);

    appendChild(list, row);
    rows.push(row);
  }
  surface.commit();
  mounted();
}

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// INTERCEPT THE SLOT, and register AFTER the surface exists. `createSurface` installs the ENGINE's
// own handler through this same `registerEventHandler`, so an interceptor registered first is simply
// replaced and every arrival reads zero — which is the false alarm this file produced twice before
// the control caught it. This is engine-boot's proven shape; what it answers is "did the event reach
// JS at all, carrying the node it was aimed at", which is the half a targeted replace can break.
const arrivals: { handle: unknown; type: string }[] = [];

function interceptEvents(): void {
  const slot: unknown = (globalThis as Record<string, unknown>)
    .nativeFabricUIManager;
  if (
    slot !== null &&
    typeof slot === 'object' &&
    'registerEventHandler' in slot &&
    typeof slot.registerEventHandler === 'function'
  ) {
    slot.registerEventHandler((handle: unknown, type: string) => {
      arrivals.push({ handle, type });
    });
  }
}

/** Aim a touch at the mounted view carrying this row's `nativeID`; 1 when it reached that row. */
async function tap(id: number): Promise<number> {
  arrivals.length = 0;
  dispatchEvent(mountedRow(id)?.tag ?? -1, 'touchStart', TOUCH);
  await tick();
  return arrivals.filter(one => one.handle === rows[id]).length;
}

function surfaceOf(): ReturnType<typeof createSurface> {
  if (surface === undefined) throw new Error('no surface open');
  return surface;
}

type IMounted = {
  tag: number;
  props: Record<string, string>;
  children: IMounted[];
};

/** The mounted view carrying this `nativeID`, wherever the differ put it. */
function mountedRow(id: number): IMounted | undefined {
  const found: IMounted[] = [];
  const walk = (view: IMounted): void => {
    if (view.props.nativeID === `row-${id}`) found.push(view);
    for (const child of view.children) walk(child);
  };
  walk(mounted());
  return found[0];
}

type IProbe = {
  arrivalsBeforeChange: number;
  replaces: number;
  tagBefore: number | undefined;
  tagAfter: number | undefined;
  tagTouched: number | undefined;
  colourBefore: string | undefined;
  colourAfter: string | undefined;
  arrivalsUntouched: number;
  arrivalsTouched: number;
};

// ONE case for the whole scenario, deliberately: the harness resets the surface and the shadow-tree
// registry between cases, so a second `it` would be asserting against a fresh tree and the nodes
// this file holds would belong to a surface that no longer exists. Found the hard way — the split
// version aborted inside `readSurfaceTelemetry` on a revision no commit had ever stamped.
async function probe(): Promise<IProbe> {
  build();
  interceptEvents();
  const tagBefore = getNativeTag(rows[UNTOUCHED]);

  // THE CONTROL, and without it this file cannot tell a broken path from a broken fixture. If the
  // tap does not land HERE — before anything has been changed, on a plain freshly mounted tree —
  // then the targeted replace is not what this test is measuring. It read zero once already.
  const arrivalsBeforeChange = await tap(UNTOUCHED);

  const colourBefore = mountedRow(TOUCHED)?.props.backgroundColor;

  readSurfaceTelemetry(ROOT_TAG);
  routeProp(rows[TOUCHED], 'style', {
    ...ROW_STYLE,
    backgroundColor: '#f5a524',
  });
  surfaceOf().commit();
  mounted();
  const replaces = readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

  return {
    arrivalsBeforeChange,
    replaces,
    tagBefore,
    tagAfter: getNativeTag(rows[UNTOUCHED]),
    tagTouched: getNativeTag(rows[TOUCHED]),
    colourBefore,
    // THE QUESTION THE DEVICE ACTUALLY ASKED. Every reported symptom — a slider label stuck at 50%
    // while its thumb moves, `dx 0 dy 0` under a live drag, benchmark counters frozen at zero — is
    // text that should have changed and did not. `ShadowNode::replaceChild` ends in
    // `react_native_assert(false && "Child to replace was not found.")`, which is NOTHING in a
    // Release build: it returns having replaced nothing and the mutation is dropped in silence.
    // Tags and events surviving says nothing about whether the new VALUE landed.
    colourAfter: mountedRow(TOUCHED)?.props.backgroundColor,
    arrivalsUntouched: await tap(UNTOUCHED),
    arrivalsTouched: await tap(TOUCHED),
  };
}

describe('a targeted replace leaves its untouched siblings addressable', () => {
  it('keeps every row reachable by tag and by event after one row changes', async () => {
    const one = await probe();
    print(
      `DEBUG arrivalsBeforeChange=${one.arrivalsBeforeChange} ` +
        `targetedReplaces=${one.replaces} ` +
        `tag before=${String(one.tagBefore)} after=${String(one.tagAfter)} ` +
        `touched=${String(one.tagTouched)}`,
    );
    print(
      `DEBUG taps landed: untouched=${one.arrivalsUntouched} touched=${one.arrivalsTouched}`,
    );
    print(
      `DEBUG backgroundColor before=${String(one.colourBefore)} after=${String(one.colourAfter)}`,
    );

    // why: the control. A fixture that cannot deliver a tap on an untouched tree reports the same
    // zero a real regression does, and this file already produced that false alarm once.
    expect(one.arrivalsBeforeChange).toBe(1);
    // why: a zero here means the commit took the full-handover path and this file proves nothing
    // about the targeted one — green by absence, the failure mode it exists to prevent.
    expect(one.replaces > 0).toBe(true);
    expect(one.tagBefore !== undefined).toBe(true);
    expect(one.tagAfter !== undefined).toBe(true);
    expect(one.tagTouched !== undefined).toBe(true);
    // why: the tag is only half of it — the device symptom was a mounted view whose taps reached
    // nothing, so the listener the engine registered has to keep firing.
    expect(one.arrivalsUntouched).toBe(1);
    expect(one.arrivalsTouched).toBe(1);
    // why: the device symptom is a value that never paints. A commit the targeted path dropped looks
    // exactly like this — same tree, same tags, same events, stale prop.
    expect(one.colourAfter !== one.colourBefore).toBe(true);
  });

  // why: ONE change proves nothing about the failure this path was disabled for. Its own comment
  // says the damage shows up on the commit AFTER: "the child list `adoptLandedChildren` recorded at
  // commit time then names nodes that are no longer there ... and the NEXT commit's
  // `ShadowNode::replaceChild` cannot find the child it was asked to replace". A stale record needs a
  // second visit to bite, and every device symptom is a value that stopped following its state — a
  // screen mutates the same tree dozens of times, not once.
  it('lands every value across a run of changes, not just the first', async () => {
    build();

    const colours = ['#f5a524', '#3a2c10', '#1d4ed8', '#047857', '#b91c1c'];
    const misses: string[] = [];
    let replaced = 0;

    readSurfaceTelemetry(ROOT_TAG);
    for (let round = 0; round < colours.length; round += 1) {
      // A DIFFERENT row each round, because the record that can go stale is the parent's and a
      // single row would keep re-dirtying the same slot.
      const row = (round * 7 + 3) % ROWS;
      routeProp(rows[row], 'style', {
        ...ROW_STYLE,
        backgroundColor: colours[round],
      });
      surfaceOf().commit();
      mounted();
      replaced += readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

      const landed = mountedRow(row)?.props.backgroundColor;
      const wanted = colours[round].toLowerCase();
      // `getDebugProps` prints a parsed colour, so compare on the channels rather than the spelling.
      const matches = landed !== undefined && landed.startsWith('rgba(');
      if (!matches) misses.push(`round ${round} row ${row}: ${String(landed)}`);
      print(
        `DEBUG round ${round} row ${row} wanted ${wanted} landed ${String(landed)}`,
      );
    }

    print(`DEBUG targetedReplaces total=${replaced} misses=${misses.length}`);
    expect(replaced > 0).toBe(true);
    expect(misses.length).toBe(0);
  });

  // why: the two cases above never make Fabric SUBSTITUTE anything, so they cannot reach the failure
  // this path was disabled for. `replacementsAreLayoutClean` only lets the targeted path run when no
  // replacement moves layout — but the disabling comment's own words are that "the layout pass
  // substitutes on every commit, not only on ours". A commit that DOES move layout runs
  // `YogaLayoutableShadowNode::cloneChildInPlace`, which swaps clones into a standing parent behind
  // our record. The poison is planted by that commit and collected by the NEXT targeted one.
  //
  // So: alternate. A layout-affecting change, then a layout-neutral change on a different row, and
  // ask whether the second one's value ever reaches the screen.
  it('lands values when layout-moving and layout-neutral changes alternate', async () => {
    build();

    const misses: string[] = [];
    let replaced = 0;
    readSurfaceTelemetry(ROOT_TAG);

    for (let round = 0; round < 6; round += 1) {
      // MOVES LAYOUT: a height change dirties this row and sends the layout pass through the list,
      // which is what makes Fabric clone standing children in place.
      const tall = (round * 5 + 1) % ROWS;
      routeProp(rows[tall], 'style', { ...ROW_STYLE, height: 40 + round });
      surfaceOf().commit();
      mounted();

      // LAYOUT-NEUTRAL, on a different row: the shape the targeted path accepts.
      const tinted = (round * 5 + 8) % ROWS;
      const colour = `rgb(${10 + round * 7}, 20, 30)`;
      routeProp(rows[tinted], 'style', {
        ...ROW_STYLE,
        backgroundColor: colour,
      });
      surfaceOf().commit();
      mounted();
      replaced += readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

      const landed = mountedRow(tinted)?.props.backgroundColor;
      const wanted = `rgba(${10 + round * 7}, 20, 30, 1)`;
      if (landed !== wanted) {
        misses.push(
          `round ${round} row ${tinted}: ${String(landed)} != ${wanted}`,
        );
      }
      print(
        `DEBUG round ${round} tall=${tall} tinted=${tinted} landed=${String(landed)} wanted=${wanted}`,
      );
    }

    print(`DEBUG targetedReplaces total=${replaced} misses=${misses.length}`);
    for (const miss of misses) print(`DEBUG MISS ${miss}`);
    expect(replaced > 0).toBe(true);
    expect(misses.length).toBe(0);
  });

  // why: every reported device symptom is TEXT that stopped following its state — a slider label
  // stuck at 50%, `dx 0 dy 0` under a live drag, counters frozen at zero. Text is not an ordinary
  // prop in Fabric: `ParagraphShadowNode` carries STATE and writes it during LAYOUT
  // (`updateStateIfNeeded<ParagraphState>` -> `setStateData`, ParagraphShadowNode.cpp:336). We call
  // `completeSurface` with `enableStateReconciliation: true`, so a node whose state moved is cloned
  // by `progressState` INSIDE the commit — the third name in the disabling comment's own list, beside
  // `updateMountedFlag` and the differ, and the one nothing has ever tested.
  //
  // The cases above only ever changed a VIEW's props, so no state ever moved and `progressState` had
  // nothing to do. This one changes the text itself, round after round, and asks the only question
  // the device actually asked: does what I wrote end up on the screen.
  it('lands every text change while the targeted path is running', async () => {
    build();

    const misses: string[] = [];
    let replaced = 0;
    readSurfaceTelemetry(ROOT_TAG);

    for (let round = 0; round < 8; round += 1) {
      const row = (round * 3 + 2) % ROWS;
      const wanted = `updated ${round} on ${row}`;
      setText(labels[row], wanted);

      // A layout-neutral tint on ANOTHER row in the SAME commit, so the list parent carries both a
      // state-moving child and a targeted-replaceable one — which is what a real screen does on
      // every frame and what none of the cases above combined.
      const tinted = (round * 3 + 9) % ROWS;
      routeProp(rows[tinted], 'style', {
        ...ROW_STYLE,
        backgroundColor: `rgb(${5 + round * 9}, 40, 50)`,
      });

      surfaceOf().commit();
      mounted();
      replaced += readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

      const texts = committedTexts();
      if (!texts.includes(wanted)) {
        misses.push(`round ${round}: "${wanted}" never reached the screen`);
      }
      const tint = mountedRow(tinted)?.props.backgroundColor;
      const wantedTint = `rgba(${5 + round * 9}, 40, 50, 1)`;
      if (tint !== wantedTint) {
        misses.push(`round ${round}: tint ${String(tint)} != ${wantedTint}`);
      }
      print(
        `DEBUG round ${round} text="${wanted}" present=${String(texts.includes(wanted))} tint=${String(tint)}`,
      );
    }

    print(`DEBUG targetedReplaces total=${replaced} misses=${misses.length}`);
    for (const miss of misses) print(`DEBUG MISS ${miss}`);
    // ZERO IS THE CORRECT ANSWER HERE, and the chain that produces it is worth reading once. A text
    // change replaces a raw text, whose `Paragraph` parent is a `LeafYogaNode` and is refused
    // outright (it derives its own state from its children). The paragraph is therefore cloned with
    // its whole child list, which leaves it NOT layout-clean — so the row above it is refused by
    // `replacementsAreLayoutClean`, and the list above that by the same rule one level on. Every
    // refusal is a different guard reaching the same verdict, which is what a coherent guard set
    // looks like rather than a coincidence.
    //
    // What this arm asserts is that the VALUES land, and they do. Liveness is asserted where the
    // shape actually supports it: `targeted-replace-is-live.itest.ts`.
    expect(misses.length).toBe(0);
  });
});

report();
