// The directive that owns a `ChangeDetectorRef` for the elements that actually need one.
//
// An `on*` PROP is forwarded to the engine node, and the ENGINE calls it — Angular is told nothing,
// so a plain field mutation inside the app's handler dirties no view. `createCallbackWrapper` fixes
// that with `markForCheck`, and until 2026-09-18 the ref it marked came from `SymbioteElement`
// injecting one on EVERY element, because any element MAY carry a callback.
//
// Almost none does. Priced on JavaScriptCore, an injection is ~1.0-2.4 us per element — 10-24 ms
// over the ten thousand of a thousand-row screen, all of it to build `ViewRef`s nothing reads
// (`core/engine/cpp/tests/js/angular-directive-cost.itest.ts`, the `ChangeDetectorRef` row).
//
// MATCHING IS THE CHEAPER QUESTION THAN INJECTING, and that had to be measured rather than assumed,
// because the selector below is dozens of alternatives and Angular tries a component's whole
// directive list against every element it creates. The ladder's `cb-probe` arm carries this exact
// string WITHOUT matching anything — the state of every element on the benchmark row — so the two
// halves are priced against each other in one process, rotated, with a resolution bar:
//
//   carrying the selector    4.3    5.9   -2.0    5.7   -1.5 ms   inside the bar in four of five
//   the ChangeDetectorRef    9.7   23.5   13.6   31.3   23.8 ms
//   the CALLBACK HOST       -3.9   -9.3  -25.5  -25.6  -25.3 ms   all five negative, three outside
//
// WHAT IS NOT VERIFIED, said plainly: the ladder's arm carries ONE element directive beside this one,
// where a real screen carries two dozen, and the `ng-elements` bench arm could not confirm the change
// at app scale — the machine it was measured on swung its untouched CONTROL from 229 to 566 ms, so
// nothing quoted off it would have carried a verdict either way. The controlled A/B is the evidence
// here; the bench-arm confirmation is owed.
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
  ChangeDetectorRef,
  Directive,
  ElementRef,
  Renderer2,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
  inject,
} from '@angular/core';
import {
  registerViewMarker,
  unregisterViewMarker,
} from './change-detection-flush';

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
export class SymbioteCallbackHost implements OnChanges, OnDestroy {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  private readonly detector = inject(ChangeDetectorRef);

  constructor() {
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null)
      registerViewMarker(node, this.detector);
  }

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

  ngOnDestroy(): void {
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null) unregisterViewMarker(node);
  }
}
