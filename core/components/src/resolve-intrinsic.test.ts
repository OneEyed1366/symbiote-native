// The runtime half of `intrinsicWhen`: which native view a primitive commits, decided from the
// props it is created with rather than from source text.
//
// Until this existed only the lowering transforms read the field, so the choice was a COMPILE-time
// one and `dynamicIntrinsicChoice` had to be a refusal category — a transform seeing
// `multiline={isLong}` cannot know the value. A public primitive tag has no transform in front of
// it on three adapters, so the choice moves here, where the value is known.
import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '../host-primitives.cjs';
import { resolveIntrinsicTag } from './resolve-intrinsic';

const BASE = 'symbiote-text-input';
const MULTILINE = 'symbiote-text-input-multiline';

describe('resolveIntrinsicTag', () => {
  // why: every assertion below is about TextInput, and TextInput's spec entry has been WITHHELD
  // before (its behavior was unregistered). With the entry absent this whole file would report
  // "resolves to the base tag" on every row — the true answer for a primitive that declares no
  // alternative, and a false green for the rule under test. This control fails first and says so.
  it('control: the spec still declares an alternative for TextInput', () => {
    const entry = HOST_PRIMITIVES.TextInput;
    expect(entry, 'TextInput is in HOST_PRIMITIVES').toBeDefined();
    expect(
      entry?.intrinsicWhen,
      'TextInput declares intrinsicWhen; without it every row below is vacuous',
    ).toEqual({ prop: 'multiline', intrinsic: MULTILINE });
  });

  describe('Positive', () => {
    // why: the whole point — a runtime value selects the native view, which no transform could do.
    it('picks the alternative when the deciding prop is true', () => {
      expect(resolveIntrinsicTag(BASE, { multiline: true })).toBe(MULTILINE);
    });

    // why: an absent prop must keep the base view, or every plain input becomes a textarea.
    it('keeps the base tag when the prop is absent', () => {
      expect(resolveIntrinsicTag(BASE, { value: 'x' })).toBe(BASE);
    });

    // why: a template-driven adapter can deliver the prop as an ATTRIBUTE STRING (Angular's
    // `multiline="true"` rather than `[multiline]="true"`), and that must select the same view.
    it('accepts the string form of true', () => {
      expect(resolveIntrinsicTag(BASE, { multiline: 'true' })).toBe(MULTILINE);
    });

    // why: a primitive with no alternative must pass through by identity, so a renderer can call
    // this unconditionally on every element without branching per tag.
    it('is identity for a primitive that declares no alternative', () => {
      expect(resolveIntrinsicTag('symbiote-view', { multiline: true })).toBe(
        'symbiote-view',
      );
      expect(resolveIntrinsicTag('symbiote-text', undefined)).toBe(
        'symbiote-text',
      );
    });

    // why: a renderer may hand this a Fabric name or a third-party tag it knows nothing about.
    it('is identity for an unknown tag', () => {
      expect(resolveIntrinsicTag('RCTView', { multiline: true })).toBe(
        'RCTView',
      );
    });
  });

  describe('Negative', () => {
    // why: THE discriminating case for the string form. A truthy check would read `"false"` — a
    // non-empty string — as multiline and commit the wrong native view, uncorrectable by any later
    // prop write. Every Positive row above passes under a truthy implementation; only this fails.
    it('does not treat the string "false" as true', () => {
      expect(resolveIntrinsicTag(BASE, { multiline: 'false' })).toBe(BASE);
    });

    // why: a tag that is ALREADY the alternative arrives from a transform that made the choice
    // itself. Re-resolving it against props that may not carry `multiline` would send a multiline
    // input back to the single-line view — the wrong native view, silently.
    it('never re-resolves a tag that is already the alternative', () => {
      expect(resolveIntrinsicTag(MULTILINE, {})).toBe(MULTILINE);
      expect(resolveIntrinsicTag(MULTILINE, { multiline: false })).toBe(
        MULTILINE,
      );
    });

    // why: props are optional at the call site, and an undefined bag must not throw on a primitive
    // that DOES declare an alternative — that is the one path where the lookup succeeds.
    it('tolerates undefined props on a primitive that has an alternative', () => {
      expect(resolveIntrinsicTag(BASE, undefined)).toBe(BASE);
    });
  });
});
