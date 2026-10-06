// The base classes of every element directive, split from `./elements` for file size
import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  ErrorHandler,
  Input,
  Renderer2,
  inject,
} from '@angular/core';
import type { OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import {
  registerViewFlush,
  unregisterViewFlush,
} from './change-detection-flush';
import type { IElementProps } from './element-props';

/**
 * The prop surface all tags accept, and the ONE generic loop that puts a claimed binding back on
 * the engine node, since a directive input claims it before `Renderer2.setProperty` is reached
 */
@Directive()
export abstract class SymbioteElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  protected readonly host = inject(ElementRef);

  // No `ChangeDetectorRef` here: it cost ~1.0-2.4 us on every tag of a screen to serve the few that
  // carry an `on*` prop. `SymbioteCallbackHost` owns one and matches on the callback attributes
  // (`core/engine/cpp/tests/js/angular-directive-cost.itest.ts`)

  // No `on*` wrapper either: `SymbioteRenderer.setProperty` handles it, and most directives are
  // withheld from runtime matching (`./runtime-matching`)

  @Input() testID?: IElementProps['testID'];
  @Input() nativeID?: IElementProps['nativeID'];
  @Input() id?: IElementProps['id'];
  @Input() accessible?: IElementProps['accessible'];
  @Input() accessibilityLabel?: IElementProps['accessibilityLabel'];
  @Input() accessibilityHint?: IElementProps['accessibilityHint'];
  @Input() accessibilityRole?: IElementProps['accessibilityRole'];
  @Input() accessibilityState?: IElementProps['accessibilityState'];
  @Input() accessibilityValue?: IElementProps['accessibilityValue'];
  @Input() accessibilityActions?: IElementProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: IElementProps['accessibilityLabelledBy'];
  @Input()
  importantForAccessibility?: IElementProps['importantForAccessibility'];
  @Input() accessibilityLiveRegion?: IElementProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: IElementProps['screenReaderFocusable'];
  @Input() accessibilityViewIsModal?: IElementProps['accessibilityViewIsModal'];
  @Input()
  accessibilityElementsHidden?: IElementProps['accessibilityElementsHidden'];
  @Input()
  accessibilityIgnoresInvertColors?: IElementProps['accessibilityIgnoresInvertColors'];
  @Input() accessibilityLanguage?: IElementProps['accessibilityLanguage'];
  @Input()
  accessibilityRespondsToUserInteraction?: IElementProps['accessibilityRespondsToUserInteraction'];
  @Input()
  accessibilityShowsLargeContentViewer?: IElementProps['accessibilityShowsLargeContentViewer'];
  @Input()
  accessibilityLargeContentTitle?: IElementProps['accessibilityLargeContentTitle'];
  @Input() onAccessibilityAction?: IElementProps['onAccessibilityAction'];
  @Input() onAccessibilityTap?: IElementProps['onAccessibilityTap'];
  @Input() onMagicTap?: IElementProps['onMagicTap'];
  @Input() onAccessibilityEscape?: IElementProps['onAccessibilityEscape'];

  // The web aliases: native reads only `accessibility*`, the engine folds these on the way in
  @Input() role?: IElementProps['role'];
  @Input() 'aria-label'?: IElementProps['aria-label'];
  @Input() 'aria-labelledby'?: IElementProps['aria-labelledby'];
  @Input() 'aria-live'?: IElementProps['aria-live'];
  @Input() 'aria-hidden'?: IElementProps['aria-hidden'];
  @Input() 'aria-busy'?: IElementProps['aria-busy'];
  @Input() 'aria-checked'?: IElementProps['aria-checked'];
  @Input() 'aria-disabled'?: IElementProps['aria-disabled'];
  @Input() 'aria-expanded'?: IElementProps['aria-expanded'];
  @Input() 'aria-selected'?: IElementProps['aria-selected'];
  @Input() 'aria-modal'?: IElementProps['aria-modal'];
  @Input() 'aria-valuemax'?: IElementProps['aria-valuemax'];
  @Input() 'aria-valuemin'?: IElementProps['aria-valuemin'];
  @Input() 'aria-valuenow'?: IElementProps['aria-valuenow'];
  @Input() 'aria-valuetext'?: IElementProps['aria-valuetext'];

  // The responder gates return a boolean, which an Angular `(event)` binding cannot carry back, so
  // the whole family is inputs
  @Input()
  onStartShouldSetResponder?: IElementProps['onStartShouldSetResponder'];
  @Input()
  onStartShouldSetResponderCapture?: IElementProps['onStartShouldSetResponderCapture'];
  @Input() onMoveShouldSetResponder?: IElementProps['onMoveShouldSetResponder'];
  @Input()
  onMoveShouldSetResponderCapture?: IElementProps['onMoveShouldSetResponderCapture'];
  @Input() onResponderGrant?: IElementProps['onResponderGrant'];
  @Input() onResponderReject?: IElementProps['onResponderReject'];
  @Input() onResponderStart?: IElementProps['onResponderStart'];
  @Input() onResponderMove?: IElementProps['onResponderMove'];
  @Input() onResponderEnd?: IElementProps['onResponderEnd'];
  @Input() onResponderRelease?: IElementProps['onResponderRelease'];
  @Input() onResponderTerminate?: IElementProps['onResponderTerminate'];
  @Input()
  onResponderTerminationRequest?: IElementProps['onResponderTerminationRequest'];

  @Input() pointerEvents?: IElementProps['pointerEvents'];
  @Input() hitSlop?: IElementProps['hitSlop'];
  @Input() focusable?: IElementProps['focusable'];
  @Input() collapsable?: IElementProps['collapsable'];
  @Input() removeClippedSubviews?: IElementProps['removeClippedSubviews'];
  @Input()
  renderToHardwareTextureAndroid?: IElementProps['renderToHardwareTextureAndroid'];
  @Input() shouldRasterizeIOS?: IElementProps['shouldRasterizeIOS'];
  @Input()
  needsOffscreenAlphaCompositing?: IElementProps['needsOffscreenAlphaCompositing'];
  // `[style]` and `[class]` are declared for the type check only, no input claims them at run time
  // An RN style array or press-state function throws in Angular's styling engine, so it goes
  // through `[styleProp]`; the press-state callback sits here as a subclass cannot widen an input
  @Input() style?: IElementProps['style'];
  @Input() styleProp?: IElementProps['styleProp'];

  // `ɵɵclassMap` hands over a string, `[class.foo]` and `[ngClass]` arrive as `addClass`
  @Input() class?: string;

  // The flat-bag spelling of the events below, `(press)` and `[onPress]` land in the same place
  @Input() onPress?: IElementProps['onPress'];
  @Input() onPressIn?: IElementProps['onPressIn'];
  @Input() onPressOut?: IElementProps['onPressOut'];
  @Input() onPressMove?: IElementProps['onPressMove'];
  @Input() onLongPress?: IElementProps['onLongPress'];
  @Input() onLayout?: IElementProps['onLayout'];
  @Input() onFocus?: IElementProps['onFocus'];
  @Input() onBlur?: IElementProps['onBlur'];

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes)) {
      // The renderer wraps an `on*` value itself
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
    }
  }
}

/**
 * The base for `<text-input>`, `<switch>` and `<refresh-control>`, whose app callback a behavior
 * reads back inside the same microtask turn. Zoneless change detection is a macrotask, so without
 * this flush the behavior sees the pre-event value (`./change-detection-flush`)
 */
@Directive()
export abstract class ReadBackElement
  extends SymbioteElement
  implements OnDestroy
{
  // Three tags reach this class, so the injection is paid here and not on every element
  private readonly detector = inject(ChangeDetectorRef);
  private readonly errorHandler = inject(ErrorHandler);

  constructor() {
    super();
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null) {
      registerViewFlush(node, () => this.flush());
    }
  }

  // Reported, not rethrown: this runs from a native event dispatch, where an uncaught throw has
  // nowhere to go but `RCTFatal`
  private flush(): void {
    try {
      this.detector.detectChanges();
    } catch (error: unknown) {
      this.errorHandler.handleError(error);
    }
  }

  ngOnDestroy(): void {
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null) unregisterViewFlush(node);
  }
}
