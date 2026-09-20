// The aria fold is written TWICE and neither copy can be deleted — so this holds them in step.
//
// WHY THERE ARE TWO. The device's rule is `foldAriaProps` in `SymbioteFabricProps.cpp`: it resolves
// the W3C spelling into RN's own on the way to Fabric, for every node, with no adapter involved.
// The JS copy (`core/engine/src/accessibility-props.ts`, typed as `resolveAccessibilityProps` in
// `core/components`) is reached by ~15 component bodies, and one of them settles the question:
//
//   packages/slider/src/core/slider-state.ts
//     resolveSliderDisabled(disabled, accessibilityState) -> accessibilityState?.disabled === true
//
// `<Slider aria-disabled>` must disable the slider's GESTURE MACHINE, and that decision is made in
// JS, before any commit. A component whose machine branches on the folded value needs the folded
// value in JS — it cannot wait for the payload. That is the browser's arrangement too: a page can
// ask for an element's computed accessible state, and asking is not the same as reimplementing.
//
// SO THE MIRROR IS LOAD-BEARING, and the rule this project applies to one it cannot remove is to
// make it LOUD (`CLAUDE.md`, "A mirror that cannot be removed is made LOUD"). Until now nothing
// compared the two: every assertion about the fold ran against ONE copy, on its own side, and the
// pair could have drifted a key at a time with every suite green.
//
// This file is the only place the comparison is possible, because the itest harness sees both in
// one process — the JS function by import, the C++ rule through a real committed payload.
//
// WHAT IT DELIBERATELY DOES NOT ASSERT: that the two spell "no value" identically inside a
// composite. They do not, and it is not a defect — see the note on `sameValue` below.

import { foldAriaProps } from '@symbiote-native/engine';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function commit(props: Record<string, unknown>): Record<string, unknown> {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView', false, 'view');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the view committed no payload');
  return { ...payload };
}

// `undefined` and `null` are ONE answer here, and saying why is the point of the helper.
//
// Both implementations build a composite by listing every known field, so a field nobody set is
// PRESENT with no value — and each spells that in its own language: JS writes `undefined`, C++
// writes a `folly::dynamic` null. Every consumer of either reads it the same way
// (`state?.disabled === true`, `coalesce`), so the spelling is invisible where it is used, and
// forcing them to agree would mean making one side lie about its own types.
//
// What must agree is every field that HAS a value. That is what this compares.
function sameValue(left: unknown, right: unknown): boolean {
  const leftEmpty = left === undefined || left === null;
  const rightEmpty = right === undefined || right === null;
  if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty;
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) if (!sameValue(left[key], right[key])) return false;
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, at) => sameValue(entry, right[at]))
    );
  }
  return Object.is(left, right);
}

// Every shape the rule has a branch for. A bag that exercises no branch would pass against two
// broken copies, so each row is here because some line of the rule only runs for it.
const BAGS: readonly Record<string, unknown>[] = [
  { 'aria-label': 'Save' },
  { 'aria-label': 'from aria', accessibilityLabel: 'explicit' },
  { 'aria-labelledby': 'a, b ,c' },
  { 'aria-live': 'off' },
  { 'aria-live': 'polite' },
  { 'aria-hidden': true },
  { 'aria-hidden': false },
  { 'aria-modal': true },
  { role: 'heading' },
  { role: 'img' },
  { role: 'summary' },
  { role: 'button', accessibilityRole: 'link' },
  {
    'aria-disabled': true,
    accessibilityState: { disabled: false, busy: true },
  },
  { 'aria-busy': false, accessibilityState: { disabled: true } },
  { 'aria-checked': 'true' },
  {
    'aria-valuemin': 0,
    'aria-valuemax': 10,
    'aria-valuenow': 4,
    'aria-valuetext': 'four',
  },
  { accessibilityValue: { now: 1 }, 'aria-valuenow': 2 },
];

describe('the two aria folds agree, key for key', () => {
  // why: THE GUARD. For each bag the JS fold is computed directly and the same bag is committed
  // through the C++ rule; every key either produces must match the other. A key one side invents,
  // renames or stops producing fails here and nowhere else.
  it('produces the same accessibility keys on both sides', () => {
    for (const bag of BAGS) {
      const inJs = foldAriaProps({ ...bag });
      const inCpp = commit({ ...bag });
      const label = JSON.stringify(bag);

      const keys = new Set([...Object.keys(inJs), ...Object.keys(inCpp)]);
      for (const key of keys) {
        if (!sameValue(inJs[key], inCpp[key])) {
          print(
            `DEBUG mismatch ${key}: js=${JSON.stringify(inJs[key])} cpp=${JSON.stringify(inCpp[key])}`,
          );
        }
        expect(sameValue(inJs[key], inCpp[key]), `${label} @ ${key}`).toBe(
          true,
        );
      }
    }
  });

  // why: THE ANTI-DEGENERACY ARM, and without it the case above is satisfiable by two copies that
  // both do nothing. It asserts the comparison has something to compare: the folds really do
  // produce canonical keys, and really do consume the aliases.
  it('is comparing a fold that ran, on both sides', () => {
    const inJs = foldAriaProps({ 'aria-label': 'Save', role: 'heading' });
    const inCpp = commit({ 'aria-label': 'Save', role: 'heading' });

    expect(inJs.accessibilityLabel).toBe('Save');
    expect(inCpp.accessibilityLabel).toBe('Save');
    expect(inJs.accessibilityRole).toBe('header');
    expect(inCpp.accessibilityRole).toBe('header');
    // Consumed, not merely accompanied — on both sides. JS blanks the alias to `undefined` and C++
    // erases the key, which `sameValue` treats as one answer.
    expect(inJs['aria-label']).toBe(undefined);
    expect(inCpp['aria-label']).toBe(undefined);
  });
});

report();
