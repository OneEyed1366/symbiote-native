// The bag fold, and specifically the axis that shipped broken: a primitive can commit under TWO
// spellings (`intrinsicWhen` — `text-input` / `text-input-multiline`), and a plan keyed on the base
// spelling alone leaves the other unfolded.
//
// That is not a hypothetical. TextInput and Switch committed a raw `id` for as long as a second
// spelling had no plan. No ViewConfig declares `id`, so Fabric drops it, the nativeID never reaches
// the view, and nothing is red anywhere — device-only, and invisible to every test that asserts on
// the props bag instead of the payload.
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

  // why: the end-to-end shape, on the payload rather than on the map. `id` is what the source
  // writes and `nativeID` is what the fold PRODUCES, so both halves are asserted — an expectation
  // naming only `nativeID` passes with the raw key left standing beside it.
  it.each(alternateTags)('%s folds id to nativeID', tag => {
    const folded = foldHostBag(tag, { id: 'pane' });
    expect(folded.nativeID).toBe('pane');
    expect('id' in folded).toBe(false);
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
