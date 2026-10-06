// The W3C aria spelling resolved into RN's own, read off the payload a commit actually SENT.
//
// WHY THIS FILE EXISTS, and it is the gap rather than the rule that is new. `foldAriaProps` is
// written twice — `core/engine/src/accessibility-props.ts` and `SymbioteFabricProps.cpp` — and an
// assertion against only the FIRST one, in vitest. The device copy could
// have broken with the whole suite green. That is not a hypothetical: the same shape had just been
// found on `foldTextInputValue`, whose `defaultValue` leg appeared in no itest at all, and before
// that on a disabled `touchable-highlight` that shipped `focusable: true` for as long as it did.
//
// THE TWIN IS NOT A MIRROR TO DELETE, which is what separates this from the Text defaults. The JS
// copy has a real runtime caller that is not the payload builder: `resolveAccessibilityProps` in
// `core/components`, which component bodies use to fold a bag BEFORE handing it on (Svelte's
// virtualized-list is one). So both copies run, on different paths, and what this file adds is the
// assertion that the one nothing could see behaves like the one everything could.
//
// THE GATE IS RECOMPUTED HERE, not carried. `ISymbioteNode.hasAriaAlias` is a JS-side memo and the
// C++ asks `hasAriaAlias(props)` itself, so these cases can write with a plain `setProp` and still
// reach the rule.

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// A narrowing, not a defensive check: a committed composite arrives as `unknown` and the cases
// below read fields off it.
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

