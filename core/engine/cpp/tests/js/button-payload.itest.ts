// Button's PLATFORM half, in the engine — and the split is sharper here than in any port so far,
// because this tag's fold is genuinely half rule and half composition.
//
// WHAT MOVED, every one of them a function of the tag and of nothing else (`Button.js:350-382`):
//
//   accessibilityRole            pinned to 'button', unconditionally (`:372`)
//   importantForAccessibility    'no' becomes 'no-hide-descendants' (`:357-361`), so the label
//                                inside cannot take focus separately from the button
//   touchSoundDisabled           re-spelled `android_disableSound` (`:377`, handed to the touchable)
//   color                        stripped — read by the derived folds, declared by no ViewConfig
//
// WHAT STAYED IN JS, and why it is not an oversight:
//
//   focusable                    its middle leg is `onPress !== undefined`, an OWNED listener, so
//                                it lives in the stash and no props-only rule can see it
//   the Android view style       `resolveButtonViewStyle(color, disabled)` is a style computation
//                                over a theme, not a prop rewrite
//   the label and text folds     they hang on DERIVED nodes — a raw text carries no tag at all, so
//                                there is nothing for a tag-keyed rule to key on
//
// A STRIP IS THE ONE THING THAT CANNOT BE CHECKED BY LOOKING AT THE SCREEN. Fabric drops a key no
// ViewConfig declares without throwing, logging or painting differently, so `color` and
// `touchSoundDisabled` reaching native is invisible everywhere except here.
//
// THE ORDER IS LOAD-BEARING and is the trap this port had to avoid: the engine's rules run BEFORE
// the behavior's JS fold, and the pressable rule already erases `disabled` from the bag. Button's
// JS fold reads `disabled` and `color` off the NODE for exactly that reason — so stripping `color`
// here is safe, while stripping it one layer up would take the derived folds' input with it.

import { registerButtonBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerButtonBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// A narrowing, not a defensive check: a committed composite arrives as `unknown`.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function commit(props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, 'button');
  setProp(node, 'title', 'Save');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

describe('what a button sends native', () => {
  // why: `accessibilityRole="button"` is spelled as a literal on the element (`Button.js:372`) —
  // it is not forwarded from the app and there is no way to opt out. A screen reader that reads a
  // button as a plain view is the same silent hole Switch's missing role was.
  it('pins the accessibility role to button', () => {
    expect(commit({}).payload.accessibilityRole).toBe('button');
    expect(
      commit({ accessibilityRole: 'link' }).payload.accessibilityRole,
    ).toBe('button');
  });

  // why: `'no'` is the ONLY value that moves, and it moves because the label lives INSIDE the
  // button — left as plain 'no' the text would still be reachable on its own, which is the bug
  // `no-hide-descendants` exists to prevent. Every other value passes through untouched.
  it('turns importantForAccessibility no into no-hide-descendants', () => {
    expect(
      commit({ importantForAccessibility: 'no' }).payload
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
    expect(
      commit({ importantForAccessibility: 'yes' }).payload
        .importantForAccessibility,
    ).toBe('yes');
  });

  // why: RN hands `touchSoundDisabled` to the touchable, which spells it `android_disableSound` on
  // the view. The raw name must not ALSO reach Fabric — it is declared by no ViewConfig, so it is
  // dropped in silence and the rename would look like it worked.
  it('re-spells touchSoundDisabled and drops the raw name', () => {
    const payload = commit({ touchSoundDisabled: true }).payload;
    expect(payload.android_disableSound).toBe(true);
    expect(payload.touchSoundDisabled).toBe(undefined);
  });

  // `accessibilityLabel={ariaLabel || accessibilityLabel}` (`Button.js:343`), `||` not `??`
  it('falls back to accessibilityLabel for an empty aria-label', () => {
    const payload = commit({
      'aria-label': '',
      accessibilityLabel: 'Save now',
    }).payload;

    expect(payload.accessibilityLabel).toBe('Save now');
    expect(commit({ 'aria-label': 'Aria' }).payload.accessibilityLabel).toBe(
      'Aria',
    );
  });

  // why: `color` is Button's own prop — it tints the LABEL on iOS and the view on Android — and is
  // consumed entirely by the derived folds. On the host node it is a key native does not know.
  it('keeps color off the host payload', () => {
    expect(commit({ color: '#ff0000' }).payload.color).toBe(undefined);
  });

  // The strip erases `color` from the payload only, the derived folds read it off the node
  it('still tints the label from the color it stripped', () => {
    const payload = commit({ color: '#ff0000' }).payload;
    expect(payload.accessibilityRole).toBe('button');
    expect(payload.color).toBe(undefined);
  });

  // Off Android no node of the button binds a `payloadFold`, so a commit makes no trip into JS
  it('costs no trip into JS at all', () => {
    const one = commit({});
    print(`DEBUG button folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

// Button's `focusable` — the last thing its OWNER fold did off Android, and the case that needs a
// different fixture from every one above.
//
// THE EXPRESSION IS THE TOUCHABLE'S (`TouchableOpacity.js:336-339`, `TouchableNativeFeedback.js:369`
// — the same on both platforms), but the `disabled` it reads is BUTTON'S, and that is the whole
// difficulty. RN's Button resolves it three ways, `props.disabled ?? aria-disabled ??
// accessibilityState.disabled` (`Button.js:331,337`), where a plain touchable reads one prop. So
// `usesTouchableFocusableRule` deliberately excludes `button`: the touchable rule writes the
// one-leg answer and Button's own rule layers the three-leg one over it, which is the order the JS
// composition always had.
//
// `routeProp`, NOT this file's `setProp` helper, and it is load-bearing here for the first time:
// `onPress` is an OWNED name, so it reaches the engine only through the event routing that lives in
// `routeProp`. Written with `setProp` it lands in the props bag as a FUNCTION, no listener is ever
// stashed, no `OP_SET_OWNED_LISTENER` crosses, and every case below would read `focusable: false`
// for the right-looking wrong reason.
function focusableOf(
  props: Record<string, unknown>,
  onPress?: () => void,
): boolean | undefined {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, 'button');
  routeProp(node, 'title', 'Save');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  if (onPress !== undefined) routeProp(node, 'onPress', onPress);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the button committed nothing');
  const focusable = payload.focusable;
  if (typeof focusable !== 'boolean' && focusable !== undefined)
    throw new Error('focusable committed as something other than a boolean');
  return focusable;
}

const noop = (): void => {};

describe('whether a button is a focus stop', () => {
  // A button with a handler is reachable by keyboard and remote, without one it is decoration
  it('is focusable with a handler and not without one', () => {
    expect(focusableOf({}, noop)).toBe(true);
    expect(focusableOf({})).toBe(false);
  });

  // A disabled button is skipped by a screen reader
  it('is not focusable while disabled', () => {
    expect(focusableOf({ disabled: true }, noop)).toBe(false);
  });

  // `aria-disabled` alone disables a button, a touchable rule reading only `disabled` misses it
  it('lets aria-disabled alone take it out of the focus order', () => {
    expect(focusableOf({ 'aria-disabled': true }, noop)).toBe(false);
  });

  // Two rules compose here (aria fold, pressable), so only this fixture sees both
  // The other `accessibilityState` fields must survive the `disabled` rewrite
  it('merges aria-disabled into an authored accessibilityState, keeping its other fields', () => {
    const state = commit({
      accessibilityState: { busy: true },
      'aria-disabled': true,
    }).payload.accessibilityState;
    if (!isRecord(state)) throw new Error('no accessibilityState committed');

    expect(state.busy).toBe(true);
    expect(state.disabled).toBe(true);
  });

  it('lets an authored accessibilityState.disabled do the same', () => {
    expect(focusableOf({ accessibilityState: { disabled: true } }, noop)).toBe(
      false,
    );
  });

  // `??` not `||`: an explicit `disabled: false` beats `aria-disabled`
  it('lets an explicit disabled false beat aria-disabled', () => {
    expect(focusableOf({ disabled: false, 'aria-disabled': true }, noop)).toBe(
      true,
    );
  });

  // The `disabled` prop overrides `accessibilityState.disabled` both ways and rewrites the state
  // the button reports
  it('lets the disabled prop override accessibilityState.disabled, both ways', () => {
    const enabled = commit({
      disabled: false,
      accessibilityState: { disabled: true },
    }).payload.accessibilityState;
    const disabled = commit({
      disabled: true,
      accessibilityState: { disabled: false },
    }).payload.accessibilityState;

    expect(isRecord(enabled) && enabled.disabled).toBe(false);
    expect(isRecord(disabled) && disabled.disabled).toBe(true);
    expect(
      focusableOf(
        { disabled: false, accessibilityState: { disabled: true } },
        noop,
      ),
    ).toBe(true);
    expect(
      focusableOf(
        { disabled: true, accessibilityState: { disabled: false } },
        noop,
      ),
    ).toBe(false);
  });

  // An explicit opt-out of focus cannot be overridden by a handler (`&&`)
  it('honours an explicit focusable false', () => {
    expect(focusableOf({ focusable: false }, noop)).toBe(false);
  });

  // A rule keyed on a listener has to survive the handler arriving after mount
  it('becomes a focus stop when the handler arrives late', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView', false, 'button');
    routeProp(node, 'title', 'Save');
    surface.appendChild(node);
    surface.commit();
    mounted();
    expect(committedPayloadOf(node)?.focusable).toBe(false);

    routeProp(node, 'onPress', noop);
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.focusable).toBe(true);
  });
});

report();
