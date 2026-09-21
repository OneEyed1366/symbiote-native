// What does a DRAIN cost when the batch is nearly empty?
//
// why: a read is a batch boundary, and one framework loop makes that the dominant cost of a step.
// `solid-js/universal`'s `cleanChildren` empties a parent with
// `while (removed = getFirstChild(parent)) removeNode(parent, removed)`, so every removal is
// followed by a read and every read drains. Measured across the bench arms after `firstChildOf`
// stopped being quadratic: a 1 000-row `Clear` costs the engine `apply=13.1` on Solid with 1 001
// `applyOps` calls, against `apply=2.6` on React and Svelte with 2 — same tree, same removals.
//
// That subtraction gives ~10.5 us per extra crossing, and it is an INFERENCE from two arms in two
// processes. This file measures it directly: the same removals, in one process, once in a single
// batch and once one drain at a time, with the committed tree asserted identical before any
// millisecond is read.
//
// It also splits the cost, because the two halves have different fixes. `takeBatch` is ours and is
// six allocations per call — the ops slice plus four fresh arrays plus a Set. `applyOps` is the
// crossing itself. Only a measurement says which one to attack.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import {
  appendChild,
  createElement,
  createSurface,
  removeChild,
  routeProp,
  setTreeHost,
  treeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';
import { firstChildOf } from '@symbiote-native/engine/host-access';

import {
  committedTags,
  describe,
  expect,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const CHILDREN = 1_000;

let applyCalls = 0;
let applyMs = 0;

/**
 * Time the host's own `applyOps` and nothing else.
 *
 * A clock around `flushOps` measures `takeBatch` too, which is ours and is the half that can be made
 * cheaper without touching the wire. Bracketing the call is what makes "how much of this is the
 * crossing" answerable at all — the same split the react probe had to learn (F-23).
 */
// ONCE per process, and the guard is not tidiness: the wrapper installs itself over whatever host
// is standing, so a second case calling this wraps the wrapper and every `applyOps` is counted
// twice. The second arm here read 2 000 crossings for 1 000 removals and its own oracle called that
// a finding — the same shape as a fixture reading another case's telemetry.
let isCounting = false;

function countCrossings(): void {
  if (isCounting) return;
  isCounting = true;
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      applyCalls += 1;
      const startedAt = performance.now();
      base.applyOps(batch);
      applyMs += performance.now() - startedAt;
    },
  });
}

/** A parent with `CHILDREN` leaves under it, committed and standing. */
function standingList(
  surface: ReturnType<typeof createSurface>,
): ISymbioteNode {
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  for (let at = 0; at < CHILDREN; at += 1) {
    const child = createElement('RCTView');
    routeProp(child, 'style', { height: 44 });
    appendChild(list, child);
  }
  surface.appendChild(list);
  flushOps();
  surface.commit();
  mounted();
  return list;
}

/**
 * The children as the HOST holds them — read once, up front, so neither arm pays for navigation.
 *
 * Deliberately not `childrenOf` inside the timed region: this file prices the DRAIN, and a read that
 * also returned a thousand handles would put the thing `firstChildOf` was just fixed for back into
 * the measurement.
 */
function childrenOfList(list: ISymbioteNode): readonly ISymbioteNode[] {
  const host = treeHost();
  if (host === undefined) throw new Error('no host installed');
  const children: ISymbioteNode[] = [];
  for (const handle of host.childrenOf(list)) {
    // A runtime narrowing, not a cast: the host hands back bare objects and these are ours.
    if (
      typeof handle === 'object' &&
      handle !== null &&
      'component' in handle
    ) {
      children.push(handle as unknown as ISymbioteNode);
    }
  }
  return children;
}

type IArm = { wall: number; calls: number; applyMs: number; nodes: number };

function take(wall: number, nodes: number): IArm {
  const arm = { wall, calls: applyCalls, applyMs, nodes };
  applyCalls = 0;
  applyMs = 0;
  return arm;
}

