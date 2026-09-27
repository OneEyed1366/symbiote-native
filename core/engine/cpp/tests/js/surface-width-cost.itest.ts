// Does a commit cost anything for the parts of the screen it did NOT touch?
//
// why: every fixture in this directory commits a surface holding one list. `BenchmarkScreen` commits
// one that also holds ~800 sticky children, a section list and a frame meter — and that is the last
// structural difference between the headless arms and the device screens after six other candidates
// were priced and eliminated (see the measurement skill). `commitSurfaceOps` visits the committed
// surface's children to rediscover that none of them moved, so the question is whether a wide
// surface makes an unrelated create more expensive.
//
// The product rule being asserted: **a commit's cost is a function of what changed, not of how wide
// the surface is.** If a thousand-row create gets materially more expensive because 800 untouched
// siblings stand beside it, that is a real cost the published table cannot see and the device pays.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's list append is O(N^2).

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
// The sticky block in `examples/*/screens/BenchmarkScreen` flattens 200 sections of a header plus
// three rows into one scroll view: 800 children standing beside the list on every commit.
const BYSTANDERS = 800;
// A STANDING TREE rather than a wide surface, and a different question from the one above: not
// "how many children does the commit walk past" but "how big is the heap the allocator is handing
// nodes out of". A fixture process holds one small tree; an app holds a navigation stack, every
// mounted screen and everything RN itself allocates, and OUR half of a create is 75% C++ that
// allocates per node. Ten rows each, so this is 50 000 nodes standing before the timed create.
const STANDING_ROWS = 5_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };

/** The suite's row, built straight on the engine: three views, three texts, three raw texts. */
function buildRow(id: number): ReturnType<typeof createElement> {
  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'nativeID', `row-${id}`);
  for (let cell = 0; cell < 3; cell += 1) {
    const box = createElement('RCTView');
    routeProp(box, 'style', CELL_STYLE);
    const text = createElement('RCTText');
    routeProp(text, 'ellipsizeMode', 'tail');
    appendChild(text, createElement('RCTRawText'));
    appendChild(box, text);
    appendChild(row, box);
  }
  return row;
}

function timeArm(
  label: string,
  bystanders: number,
  standingRows = 0,
): { wall: number; nodes: number; created: number } {
  const surface = createSurface(ROOT_TAG);

  // Mounted and COMMITTED before the clock starts, so they are standing children the timed commit
  // did not touch — which is the whole subject. Built inside the surface rather than beside it
  // because that is where the screen's sticky block sits.
  for (let index = 0; index < bystanders; index += 1) {
    const idle = createElement('RCTView');
    routeProp(idle, 'style', CELL_STYLE);
    routeProp(idle, 'nativeID', `idle-${index}`);
    surface.appendChild(idle);
  }
  // Depth as well as width: full rows rather than bare views, so the standing tree is the same
  // SHAPE as the one being timed and the heap it leaves behind is the one an app would have.
  //
  // UNDER ONE CONTAINER, deliberately, so this arm is not the width arm again with a bigger number:
  // the surface still holds a handful of children however many nodes are standing, and what changes
  // is only how much the allocator has handed out.
  if (standingRows > 0) {
    const standing = createElement('RCTView');
    routeProp(standing, 'style', CELL_STYLE);
    // NOT decoration: a view carrying nothing but a style is FLATTENED by Fabric and its children
    // become direct children of the root — which silently turned the first version of this arm back
    // into the width arm, 6 000 surface children and all. A `nativeID` keeps the container standing,
    // so the surface really does hold a handful of children however many nodes exist.
    routeProp(standing, 'nativeID', 'standing');
    for (let id = 0; id < standingRows; id += 1) {
      appendChild(standing, buildRow(1_000_000 + id));
    }
    surface.appendChild(standing);
  }
  const warmed = bystanders > 0 || standingRows > 0;
  if (warmed) {
    surface.commit();
    mounted();
  }

  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  const rows = [];
  for (let id = 0; id < ROWS; id += 1) rows.push(buildRow(id));

  // Drained so the warm-up commit above is not billed to the timed one. Read directly rather than
  // through `readCommitProfile`, which folds the same telemetry in and would zero it first — the
  // phase split is what this arm is for, and it lives only here.
  //
  // ONLY WHEN A COMMIT HAS ACTUALLY LANDED, and the guard is not defensive. `readSurfaceTelemetry`
  // reaches `TransactionTelemetry::getCommitStartTime`, which ASSERTS a commit has started — so on
  // the baseline arm, where nothing was committed above, the read aborts the process in the assert
  // build (`react_native_assert failure: commitStartTime_ != kTelemetryUndefinedTimePoint`) and
  // reads an undefined time point in the release one. It went unnoticed because this fixture was
  // only ever run on `bench:itest`, where the assert is compiled out and the wrong number is silent.
  if (warmed) readSurfaceTelemetry(ROOT_TAG);
  const startedAt = performance.now();
  for (const row of rows) appendChild(list, row);
  surface.appendChild(list);
  surface.commit();
  const wall = performance.now() - startedAt;

  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  if (telemetry === undefined) throw new Error(`no telemetry after ${label}`);
  const root = mounted();
  print(
    `DEBUG ${label.padEnd(12)} wall=${wall.toFixed(1)} ms · walk=${telemetry.walkMs.toFixed(1)} ` +
      `apply=${telemetry.applyMs.toFixed(1)} fabric=${telemetry.commitMs.toFixed(1)} ` +
      `layout=${telemetry.layoutMs.toFixed(1)} · created=${telemetry.nodesCreated} ` +
      `surfaceChildren=${root.children.length}`,
  );
  return {
    wall,
    nodes: root.children.length,
    created: telemetry.nodesCreated,
    walk: telemetry.walkMs,
    apply: telemetry.applyMs,
    fabric: telemetry.commitMs,
    layout: telemetry.layoutMs,
  };
}

