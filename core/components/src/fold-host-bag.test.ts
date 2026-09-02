// The bag fold, and specifically the axis that shipped broken: a primitive commits under FOUR
// spellings at most — lowered, lowered-multiline, and a `-managed` twin of each — and a plan keyed
// on the lowered pair leaves the component path unfolded.
//
// That is not a hypothetical. TextInput and Switch committed a raw `id` on their wrapper path for as
// long as they had a `-managed` twin. No ViewConfig declares `id`, so Fabric drops it, the nativeID
// never reaches the view, and nothing is red anywhere — device-only, and invisible to every test
// that asserts on `node.props` instead of the payload.
import { describe, expect, it } from 'vitest';
import { COMPONENT_DESCRIPTORS } from './component-names/index.ios';
import { HOST_PRIMITIVES } from '../host-primitives.cjs';
import { FOLD_PLAN_BY_TAG, foldHostBag } from './fold-host-bag';

// Every `-managed` tag the platform table declares. Derived rather than listed: the two that exist
// today were both added long after this fold was written, so a hand-written pair would be one
// primitive behind for exactly as long as nobody noticed.
const managedTags = Object.keys(COMPONENT_DESCRIPTORS).filter(tag =>
  tag.endsWith('-managed'),
);

// The lowered spelling a `-managed` tag is the twin of. The fold plan must be the SAME object: two
// plans for one primitive is how the paths drift apart in the first place.
const loweredSpellingOf = (tag: string): string =>
  tag.slice(0, -'-managed'.length);

describe('foldHostBag covers the component path as well as the lowered one', () => {
  // why: the control. Every row below iterates `managedTags`, and an empty list iterates zero times
  // — the shape that reports agreement while measuring nothing. If the platform table stops
  // declaring the twins, or the suffix convention changes, this says so first.
  it('control: the platform table declares at least one managed twin', () => {
    expect(managedTags.length).toBeGreaterThan(0);
  });

  // why: THE assertion. A managed tag with no plan is a wrapper whose folds silently stop running.
  it.each(managedTags)('%s has a fold plan', tag => {
    expect(FOLD_PLAN_BY_TAG.get(tag)).toBeDefined();
  });

  // why: the same plan, not a second copy. Sharing the object is what makes a divergence between
  // the two paths unrepresentable rather than merely unlikely.
  it.each(managedTags)('%s shares its twin’s plan', tag => {
    expect(FOLD_PLAN_BY_TAG.get(tag)).toBe(
      FOLD_PLAN_BY_TAG.get(loweredSpellingOf(tag)),
    );
  });

  // why: the end-to-end shape, on the payload rather than on the map. `id` is what the source
  // writes and `nativeID` is what the fold PRODUCES, so both halves are asserted — an expectation
  // naming only `nativeID` passes with the raw key left standing beside it.
  it.each(managedTags)('%s folds id to nativeID', tag => {
    const folded = foldHostBag(tag, { id: 'pane' });
    expect(folded.nativeID).toBe('pane');
    expect('id' in folded).toBe(false);
  });
});

describe('the fold is safe to apply twice', () => {
  // why: covering both paths from one plan means a bag the wrapper already folded reaches the fold
  // again. Idempotence is what makes that a no-op — asserted, because a fold that is idempotent
  // only by accident is the next silent divergence.
  it.each(Object.keys(HOST_PRIMITIVES))(
    '%s: folding a folded bag changes nothing',
    name => {
      const tag = HOST_PRIMITIVES[name].intrinsic;
      const once = foldHostBag(tag, { id: 'pane', testID: 'probe' });
      expect(foldHostBag(tag, once)).toEqual(once);
    },
  );
});
