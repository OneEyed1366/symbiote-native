// The buffer's side tables, and the one thing they are FOR: saying a repeated thing once.

// why: a style object is the most repeated thing an app sends — StyleSheet.create, a resolved CSS
// class, a hoisted literal are all one object reused across every row, so a thousand rows push a
// thousand entries that are the same reference.

// That costs on the far side, not here: applyOps turns each entry into a folly::dynamic when
// applied, so a thousand identical references become a thousand JS -> folly::dynamic conversions,
// the largest single item on the path (raw-fabric-vs-engine.itest.ts measures it).

import { beforeEach, describe, expect, it } from 'vitest';

import {
  recordSetProp,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';

/** The buffer addresses nodes by object identity, so any object will do as a handle here. */
function handle(): object {
  return {};
}

describe('the mutation buffer interns the values it is handed', () => {
  beforeEach(() => {
    resetMutationBuffer();
  });

  // why: the case the interning exists for. One `StyleSheet.create` object across a thousand rows is
  // one thing, and the far side should be told it once.
  it('gives one entry to the same object sent from many nodes', () => {
    const style = { height: 44, flexDirection: 'row' };
    for (let at = 0; at < 4; at += 1) {
      recordSetProp(handle(), 'style', style);
    }

    const batch = takeBatch();
    expect(batch.values.length).toBe(1);
    expect(batch.values[0]).toBe(style);
  });

  // why: IDENTITY, not deep equality. Comparing structurally would make the buffer's cost depend on
  // the size of every value it is handed, which is the opposite of the point — and two equal objects
  // that a framework rebuilds per render are genuinely two values to anyone reading them later.
  it('gives two entries to two equal but distinct objects', () => {
    recordSetProp(handle(), 'style', { flex: 1 });
    recordSetProp(handle(), 'style', { flex: 1 });

    expect(takeBatch().values.length).toBe(2);
  });

  // why: string prop values repeat as hard as objects do — `ellipsizeMode: 'tail'` lands on every
  // text node on the screen — and each one is a JSI string read plus a `std::string` on the far side.
  it('gives one entry to a repeated string value', () => {
    for (let at = 0; at < 3; at += 1) {
      recordSetProp(handle(), 'ellipsizeMode', 'tail');
    }

    expect(takeBatch().values.length).toBe(1);
  });

  // why: a boolean prop repeats harder than any object — every text node seeds allowFontScaling.
  // Needs no Map: there are exactly two booleans, so a dedicated slot each is a branch, not a hash.
  it('gives one entry to each boolean, however often it repeats', () => {
    for (let at = 0; at < 4; at += 1) {
      recordSetProp(handle(), 'allowFontScaling', true);
      recordSetProp(handle(), 'collapsable', false);
    }

    const batch = takeBatch();
    expect(batch.values.length).toBe(2);
    expect(batch.values).toContain(true);
    expect(batch.values).toContain(false);
  });

  // why: numbers stay un-interned, a decision not an oversight. Map keys compare by SameValueZero
  // (folds -0 into 0, NaN into itself) — a semantics question not worth opening for the savings.
  it('leaves numbers alone', () => {
    recordSetProp(handle(), 'flex', 1);
    recordSetProp(handle(), 'flex', 1);

    expect(takeBatch().values.length).toBe(2);
  });

  // why: the ops have to keep naming the right entry. Interning that reused an index for a DIFFERENT
  // value would be silent and would land the wrong prop on the wrong node — so the mapping is
  // asserted, not just the table's length.
  it('points every op at the entry holding its own value', () => {
    const first = { flex: 1 };
    const second = { flex: 2 };
    recordSetProp(handle(), 'style', first);
    recordSetProp(handle(), 'style', second);
    recordSetProp(handle(), 'style', first);

    const batch = takeBatch();
    // The value index is the fourth field of a `setProp` op, and the ops are a flat Int32Array of
    // fixed-width records — so read the stride off the array rather than restating it.
    const stride = batch.ops.length / 3;
    const indices = [0, 1, 2].map(op => batch.ops[op * stride + 3]);
    expect(batch.values[indices[0]]).toBe(first);
    expect(batch.values[indices[1]]).toBe(second);
    expect(indices[2]).toBe(indices[0]);
  });

  // why: a slot is documented as meaningful only inside its own batch, and a value index is the same
  // kind of thing. An intern table that survived the drain would hand batch two an index into batch
  // one's array.
  it('forgets what it interned when the batch is drained', () => {
    const style = { flex: 1 };
    recordSetProp(handle(), 'style', style);
    takeBatch();

    recordSetProp(handle(), 'style', style);
    const second = takeBatch();
    expect(second.values.length).toBe(1);
    expect(second.values[0]).toBe(style);
  });

  // why: the boolean slots are two plain variables rather than an entry in a table that gets cleared,
  // so they are the one part of the intern state a drain can forget by omission. Forgotten, batch two
  // addresses batch one's array — a wrong value on a real node, silently.
  it('forgets the boolean slots too', () => {
    recordSetProp(handle(), 'allowFontScaling', true);
    takeBatch();

    recordSetProp(handle(), 'allowFontScaling', true);
    const second = takeBatch();
    expect(second.values).toEqual([true]);
  });
});