let narrow: ReturnType<typeof timeArm> | undefined;

describe('what a commit pays for the part of the screen it did not touch', () => {
  // why: the shape every headless arm has today — one list under the surface and nothing else.
  it('creates a thousand rows on a surface holding nothing else', () => {
    narrow = timeArm('narrow', 0);

    // The rows, the list container, and the surface's own container — which a surface mints on its
    // FIRST commit, pinned in `commit-profile-census.itest.ts`. The wide arm has already spent that
    // one on its warm-up, which is the whole of the difference asserted below.
    expect(narrow.created).toBe(ROWS * 10 + 2);
    // The list carries nothing but `flex: 1`, so Fabric flattens it away and its rows land directly
    // on the root — the same flattening `engine-boot.itest.ts` pins. Asserted rather than worked
    // around: a test that silently expected a container here would be asserting about a tree the
    // platform does not hold.
    expect(narrow.nodes).toBe(ROWS);
  });

  // why: the shape the device screen has. Same rows, same writes, same created count — the only
  // difference is 800 committed siblings the step never touches.
  it('creates the same thousand rows beside 800 standing siblings', () => {
    const wide = timeArm('wide', BYSTANDERS);

    if (narrow === undefined) throw new Error('the narrow arm did not run');

    const delta = wide.wall - narrow.wall;
    print(
      `DEBUG COST        narrow=${narrow.wall.toFixed(1)} wide=${wide.wall.toFixed(1)} ms · ` +
        `${BYSTANDERS} untouched siblings cost ${delta.toFixed(1)} ms ` +
        `= ${((delta * 1_000) / BYSTANDERS).toFixed(2)} us each`,
    );

    // THE COMPARABILITY GATE: the timed step mints the same ten thousand row nodes and the same
    // list container in both arms, so the siblings are the only difference and the delta above is
    // theirs. One node fewer here than in the narrow arm, and exactly one: the surface's container
    // was minted by this arm's warm-up commit instead of by the timed one.
    expect(wide.created).toBe(ROWS * 10 + 1);
    expect(wide.nodes).toBe(BYSTANDERS + ROWS);
  });

  // why: the last shape-of-the-process difference a fixture has against an app. Not the commit's
  // width but the HEAP it allocates out of: a test process holds one small tree, an app holds a
  // navigation stack and every mounted screen, and 75% of our create is C++ that allocates per node.
  // If a big standing tree makes the identical create materially slower, allocation and locality are
  // implicated — and that is a difference that grows with the app and never with a fixture.
  it('creates the same thousand rows with 50 000 nodes already standing', () => {
    const loaded = timeArm('loaded', 0, STANDING_ROWS);

    if (narrow === undefined) throw new Error('the narrow arm did not run');

    const delta = loaded.wall - narrow.wall;
    print(
      `DEBUG HEAP        narrow=${narrow.wall.toFixed(1)} loaded=${loaded.wall.toFixed(1)} ms · ` +
        `${STANDING_ROWS * 10} standing nodes cost ${delta.toFixed(1)} ms ` +
        `(${((delta / narrow.wall) * 100).toFixed(0)}%)`,
    );
    // WHERE it lands, which is what turns a finding into a place to look. The phases are disjoint:
    // `walk` is our materialize, `apply` our op decode, `fabric` ShadowTree::commit and `layout`
    // Yoga — so whichever of them moves is the one carrying the load.
    print(
      `DEBUG HEAP SPLIT  walk ${narrow.walk.toFixed(1)}->${loaded.walk.toFixed(1)} · ` +
        `apply ${narrow.apply.toFixed(1)}->${loaded.apply.toFixed(1)} · ` +
        `fabric ${narrow.fabric.toFixed(1)}->${loaded.fabric.toFixed(1)} · ` +
        `layout ${narrow.layout.toFixed(1)}->${loaded.layout.toFixed(1)}`,
    );

    // Same gate: the timed step mints the same tree, so the standing nodes are the only difference.
    expect(loaded.created).toBe(ROWS * 10 + 1);
  });
});

report();
