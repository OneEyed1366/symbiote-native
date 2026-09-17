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

  // why: THE PRICE, which was 4 here and is 3 since the derived-node port (2026-09-18): the iOS
  // wrapper view's fold was deleted outright, having written an empty style on the only platform
  // that builds that node.
  //
  // THIS FIXTURE UNDERSTATES THE BUTTON, and the reason is worth keeping rather than fixing. It
  // writes props with `setProp`, so the app's `title` never takes the slot redirect that lives in
  // `routeProp`; the raw label stays empty, the commit walk drops an empty raw text from its
  // parent's child set, and the label's fold therefore never ran here at ALL. So the label's port is
  // invisible in this number and shows up only in `button-derived-payload.itest.ts`, which drives
  // the same tag through `routeProp` and reads 5 -> 3.
  //
  // Left as it is because what this file is about is the OWNER's payload, and a fixture that
  // committed a label would not change one assertion above it. Named so the two counts are not read
  // as a contradiction.
  it('pays three trips now that the view fold is gone', () => {
    const one = commit({});
    print(`DEBUG button folds=${one.folds}`);
    expect(one.folds).toBe(3);
  });
});

report();
