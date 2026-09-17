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

  // why: `color` is Button's own prop — it tints the LABEL on iOS and the view on Android — and is
  // consumed entirely by the derived folds. On the host node it is a key native does not know.
  it('keeps color off the host payload', () => {
    expect(commit({ color: '#ff0000' }).payload.color).toBe(undefined);
  });

  // why: THE CONTROL for that strip, and the reason it is worth a case of its own. The engine's
  // rule erases `color` from the PAYLOAD; the derived folds read it off the NODE. If a future change
  // made the strip mutate the node's props instead, the label would silently lose its tint while
  // every assertion above still passed.
  it('still tints the label from the color it stripped', () => {
    const payload = commit({ color: '#ff0000' }).payload;
    expect(payload.accessibilityRole).toBe('button');
    expect(payload.color).toBe(undefined);
  });

  // why: THE PRICE, and it has read 4, then 3, then 1 in as many days. The iOS wrapper view's fold
  // was deleted (it wrote an empty style), and then the OWNER's went off Android once `focusable`
  // became a tag rule — worth TWO crossings on its own, because the touchable's `afterCommit`
  // settle re-commits the node and the fold is charged per commit, not per node.
  //
  // The ONE that remains is the text's, and it is the only fold left in this primitive: it needs the
  // BUTTON's `color` and `disabled` while its parent is the VIEW, so it reads a GRANDPARENT — an
  // ancestor seam `ownerProps` does not provide and nothing has built.
  //
  // THIS FIXTURE UNDERSTATES THE BUTTON, and the reason is worth keeping rather than fixing. It
  // writes props with `setProp`, so the app's `title` never takes the slot redirect that lives in
  // `routeProp`; the raw label stays empty, the commit walk drops an empty raw text from its
  // parent's child set, and the label's fold therefore never ran here at ALL. The two fixtures agree
  // at 1 today only because the label's fold is gone from both.
  it('pays one trip, and it is the text fold that reads a grandparent', () => {
    const one = commit({});
    print(`DEBUG button folds=${one.folds}`);
    expect(one.folds).toBe(1);
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
  // why: the ordinary case. A button with a handler is reachable by keyboard, TV remote and switch
  // control; one without is decoration and must not be.
  it('is focusable with a handler and not without one', () => {
    expect(focusableOf({}, noop)).toBe(true);
    expect(focusableOf({})).toBe(false);
  });

  // why: leg 3 in its plain form. A disabled button is not a focus stop, which is the difference
  // between a control a screen reader skips and one it lands on to do nothing.
  it('is not focusable while disabled', () => {
    expect(focusableOf({ disabled: true }, noop)).toBe(false);
  });

  // why: THE REASON BUTTON CANNOT SHARE THE TOUCHABLE'S RULE. `aria-disabled` alone disables a
  // button (`Button.js:337`), so it has to reach this expression — a rule reading only `disabled`
  // would leave an aria-disabled button in the focus order.
  it('lets aria-disabled alone take it out of the focus order', () => {
    expect(focusableOf({ 'aria-disabled': true }, noop)).toBe(false);
  });

  // why: and the third source, which is what an app writes when it is driving accessibility state
  // directly rather than through the alias.
  it('lets an authored accessibilityState.disabled do the same', () => {
    expect(focusableOf({ accessibilityState: { disabled: true } }, noop)).toBe(
      false,
    );
  });

  // why: THE PRECEDENCE, and it is the case a `||` over the three gets wrong. `??` means an
  // EXPLICIT `disabled: false` wins over an aria-disabled that says otherwise — the app's direct
  // answer beats the accessibility hint, not the other way round.
  it('lets an explicit disabled false beat aria-disabled', () => {
    expect(focusableOf({ disabled: false, 'aria-disabled': true }, noop)).toBe(
      true,
    );
  });

  // why: leg 1. An app opting a button out of the focus order deliberately still gets its way, and
  // `&&` means the opt-OUT is the one that cannot be overridden.
  it('honours an explicit focusable false', () => {
    expect(focusableOf({ focusable: false }, noop)).toBe(false);
  });

  // why: the flip after mount, which is the case a rule keyed on a listener has to survive. A
  // button that becomes pressable when its form validates is an ordinary screen.
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
