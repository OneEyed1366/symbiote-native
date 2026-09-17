// The bag fold, and specifically the axis that shipped broken: a primitive can commit under TWO
// spellings (`intrinsicWhen` — `text-input` / `text-input-multiline`), and a plan keyed on the base
// spelling alone leaves the other unfolded.
//
// That is not a hypothetical. TextInput and Switch committed a raw `id` for as long as a second
// spelling had no plan. No ViewConfig declares `id`, so Fabric drops it, the nativeID never reaches
// the view, and nothing is red anywhere — device-only, and invisible to every test that asserts on
// the props bag instead of the payload.
//
// THAT PARTICULAR BUG CAN NO LONGER HAPPEN, and the file is kept for the axis rather than for it:
// `id` is renamed by `routeProp` on the way in now, for every node, so it does not depend on this
// table naming a spelling. The next default this table grows still does.
import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '../host-primitives.cjs';
import { FOLD_PLAN_BY_TAG, foldHostBag } from './fold-host-bag';

// Every alternate spelling the spec declares. Derived rather than listed: a primitive that grows an
// `intrinsicWhen` later joins this by existing.
const alternateTags = Object.values(HOST_PRIMITIVES)
  .map(primitive => primitive.intrinsicWhen)
  .filter(when => when !== undefined)
  .map(when => when.intrinsic);

describe('foldHostBag covers every spelling a primitive commits under', () => {
  // why: the control. Every row below iterates `alternateTags`, and an empty list iterates zero
  // times — the shape that reports agreement while measuring nothing.
  it('control: the spec declares at least one alternate spelling', () => {
    expect(alternateTags.length).toBeGreaterThan(0);
  });

  // why: THE assertion. An alternate spelling with no plan is a tag whose folds silently stop.
  it.each(alternateTags)('%s has a fold plan', tag => {
    expect(FOLD_PLAN_BY_TAG.get(tag)).toBeDefined();
  });

  // why: and it is the SAME plan, not merely a plan. The bug this file exists for was an alternate
  // spelling folding LESS than its base one, which a presence check cannot see: a plan built from
  // an empty entry is defined and folds nothing.
  //
  // The probe used to be `id` -> `nativeID`, the one alias every entry carried, asserted through
  // `foldHostBag` end to end. That rename is `routeProp`'s since 2026-09-18 and this function no
  // longer performs it — and no alternate spelling declares a DEFAULT, so an end-to-end probe would
  // now iterate an empty list and report agreement while measuring nothing. Identity is the claim
  // that survives an entry with nothing in it.
  it.each(alternateTags)("%s shares its base spelling's plan", tag => {
    const owner = Object.values(HOST_PRIMITIVES).find(
      primitive => primitive.intrinsicWhen?.intrinsic === tag,
    );
    if (owner === undefined) throw new Error(`no primitive declares ${tag}`);

    expect(FOLD_PLAN_BY_TAG.get(tag)).toBe(
      FOLD_PLAN_BY_TAG.get(owner.intrinsic),
    );
  });
});

describe('the fold is safe to apply twice', () => {
  // why: a re-render writes the same bag back, so an already-folded bag reaches the fold again.
  // Idempotence is what makes that a no-op — asserted, because a fold that is idempotent only by
  // accident is the next silent divergence.
  it.each(Object.keys(HOST_PRIMITIVES))(
    '%s: folding a folded bag changes nothing',
    name => {
      const tag = HOST_PRIMITIVES[name].intrinsic;
      const once = foldHostBag(tag, { id: 'pane', testID: 'probe' });
      expect(foldHostBag(tag, once)).toEqual(once);
    },
  );
});
