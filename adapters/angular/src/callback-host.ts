// The directive that CLAIMS an `on*` prop binding on a tag, and nothing more.
//
// Unclaimed, `[onPress]="fn"` on an element is NG0306 in dev mode (`setDomProperty` refuses `on*`
// DOM properties, `render3/instructions/shared.ts:296-298`), so something has to own the name. The
// renderer wraps the value on its way through and marks the view with `markForCheck` when the engine
// calls it. That view is found from the node when the callback FIRES (`change-detection-flush.ts`),
// so this directive injects no `ChangeDetectorRef`.
//
// Carrying the selector is free: Angular tries it against every element it creates, and the
// ladder's `cb-probe` arm priced that inside the resolution bar in four runs of five
// (`core/engine/cpp/tests/js/angular-directive-cost.itest.ts`).
//
// IT HOLDS NO INPUTS, which is what keeps the change off the public surface. The `on*` props stay
// declared on `SymbioteElement` and its subclasses, so every type and every forward is unchanged;
// this directive only needs to BE on the element, and a missing name in its selector costs a change
// detection mark rather than a prop. `callback-host-selector.test.ts` derives the list from the
// directives' own declared inputs so it cannot go stale quietly.
//
// A LEAF, like `change-detection-flush` and `renderer/value-change`: importing `elements.ts` from
// here would close a cycle, since that file is what puts this directive in `SYMBIOTE_ELEMENTS`.

import {
  Directive,
  ElementRef,
  Renderer2,
  type OnChanges,
  type SimpleChanges,
  inject,
} from '@angular/core';

/**
 * Every `on*` input any element directive declares, except the one that fires per FRAME.
 *
 * `onScroll` is absent deliberately and not by oversight: with sticky headers RN pins
 * `scrollEventThrottle` to 1, and `markForCheck` walks to the root, so wrapping it cost the canary
 * ~37fps. `isWrappableCallback` excludes it, and the guard test asserts this string does too.
 */
const CALLBACK_INPUTS = [
  'onAccessibilityAction',
  'onAccessibilityEscape',
  'onAccessibilityTap',
  'onBlur',
  'onChangeText',
  'onContentSizeChange',
  'onEndEditing',
  'onError',
  'onFocus',
  'onHoverIn',
  'onHoverOut',
  'onKeyPress',
  'onLayout',
  'onLoad',
  'onLoadEnd',
  'onLoadStart',
  'onLongPress',
  'onMagicTap',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'onMoveShouldSetResponder',
  'onMoveShouldSetResponderCapture',
  'onPartialLoad',
  'onPress',
  'onPressIn',
  'onPressMove',
  'onPressOut',
  'onProgress',
  'onRefresh',
  'onResponderEnd',
  'onResponderGrant',
  'onResponderMove',
  'onResponderReject',
  'onResponderRelease',
  'onResponderStart',
  'onResponderTerminate',
  'onResponderTerminationRequest',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onScrollToTop',
  'onSelectionChange',
  'onStartShouldSetResponder',
  'onStartShouldSetResponderCapture',
  'onSubmitEditing',
  'onValueChange',
] as const;

/**
 * THE SAME NAMES AS A LITERAL, and the duplication is forced rather than chosen.
 *
 * ngtsc STATICALLY EVALUATES a decorator's metadata, and a selector built with `.map().join()` is not
 * something it can evaluate — it reports the class as `Component imports must be standalone
 * components, directives, pipes, or must be NgModules`, which reads as a missing `standalone: true`
 * and is not that. Thirty-seven of this adapter's compile-time guards went red on it at once.
 *
 * So the selector is written out, and `callback-host-selector.test.ts` holds the two in step.
 */