describe('the aria spelling, resolved by the engine', () => {
  // why: the plain alias, and the ERASURE beside it. `aria-label` is not a Fabric prop, so a
  // surviving key rides to native as dead weight under a name no ViewConfig declares.
  it('folds aria-label onto accessibilityLabel and drops the alias', () => {
    const payload = commit({ 'aria-label': 'Save' });

    expect(payload.accessibilityLabel).toBe('Save');
    expect(payload['aria-label']).toBe(undefined);
  });

  // `View.js` assigns the alias over the spread explicit prop, so it wins for every scalar
  // The erasure is asserted beside it, a bag returned unfolded would leave the winner line red too
  it('lets the alias beat an explicit accessibility prop', () => {
    const payload = commit({
      'aria-label': 'from aria',
      accessibilityLabel: 'explicit',
    });

    expect(payload.accessibilityLabel).toBe('from aria');
    expect(payload['aria-label']).toBe(undefined);
  });

  it('lets role beat an explicit accessibilityRole', () => {
    expect(
      commit({ role: 'heading', accessibilityRole: 'button' })
        .accessibilityRole,
    ).toBe('header');
  });

  it('lets aria-hidden beat both explicit hide flags', () => {
    const payload = commit({
      'aria-hidden': true,
      accessibilityElementsHidden: false,
      importantForAccessibility: 'yes',
    });

    expect(payload.accessibilityElementsHidden).toBe(true);
    expect(payload.importantForAccessibility).toBe('no-hide-descendants');
  });

  // why: `aria-labelledby` is a STRING of ids in the W3C spelling and an ARRAY in RN's. A rule that
  // forwarded the string would hand Fabric a type its ViewConfig refuses.
  it('splits aria-labelledby into the array RN expects', () => {
    expect(
      commit({ 'aria-labelledby': 'a, b ,c' }).accessibilityLabelledBy,
    ).toEqual(['a', 'b', 'c']);
  });

  // why: the ONE value that is not a passthrough — W3C's `off` is RN's `none`, and every other
  // token carries over unchanged.
  it('renames only the off token of aria-live', () => {
    expect(commit({ 'aria-live': 'off' }).accessibilityLiveRegion).toBe('none');
    expect(commit({ 'aria-live': 'polite' }).accessibilityLiveRegion).toBe(
      'polite',
    );
  });

  // why: ONE input, TWO outputs, and the second is conditional on the VALUE rather than on
  // presence. A rule that emitted both on any `aria-hidden` would hide the descendants of a node
  // whose author wrote `aria-hidden={false}`.
  it('derives both hidden props from aria-hidden, the second only when true', () => {
    const hidden = commit({ 'aria-hidden': true });
    expect(hidden.accessibilityElementsHidden).toBe(true);
    expect(hidden.importantForAccessibility).toBe('no-hide-descendants');

    const shown = commit({ 'aria-hidden': false });
    expect(shown.accessibilityElementsHidden).toBe(false);
    expect(shown.importantForAccessibility).toBe(undefined);
  });

  // why: the role table is W3C's vocabulary mapped onto RN's, and the two disagree on the names
  // that matter (`heading` -> `header`, `img` -> `image`). An unmapped role is passed through as
  // itself rather than dropped, which is what lets a future RN role work before the table knows it.
  it('maps a role through RN’s table and passes an unmapped one through', () => {
    expect(commit({ role: 'heading' }).accessibilityRole).toBe('header');
    expect(commit({ role: 'img' }).accessibilityRole).toBe('image');
    expect(commit({ role: 'button' }).accessibilityRole).toBe('button');
    expect(commit({ role: 'summary' }).accessibilityRole).toBe('summary');
  });

  // Inside a composite the alias wins per field, read field by field since this harness compares
  // with `JSON.stringify` and the two implementations build the composite in different key orders
  it('lets the alias win per field inside accessibilityState', () => {
    const state = commit({
      'aria-disabled': true,
      accessibilityState: { disabled: false, busy: true },
    }).accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.disabled).toBe(true);
    expect(state.busy).toBe(true);
    expect(state.checked).toBe(null);
  });

  // The composite is rebuilt from the known fields only, so an unknown one is dropped
  // `aria-busy` is needed to pass the outer gate, see the next case
  it('replaces the state composite rather than merging into it', () => {
    const state = commit({
      'aria-busy': false,
      accessibilityState: { disabled: true, invented: 'nonsense' },
    }).accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.disabled).toBe(true);
    expect(state.invented).toBe(undefined);
    expect(state.busy).toBe(false);
  });

  // The fold runs only when the bag carries an aria key, so a lone `accessibilityState` is sent
  // as authored. Both implementations gate the same way
  it('leaves a composite alone on a node with no aria key at all', () => {
    const state = commit({
      accessibilityState: { disabled: true, invented: 'nonsense' },
    }).accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.disabled).toBe(true);
    expect(state.invented).toBe('nonsense');
    expect(state.busy).toBe(undefined);
  });

  // Nothing is coerced: a template's `aria-checked="true"` arrives as the string, as in RN
  // The svelte parity test pins where the string is born
  it('coerces nothing, so a template’s string arrives as a string', () => {
    const state = commit({ 'aria-checked': 'true' }).accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.checked).toBe('true');
  });

  // why: the value composite is the same shape as the state one, four fields instead of five. It is
  // asserted separately because a rule can easily have one of the two and not the other.
  it('composes accessibilityValue from its four aliases', () => {
    const value = commit({
      'aria-valuemin': 0,
      'aria-valuemax': 10,
      'aria-valuenow': 4,
      'aria-valuetext': 'four',
    }).accessibilityValue;
    if (!isRecord(value)) throw new Error('no accessibilityValue committed');

    expect(value.min).toBe(0);
    expect(value.max).toBe(10);
    expect(value.now).toBe(4);
    expect(value.text).toBe('four');
  });

  // React folds in JS first and this rule folds again, so pass 2 must be a no-op
  // Pass 1 blanks the aliases and `recordSetProp` erases an undefined key, so the gate sees none
  it('leaves an already-folded bag alone, which is what makes React’s second pass safe', () => {
    const payload = commit({
      accessibilityRole: 'button',
      accessibilityLabel: 'close',
      accessibilityState: { checked: true, busy: true },
    });

    expect(payload.accessibilityRole).toBe('button');
    expect(payload.accessibilityLabel).toBe('close');
    const state = payload.accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');
    expect(state.checked).toBe(true);
    expect(state.busy).toBe(true);
  });

  // The control: no aria key in, no composite or role out
  it('invents nothing on a node that authored no aria key', () => {
    const payload = commit({ testID: 'plain' });

    expect(payload.accessibilityState).toBe(undefined);
    expect(payload.accessibilityValue).toBe(undefined);
    expect(payload.accessibilityRole).toBe(undefined);
    expect(payload.accessibilityLabel).toBe(undefined);
    expect(payload.testID).toBe('plain');
  });
});

report();
