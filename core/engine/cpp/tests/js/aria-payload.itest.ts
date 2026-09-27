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

  // why: RULE ONE, and it holds for every scalar — the explicit prop WINS and the alias only fills
  // a hole. Getting this backwards would let a web-facing name silently override the platform one
  // an app deliberately wrote.
  //
  // TWO-SIDED on purpose. "The explicit value survived" is also true of a rule that never ran, so
  // the erasure is asserted beside it — break-tested by returning the bag unfolded, which leaves the
  // first line green and turns the second red. A one-sided oracle here would have been a case that
  // can only ever confirm.
  it('lets an explicit accessibility prop beat the alias', () => {
    const payload = commit({
      'aria-label': 'from aria',
      accessibilityLabel: 'explicit',
    });

    expect(payload.accessibilityLabel).toBe('explicit');
    expect(payload['aria-label']).toBe(undefined);
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

  // why: RULE TWO, and the POLARITY INVERTS inside a composite — here the ALIAS wins per field,
  // where every scalar above lets the explicit prop win. That is RN's own asymmetry and it is the
  // single most likely thing for a second implementation to get backwards.
  //
  // Field by field rather than `toEqual`: this harness compares with `JSON.stringify`, which is
  // sensitive to KEY ORDER, and the two implementations build the composite in different orders
  // while agreeing on every value. An order difference is not a defect and must not read as one.
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

  // why: the composite is REPLACED by a fresh object listing exactly the known fields, so a field
  // riding on the incoming object is DROPPED rather than forwarded. Faithful to RN, and the kind of
  // detail that survives one implementation and not the other.
  //
  // The `aria-busy` is LOAD-BEARING and is what this case taught: the whole fold is behind an
  // outer gate (`hasAriaAlias`), so a bag carrying only `accessibilityState` never reaches the rule
  // at all. Written without it, this case asserted the inner rule while never satisfying the outer
  // one — see the gate's own case below, which pins that behaviour rather than working around it.
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

  // why: THE OUTER GATE, which the case above discovered. `foldAriaProps` runs only when the bag
  // carries at least one aria key, so an `accessibilityState` written on its own reaches Fabric
  // EXACTLY as authored — unnormalised, invented fields included. Both implementations agree on
  // this (`hasAnyAriaKey` / `hasAriaAlias` guard each), so it is the contract rather than a gap,
  // and it is worth pinning because it is the surprising half: the composite rules do not apply to
  // a node that only uses RN's own spelling.
  it('leaves a composite alone on a node with no aria key at all', () => {
    const state = commit({
      accessibilityState: { disabled: true, invented: 'nonsense' },
    }).accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.disabled).toBe(true);
    expect(state.invented).toBe('nonsense');
    expect(state.busy).toBe(undefined);
  });

  // why: the rule COERCES NOTHING, and that matters because a template produces strings. Every
  // Svelte/Angular/Vue template spells `aria-checked="true"` as the STRING `'true'`, and what lands
  // in `accessibilityState.checked` is that string — which is not what RN's native side expects
  // (`boolean | 'mixed'`). Pinned rather than fixed: the decision to pass it through is the rule's,
  // and `adapters/svelte/src/aria-fold-parity.test.ts` pins the other half, that the template is
  // where the string is born. If someone adds coercion, one of the two fails and names the layer.
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

  // why: THE FOLD RUNS TWICE ON DEVICE under React, and this is the only place that can be seen.
  // React's surviving wrappers call `resolveAccessibilityProps` on the way in (pass 1, JS), and this
  // rule folds the same bag again on the way to Fabric (pass 2, C++). Pass 2 must be a no-op, or a
  // composite pass 1 built from an alias would be overwritten by the alias it already consumed.
  //
  // It holds by CONSTRUCTION rather than by care, which is the part worth recording: pass 1 blanks
  // its aliases to `undefined`, and `recordSetProp` erases a key written `undefined` instead of
  // storing a null — so a folded bag reaches this rule with the aliases genuinely ABSENT, and the
  // gate reports nothing to do. `coalesce` would survive a null anyway. Asserted because neither of
  // those two facts is local to this file, and either could change without anyone thinking of aria.
  //
  // `adapters/react/src/__tests__/` cannot test this: its harness runs no second pass at all, and
  // the file that claimed to was mounting a BARE tag, which has no wrapper to be pass 1.
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

  // why: THE CONTROL. A node with no aria key must come out with nothing invented — no empty
  // composite, no role. Without it every case above could be passing against a rule that runs
  // unconditionally and writes defaults, which is a different rule with the same green.
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
