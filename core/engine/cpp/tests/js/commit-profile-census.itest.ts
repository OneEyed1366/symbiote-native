// The node census the benchmark screens read, asserted against a tree whose size is known by
// construction. It exists because that census is the only like-for-like number left between us and
// stock React Native: our creates are issued from C++ (`SymbioteTree.cpp`, `uiManager.createNode`)
// and never pass through `global.nativeFabricUIManager`, so the JS wrapper a stock app counts with
// reads zero on our arm. A column nothing asserts is a number nobody has vouched for — and a wrong
// census does not look wrong, it looks like a performance result.

import {
  createElement,
  createSurface,
  readCommitProfile,
  setProp,
} from '@symbiote-native/engine';

import { expect, report, test } from './harness';

// Each child carries a prop, because a view with nothing on it is flattened at the mounting layer
// and the test would then be asserting about two things at once.
const CHILD_COUNT = 7;

function appendChildren(
  surface: ReturnType<typeof createSurface>,
  count: number,
): ReturnType<typeof createElement>[] {
  const children = [];
  for (let index = 0; index < count; index += 1) {
    const child = createElement('RCTView');
    setProp(child, 'nativeID', `row-${index}`);
    surface.appendChild(child);
    children.push(child);
  }
  return children;
}

test('the commit profile counts every Fabric family the commit minted', () => {
  const surface = createSurface(1);
  // Read-and-reset, so whatever a previous case left standing in the window would be billed to this
  // one. Drained AFTER `createSurface` so the root is out of the count and the expectation is the
  // children alone.
  readCommitProfile();

  appendChildren(surface, CHILD_COUNT);
  surface.commit();

  // The children PLUS ONE: a surface mints its own container node on its first commit, not in
  // `createSurface`, so draining after that call does not put the root outside the window. This is
  // the same `+1` that makes the benchmark table read 10 003 for an adapter against 10 002 for
  // stock, so it is asserted here rather than explained there.
  //
  // ABSOLUTE, not a delta against a previous reading: two empty censuses match each other
  // perfectly, so a delta assertion is true of an instrument that counts nothing at all.
  const profile = readCommitProfile();
  expect(profile.nodesCreated).toBe(CHILD_COUNT + 1);
  // TWO crossings for a whole create, and two is the floor rather than the ideal — the same number
  // every adapter arm's telemetry prints as `batches=2`. What matters is that it does not scale with
  // the tree: the buffer fills in JS and is applied in a fixed number of entries into C++. It reads
  // higher the moment something READS the tree while the tree is being built, because a read has to
  // drain the buffer to answer, and `small-batch-crossing-cost.itest.ts` prices an empty prologue at
  // 1.5-4.4 us — so ten thousand boundaries would be tens of milliseconds that no node count and no
  // write count can see. This is the tripwire for that.
  expect(profile.applyCalls).toBe(2);
});

// why: THIS PROFILE IS ABOUT TO BE READ ON A DEVICE and a defect in it would cost a build, a
// simulator run and a wrong conclusion rather than a red line here. `applyMs` and `decodeMs` are the
// two fields that decide whether the single crossing's JSI array reads are the device gap (§18 of the
// measurement skill), and they arrive through the same read-and-drain that once made `nodesCreated`
// abort a debug build by asking a surface that had not committed.
//
// The assertions are RELATIONS, not values, because a millisecond is not reproducible: the decode is
// a part of `applyOps`, so it is positive and smaller — and a zero would be exactly what a field
// wired to nothing reports.
test('the commit profile carries the crossing cost it will be read for', () => {
  const surface = createSurface(1);
  readCommitProfile();

  appendChildren(surface, CHILD_COUNT);
  surface.commit();

  const profile = readCommitProfile();
  expect(profile.applyMs).toBeGreaterThan(0);
  expect(profile.decodeMs).toBeGreaterThan(0);
  // Containment, which is the claim the device reading rests on: a `decodeMs` larger than the call
  // that contains it would mean the two are measuring different windows and the ratio is not a
  // share of anything.
  expect(profile.decodeMs).toBeLessThan(profile.applyMs);
});

// why: the census must not carry a commit's work into the next window. A counter that accumulates
// reports the SECOND step of a benchmark as the sum of the first two, which reads as a step that
// got slower rather than as a broken instrument.
test('the census drains, so a second commit is billed only its own nodes', () => {
  const surface = createSurface(1);
  readCommitProfile();

  appendChildren(surface, CHILD_COUNT);
  surface.commit();
  readCommitProfile();

  appendChildren(surface, CHILD_COUNT);
  surface.commit();

  expect(readCommitProfile().nodesCreated).toBe(CHILD_COUNT);
});

// why: a commit that mints nothing is the shape of every mutation step in the benchmark — Select
// and Swap mint no families at all — and it is where a counter goes wrong in the direction that
// flatters us.
//
// ONE-SIDED, and the two cases above are what cover it: break-tested by making the increment count
// double, this case stayed GREEN while both of those went red with numbers. "Zero stayed zero" is
// equally true of a counter that never runs, so it is not a bound on its own.
test('a commit that mints no family reports a census of zero', () => {
  const surface = createSurface(1);
  const children = appendChildren(surface, CHILD_COUNT);
  surface.commit();
  readCommitProfile();

  // `Select`'s shape exactly: one prop written on a node that already stands. It CLONES, and a
  // clone is not a mint. A bare `surface.commit()` would not do — a commit with nothing pending
  // returns before it reaches the platform, and the case would hang rather than assert.
  setProp(children[0], 'nativeID', 'selected');
  surface.commit();

  expect(readCommitProfile().nodesCreated).toBe(0);
});

report();