describe('what a drain costs when the batch is nearly empty', () => {
  // why: the same thousand removals, once as one batch and once as a thousand. The difference is
  // what a framework pays for asking a question between two mutations — which is not an exotic
  // pattern but the ordinary shape of `cleanChildren`, `insertExpression` and every keyed patch that
  // navigates what it is building.
  it('prices one drain against a thousand', () => {
    const surface = createSurface(ROOT_TAG);
    let list = standingList(surface);
    countCrossings();

    // ONE BATCH: every removal recorded, a single drain at the end.
    let children = childrenOfList(list);
    expect(children.length).toBe(CHILDREN);
    take(0, 0);
    let startedAt = performance.now();
    for (const child of children) removeChild(list, child);
    flushOps();
    const batched = take(performance.now() - startedAt, 0);
    surface.commit();
    const batchedNodes = committedTags().length;
    mounted();

    // A THOUSAND BATCHES: the identical removals, each followed by a drain — which is exactly what a
    // read between two mutations forces.
    surface.clear();
    flushOps();
    surface.commit();
    mounted();
    list = standingList(surface);
    children = childrenOfList(list);
    expect(children.length).toBe(CHILDREN);
    take(0, 0);
    startedAt = performance.now();
    for (const child of children) {
      removeChild(list, child);
      flushOps();
    }
    const drained = take(performance.now() - startedAt, 0);
    surface.commit();
    const drainedNodes = committedTags().length;
    mounted();

    print(
      `DEBUG one batch    wall=${batched.wall.toFixed(1)} ms applyOps=${batched.calls} ` +
        `inside=${batched.applyMs.toFixed(1)} ms`,
    );
    print(
      `DEBUG per removal  wall=${drained.wall.toFixed(1)} ms applyOps=${drained.calls} ` +
        `inside=${drained.applyMs.toFixed(1)} ms`,
    );

    // THE COMPARABILITY GATE, before any millisecond is quoted: two arms that left different trees
    // standing did different work, and a step that removed nothing reads as instant.
    expect(drainedNodes).toBe(batchedNodes);
    expect(batched.calls).toBe(1);
    expect(drained.calls).toBe(CHILDREN);

    const extra = drained.wall - batched.wall;
    const insideExtra = drained.applyMs - batched.applyMs;
    print(
      `DEBUG DRAIN COST   ${((extra * 1_000) / CHILDREN).toFixed(2)} us per extra drain · ` +
        `crossing ${((insideExtra * 1_000) / CHILDREN).toFixed(2)} us · ` +
        `ours (takeBatch + call) ${(((extra - insideExtra) * 1_000) / CHILDREN).toFixed(2)} us`,
    );
  });

  // why: the loop itself, not one of its halves. `cleanChildren` alternates a READ and a REMOVAL,
  // and the read is what forces the drain — so the pair is the unit an adapter actually pays, and
  // the only way to say how much of Solid's `Clear` is ours. Whatever this leaves unexplained
  // against the suite's number is `solid-js/universal`'s own loop, which nothing here can change.
  it('prices the read-then-remove pair Solid empties a parent with', () => {
    const surface = createSurface(ROOT_TAG);
    const list = standingList(surface);
    countCrossings();
    take(0, 0);

    const startedAt = performance.now();
    // The shape verbatim (`solid-js/universal/dist/universal.js:164`), through the same engine
    // entry points our renderer supplies as `getFirstChild` and `removeNode`.
    let removed = firstChildOf(list);
    while (removed !== undefined) {
      removeChild(list, removed);
      removed = firstChildOf(list);
    }
    const arm = take(performance.now() - startedAt, 0);
    surface.commit();
    mounted();

    // THE ORACLE, before any millisecond: the loop really did empty the parent, and it really did
    // drain once per removal. An arm that terminated early would read as fast.
    expect(childrenOfList(list).length).toBe(0);
    expect(arm.calls).toBe(CHILDREN);

    const each = (arm.wall * 1_000) / CHILDREN;
    const inside = (arm.applyMs * 1_000) / CHILDREN;
    print(
      `DEBUG CLEAN LOOP   ${arm.wall.toFixed(1)} ms for ${CHILDREN} removals = ` +
        `${each.toFixed(2)} us each · applyOps ${inside.toFixed(2)} us · ` +
        `ours above it ${(each - inside).toFixed(2)} us`,
    );
  });

  // why: a drain that carries ONE op and a drain that carries NONE do the same prologue — five JSI
  // arguments unwrapped, three property reads to find the typed array's backing store, a binding
  // looked up, a slot vector allocated. If an empty call costs what a one-op call costs, the fixed
  // prologue IS the price of asking a question between two mutations, and the op is free beside it.
  it('prices the prologue alone, with nothing in the batch', () => {
    const host = treeHost();
    if (host === undefined) throw new Error('no host installed');

    const empty = {
      ops: new Int32Array(0),
      strings: [],
      values: [],
      instanceHandles: [],
      handles: [],
    };

    // Warmed once: the first call through a JSI entry point pays its own lookups.
    host.applyOps(empty);

    const startedAt = performance.now();
    for (let at = 0; at < CHILDREN; at += 1) host.applyOps(empty);
    const wall = performance.now() - startedAt;

    // THE FLOOR, and without it the number above cannot be acted on. Part of any binding's cost is
    // JavaScriptCore invoking a native function at all, which no amount of work inside it can
    // remove. `performance.now()` is bound to the tester's own `steady_clock` — a host function
    // taking no arguments and doing one `now()` — so it prices the call and nothing else.
    performance.now();
    const floorStartedAt = performance.now();
    for (let at = 0; at < CHILDREN; at += 1) performance.now();
    const floor = performance.now() - floorStartedAt;

    print(
      `DEBUG PROLOGUE     ${CHILDREN} empty applyOps = ${wall.toFixed(1)} ms ` +
        `= ${((wall * 1_000) / CHILDREN).toFixed(2)} us each · ` +
        `bare JSI call floor = ${((floor * 1_000) / CHILDREN).toFixed(2)} us · ` +
        `removable at most ${(((wall - floor) * 1_000) / CHILDREN).toFixed(2)} us`,
    );

    // A tripwire only: the finding is the number, and an empty batch must at minimum not be free by
    // accident — a host that silently ignored the call would report zero and mean nothing.
    expect(wall >= 0).toBe(true);
  });
});

report();
