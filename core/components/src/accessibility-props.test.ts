// The aria/role -> accessibility* fold, tested at its own level for the first time.
//
// WHY THIS FILE DID NOT EXIST, AND WHY THAT WAS EXPENSIVE. Four adapters disclaim coverage of this
// fold by pointing at a shared test: `adapters/angular/.../safe-area-view.test.ts` says
// "resolveAccessibilityProps is exercised (and closed) by its own core/components test", and the
// React suites say the same in different words. There was no such test. What coverage existed was
// almost entirely Solid's, incidental to component tests, and every other adapter's assertions pass
// `accessibilityLabel` in its already-canonical form — so they never exercise the fold at all.
//
// That is the "shared infrastructure exercised elsewhere" shape where elsewhere is nowhere, and it
// matters here more than usual: the fold carries two rules that point in OPPOSITE directions (see
// the precedence blocks below), which is exactly the kind of thing a reimplementation gets wrong
// while every component test stays green.
import { describe, expect, it } from 'vitest';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from './accessibility-props';

// Widened on purpose. `resolveAccessibilityProps` is generic in its input, so it hands back the
// caller's own narrow literal type — correct for production, useless here, because every assertion
// reads an `accessibility*` key the input literal does not declare.
type IFoldable = IAccessibilityProps & IAriaProps;

function fold(props: IFoldable): IFoldable {
  return resolveAccessibilityProps(props);
}

describe('resolveAccessibilityProps: simple aliases', () => {
  it('folds aria-label onto accessibilityLabel and drops the alias', () => {
    const out = fold({ 'aria-label': 'Close' });

    expect(out.accessibilityLabel).toBe('Close');
    // The alias must not survive: `fabricProps` copies every unknown key verbatim (no ViewConfig
    // filter), so a surviving `aria-label` would ride to Fabric as a dead prop and be counted in
    // the payload.
    expect(out['aria-label']).toBeUndefined();
  });

  it('folds aria-modal onto accessibilityViewIsModal', () => {
    expect(fold({ 'aria-modal': true }).accessibilityViewIsModal).toBe(true);
  });

  it('returns the input UNTOUCHED when no alias is present', () => {
    const input = { accessibilityLabel: 'Close' };

    // Identity, not equality: the fold's gate is what keeps it off the hot path for the ~99% of
    // nodes carrying no aria key at all.
    expect(fold(input)).toBe(input);
  });
});

describe('resolveAccessibilityProps: transformed values', () => {
  it('maps a web role onto its RN spelling', () => {
    expect(fold({ role: 'heading' }).accessibilityRole).toBe('header');
    expect(fold({ role: 'img' }).accessibilityRole).toBe('image');
    expect(fold({ role: 'presentation' }).accessibilityRole).toBe('none');
    expect(fold({ role: 'slider' }).accessibilityRole).toBe('adjustable');
  });

  it('passes a role with no mapping straight through', () => {
    expect(fold({ role: 'button' }).accessibilityRole).toBe('button');
  });

  // COMMA, not whitespace — and this is the one that reads wrong to anyone who knows the HTML
  // attribute, where the separator is a space. Getting it "right" by web habit would break it.
  it('splits aria-labelledby on commas, not spaces', () => {
    expect(
      fold({ 'aria-labelledby': 'a, b ,c' }).accessibilityLabelledBy,
    ).toEqual(['a', 'b', 'c']);
    expect(
      fold({ 'aria-labelledby': 'one two' }).accessibilityLabelledBy,
    ).toEqual(['one two']);
  });

  it('renames aria-live "off" to "none" and leaves the others alone', () => {
    expect(fold({ 'aria-live': 'off' }).accessibilityLiveRegion).toBe('none');
    expect(fold({ 'aria-live': 'polite' }).accessibilityLiveRegion).toBe(
      'polite',
    );
  });
});