export const CALLBACK_ATTRIBUTE_SELECTOR =
  '[onAccessibilityAction],[onAccessibilityEscape],[onAccessibilityTap],[onBlur],' +
  '[onChangeText],[onContentSizeChange],[onEndEditing],[onError],[onFocus],[onHoverIn],[onHoverOut],' +
  '[onKeyPress],[onLayout],[onLoad],[onLoadEnd],[onLoadStart],[onLongPress],[onMagicTap],' +
  '[onMomentumScrollBegin],[onMomentumScrollEnd],[onMoveShouldSetResponder],' +
  '[onMoveShouldSetResponderCapture],[onPartialLoad],[onPress],[onPressIn],[onPressMove],' +
  '[onPressOut],[onProgress],[onRefresh],[onResponderEnd],[onResponderGrant],[onResponderMove],' +
  '[onResponderReject],[onResponderRelease],[onResponderStart],[onResponderTerminate],' +
  '[onResponderTerminationRequest],[onScrollBeginDrag],[onScrollEndDrag],[onScrollToTop],' +
  '[onSelectionChange],[onStartShouldSetResponder],[onStartShouldSetResponderCapture],' +
  '[onSubmitEditing],[onValueChange]';

/** Exported for the guard alone — the decorator below must spell its own list for ngtsc. */
export const CALLBACK_INPUT_NAMES: readonly string[] = CALLBACK_INPUTS;

@Directive({
  selector:
    '[onAccessibilityAction],[onAccessibilityEscape],[onAccessibilityTap],[onBlur],' +
    '[onContentSizeChange],[onEndEditing],[onError],[onFocus],[onHoverIn],[onHoverOut],' +
    '[onKeyPress],[onLayout],[onLoad],[onLoadEnd],[onLoadStart],[onLongPress],[onMagicTap],' +
    '[onMomentumScrollBegin],[onMomentumScrollEnd],[onMoveShouldSetResponder],' +
    '[onMoveShouldSetResponderCapture],[onPartialLoad],[onPress],[onPressIn],[onPressMove],' +
    '[onPressOut],[onProgress],[onRefresh],[onResponderEnd],[onResponderGrant],[onResponderMove],' +
    '[onResponderReject],[onResponderRelease],[onResponderStart],[onResponderTerminate],' +
    '[onResponderTerminationRequest],[onScrollBeginDrag],[onScrollEndDrag],[onScrollToTop],' +
    '[onSelectionChange],[onStartShouldSetResponder],[onStartShouldSetResponderCapture],' +
    '[onSubmitEditing],[onValueChange]',
  // DECLARED, and this is not an optimisation — it is what makes withholding the tag directives
  // possible at all. `ɵɵproperty` on an element no directive claimed ends in `setDomProperty`, which
  // runs `validateAgainstEventProperties` and THROWS NG0306 on any name beginning with `on`
  // (upstream `sanitization/sanitization.ts:267`). So an `on*` prop is not merely unwrapped without a
  // claiming input — it is a hard runtime error, and the first attempt at this change hit it on the
  // first test that binds one.
  //
  // The TYPES still come from `SymbioteElement` and its subclasses, which ngtsc goes on matching from
  // the decorator's selector however empty the runtime array is. Angular requires an expression to
  // satisfy EVERY directive that claims the input, so a permissive declaration here cannot loosen the
  // exact one there.
  inputs: [
    'onAccessibilityAction',
    'onAccessibilityEscape',
    'onAccessibilityTap',
    'onBlur',
    'onContentSizeChange',
    'onEndEditing',
    'onError',
    'onFocus',
    'onHoverIn',
    'onHoverOut',
    'onKeyPress',
    'onLayout',
    'onLoad',
    'onLoadEnd',
    'onLoadStart',
    'onLongPress',
    'onMagicTap',
    'onMomentumScrollBegin',
    'onMomentumScrollEnd',
    'onMoveShouldSetResponder',
    'onMoveShouldSetResponderCapture',
    'onPartialLoad',
    'onPress',
    'onPressIn',
    'onPressMove',
    'onPressOut',
    'onProgress',
    'onRefresh',
    'onResponderEnd',
    'onResponderGrant',
    'onResponderMove',
    'onResponderReject',
    'onResponderRelease',
    'onResponderStart',
    'onResponderTerminate',
    'onResponderTerminationRequest',
    'onScrollBeginDrag',
    'onScrollEndDrag',
    'onScrollToTop',
    'onSelectionChange',
    'onStartShouldSetResponder',
    'onStartShouldSetResponderCapture',
    'onSubmitEditing',
    'onValueChange',
  ],
  standalone: true,
})
export class SymbioteCallbackHost implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    // The renderer wraps the value on its way through, so this forwards it raw — same shape as the
    // tag directives' own forward, and the only place a withheld tag's callback can now come from.
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}