// One input, TWO outputs, and the second is conditional on the VALUE rather than on presence.
describe('resolveAccessibilityProps: aria-hidden fans out to two keys', () => {
  it('writes both keys when true', () => {
    const out = fold({ 'aria-hidden': true });

    expect(out.accessibilityElementsHidden).toBe(true);
    expect(out.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('writes only the first when false', () => {
    const out = fold({ 'aria-hidden': false });

    expect(out.accessibilityElementsHidden).toBe(false);
    expect(out.importantForAccessibility).toBeUndefined();
  });
});

// THE FIRST OF TWO OPPOSING RULES: for every scalar, the explicit prop wins and the alias only
// fills a hole.
describe('resolveAccessibilityProps: an explicit prop beats its alias', () => {
  it('keeps accessibilityLabel over aria-label', () => {
    const out = fold({ accessibilityLabel: 'explicit', 'aria-label': 'alias' });

    expect(out.accessibilityLabel).toBe('explicit');
  });

  it('keeps accessibilityRole over role', () => {
    const out = fold({ accessibilityRole: 'button', role: 'heading' });

    expect(out.accessibilityRole).toBe('button');
  });

  it('guards the two aria-hidden outputs independently', () => {
    const out = fold({
      'aria-hidden': true,
      importantForAccessibility: 'yes',
    });

    // The unguarded half still lands; only the explicitly-set half is preserved.
    expect(out.accessibilityElementsHidden).toBe(true);
    expect(out.importantForAccessibility).toBe('yes');
  });
});

// THE SECOND, OPPOSITE RULE, and the reason this file exists. Inside the composites the polarity
// INVERTS: the aria value wins per field (`ariaBusy ?? existingState?.busy`). One function, two
// contradictory precedence rules — copy the scalar rule into the composite "by analogy" and every
// component test stays green.
describe('resolveAccessibilityProps: inside a composite the ALIAS wins', () => {
  it('lets aria-checked override an existing accessibilityState field', () => {
    const out = fold({
      accessibilityState: { checked: false, busy: true },
      'aria-checked': true,
    });

    expect(out.accessibilityState?.checked).toBe(true);
    // A field with no alias keeps the existing value.
    expect(out.accessibilityState?.busy).toBe(true);
  });

  it('lets aria-valuenow override an existing accessibilityValue field', () => {
    const out = fold({
      accessibilityValue: { now: 1, max: 10 },
      'aria-valuenow': 7,
    });

    expect(out.accessibilityValue?.now).toBe(7);
    expect(out.accessibilityValue?.max).toBe(10);
  });

  it('builds the composite from aliases alone', () => {
    const out = fold({ 'aria-busy': true, 'aria-disabled': false });

    expect(out.accessibilityState).toEqual({
      busy: true,
      checked: undefined,
      disabled: false,
      expanded: undefined,
      selected: undefined,
    });
  });

  // The composite is REPLACED by a fresh literal listing exactly the known fields, so anything else
  // riding on the incoming object is lost. Worth pinning: it is a silent data drop, and the shape
  // of bug that only shows up for whoever passes a field RN adds later.
  it('drops an unknown field on an incoming accessibilityState', () => {
    const out = fold({
      accessibilityState: { checked: true, invented: 'x' },
      'aria-busy': true,
    });

    expect(out.accessibilityState).not.toHaveProperty('invented');
    expect(out.accessibilityState?.checked).toBe(true);
  });

  it('leaves the composite absent when neither an alias nor the prop is present', () => {
    const out = fold({ 'aria-label': 'x' });

    expect(out.accessibilityState).toBeUndefined();
    expect(out.accessibilityValue).toBeUndefined();
  });
});

describe('resolveAccessibilityProps: idempotence', () => {
  // Load-bearing for any future move of this fold into a lower layer: if it runs in the engine AND
  // an adapter still calls it, the second pass must be a no-op. It is, because pass 1 blanks every
  // alias and the gate then reports nothing to do.
  it('a second pass changes nothing and returns by identity', () => {
    const once = fold({
      role: 'heading',
      'aria-label': 'Close',
      'aria-labelledby': 'a,b',
      'aria-hidden': true,
      'aria-busy': true,
      'aria-valuenow': 3,
    });
    const twice = fold(once);

    expect(twice).toBe(once);
  });

  it('blanks every alias it consumes', () => {
    const out = fold({
      role: 'button',
      'aria-label': 'a',
      'aria-labelledby': 'b',
      'aria-live': 'polite',
      'aria-hidden': true,
      'aria-busy': true,
      'aria-checked': true,
      'aria-disabled': true,
      'aria-expanded': true,
      'aria-selected': true,
      'aria-modal': true,
      'aria-valuemax': 1,
      'aria-valuemin': 0,
      'aria-valuenow': 1,
      'aria-valuetext': 't',
    });

    // Present-but-undefined is fine — `setProp` and `fabricProps` both treat that as absent. What
    // must not survive is a VALUE. Read through a Record view rather than a cast: the keys are
    // dynamic, so there is no key type to narrow to.
    const bag: Record<string, unknown> = { ...out };
    for (const key of Object.keys(bag)) {
      if (key !== 'role' && !key.startsWith('aria-')) continue;
      expect(bag[key], `${key} still carries a value`).toBeUndefined();
    }
  });
});
