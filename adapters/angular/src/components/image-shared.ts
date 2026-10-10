// The input surface and prop fold `Animated.Image` builds on, the `<image>` tag is `ImageElement`
import { EventEmitter, computed, signal } from '@angular/core';
import {
  gateWanted,
  injectGateDemand,
  type IGatedAccessibilityEvent,
} from '../gate-demand';
import {
  imageStatics,
  type IAccessibilityProps,
  type IAriaProps,
  type IImageProps,
} from '@symbiote-native/components';
import { isSymbioteEvent, type ISymbioteEvent } from '@symbiote-native/engine';
import { resolveImageProps } from './image-props-resolve';

export { setImageSourceResolver } from '@symbiote-native/components';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';
export { IMAGE_INPUTS, IMAGE_OUTPUTS } from './image-inputs';
export { isImageEventCallback, resolveImageProps } from './image-props-resolve';

export abstract class ImageBase {
  static readonly getSize = imageStatics.getSize;
  static readonly getSizeWithHeaders = imageStatics.getSizeWithHeaders;
  static readonly prefetch = imageStatics.prefetch;
  static readonly abortPrefetch = imageStatics.abortPrefetch;
  static readonly queryCache = imageStatics.queryCache;
  static readonly resolveAssetSource = imageStatics.resolveAssetSource;

  source: unknown;
  defaultSource: unknown;
  loadingIndicatorSource: unknown;
  style: unknown;
  resizeMode: unknown;
  resizeMethod: IImageProps['resizeMethod'];
  resizeMultiplier: number | undefined;
  tintColor: unknown;
  blurRadius: number | undefined;
  capInsets: IImageProps['capInsets'];
  fadeDuration: number | undefined;
  progressiveRenderingEnabled: boolean | undefined;
  src: unknown;
  srcSet: unknown;
  alt: unknown;
  width: unknown;
  height: unknown;
  crossOrigin: unknown;
  referrerPolicy: unknown;

  testID: string | undefined;
  nativeID: string | undefined;
  accessible: boolean | undefined;
  accessibilityLabel: string | undefined;
  accessibilityHint: string | undefined;
  accessibilityRole: IAccessibilityProps['accessibilityRole'];
  accessibilityState: IAccessibilityProps['accessibilityState'];
  accessibilityValue: IAccessibilityProps['accessibilityValue'];
  accessibilityActions: IAccessibilityProps['accessibilityActions'];
  accessibilityLabelledBy: IAccessibilityProps['accessibilityLabelledBy'];
  importantForAccessibility: IAccessibilityProps['importantForAccessibility'];
  accessibilityLiveRegion: IAccessibilityProps['accessibilityLiveRegion'];
  screenReaderFocusable: boolean | undefined;
  accessibilityViewIsModal: boolean | undefined;
  accessibilityElementsHidden: boolean | undefined;
  accessibilityIgnoresInvertColors: boolean | undefined;
  accessibilityLanguage: string | undefined;
  accessibilityRespondsToUserInteraction: boolean | undefined;
  accessibilityShowsLargeContentViewer: boolean | undefined;
  accessibilityLargeContentTitle: string | undefined;

  role: IAriaProps['role'];
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  ariaLive: IAriaProps['aria-live'];
  ariaHidden: boolean | undefined;
  ariaBusy: boolean | undefined;
  ariaChecked: IAriaProps['aria-checked'];
  ariaDisabled: boolean | undefined;
  ariaExpanded: boolean | undefined;
  ariaSelected: boolean | undefined;
  ariaModal: boolean | undefined;
  ariaValueMax: number | undefined;
  ariaValueMin: number | undefined;
  ariaValueNow: number | undefined;
  ariaValueText: string | undefined;

  onAccessibilityAction: ((event: ISymbioteEvent) => void) | undefined;
  onAccessibilityTap: ((event: ISymbioteEvent) => void) | undefined;
  onMagicTap: ((event: ISymbioteEvent) => void) | undefined;
  onAccessibilityEscape: ((event: ISymbioteEvent) => void) | undefined;
  onLoadStart: ((event: ISymbioteEvent) => void) | undefined;
  onLoad: ((event: ISymbioteEvent) => void) | undefined;
  onLoadEnd: ((event: ISymbioteEvent) => void) | undefined;
  onError: ((event: ISymbioteEvent) => void) | undefined;
  onProgress: ((event: ISymbioteEvent) => void) | undefined;
  onPartialLoad: ((event: ISymbioteEvent) => void) | undefined;

  readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  readonly magicTap = new EventEmitter<ISymbioteEvent>();
  readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  readonly loadStart = new EventEmitter<ISymbioteEvent>();
  readonly load = new EventEmitter<ISymbioteEvent>();
  readonly loadEnd = new EventEmitter<ISymbioteEvent>();
  readonly error = new EventEmitter<ISymbioteEvent>();
  readonly progress = new EventEmitter<ISymbioteEvent>();
  readonly partialLoad = new EventEmitter<ISymbioteEvent>();

  // Null unless an adapter wrapper renders this Image in its own template — ImageBackground does.
  // An app's own `<Image>` gets null and answers from its own `.observed`.
  private readonly gateDemand = injectGateDemand();

  // The four accessibility events are boolean-GATED Fabric events
  // (`.claude/rules/fabric-boolean-event-gates.md`): native fires them only when the committed
  // payload carries a FUNCTION at that key. A template `(accessibilityAction)="..."` binding on the
  // intrinsic host lights the gate unconditionally; this reaches the app two ways — a plain
  // `[onAccessibilityAction]` @Input callback, or the `accessibilityAction` @Output — and the gate
  // must light only when at least one of the two is actually wired. Returned `undefined` means
  // `setEventListener` never sees a function, so the gate stays dark.
  protected gatedAccessibilityHandler(
    name: IGatedAccessibilityEvent,
    callback: ((event: ISymbioteEvent) => void) | undefined,
  ): ((event: Event) => void) | undefined {
    const emitter = this[name];
    // A WRAPPER's binding is not a subscriber, and `.observed` cannot tell the two apart.
    // ImageBackground renders this component and binds all four, so without the demand every
    // Image inside one lit its gates. See `gate-demand.ts`.
    if (!gateWanted(this.gateDemand, name, emitter) && callback === undefined)
      return undefined;
    return event => {
      if (!isSymbioteEvent(event)) return;
      callback?.(event);
      emitter.emit(event);
    };
  }

  handleLoadStart(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoadStart?.(event);
    this.loadStart.emit(event);
  }

  handleLoad(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoad?.(event);
    this.load.emit(event);
  }

  handleLoadEnd(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoadEnd?.(event);
    this.loadEnd.emit(event);
  }

  handleError(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onError?.(event);
    this.error.emit(event);
  }

  handleProgress(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onProgress?.(event);
    this.progress.emit(event);
  }

  handlePartialLoad(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onPartialLoad?.(event);
    this.partialLoad.emit(event);
  }

  // Three groups, so no single getter holds every input name at once
  protected get imageInputProps(): Record<string, unknown> {
    return {
      ...this.sourceInputProps,
      ...this.accessibilityInputProps,
      ...this.handlerInputProps,
    };
  }

  private get sourceInputProps(): Record<string, unknown> {
    return {
      source: this.source,
      defaultSource: this.defaultSource,
      loadingIndicatorSource: this.loadingIndicatorSource,
      style: this.style,
      resizeMode: this.resizeMode,
      resizeMethod: this.resizeMethod,
      resizeMultiplier: this.resizeMultiplier,
      tintColor: this.tintColor,
      blurRadius: this.blurRadius,
      capInsets: this.capInsets,
      fadeDuration: this.fadeDuration,
      progressiveRenderingEnabled: this.progressiveRenderingEnabled,
      src: this.src,
      srcSet: this.srcSet,
      alt: this.alt,
      width: this.width,
      height: this.height,
      crossOrigin: this.crossOrigin,
      referrerPolicy: this.referrerPolicy,
    };
  }

  private get accessibilityInputProps(): Record<string, unknown> {
    return {
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction:
        this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer:
        this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      ariaLabel: this.ariaLabel,
      ariaLabelledBy: this.ariaLabelledBy,
      ariaLive: this.ariaLive,
      ariaHidden: this.ariaHidden,
      ariaBusy: this.ariaBusy,
      ariaChecked: this.ariaChecked,
      ariaDisabled: this.ariaDisabled,
      ariaExpanded: this.ariaExpanded,
      ariaSelected: this.ariaSelected,
      ariaModal: this.ariaModal,
      ariaValueMax: this.ariaValueMax,
      ariaValueMin: this.ariaValueMin,
      ariaValueNow: this.ariaValueNow,
      ariaValueText: this.ariaValueText,
    };
  }

  private get handlerInputProps(): Record<string, unknown> {
    return {
      onAccessibilityAction: this.gatedAccessibilityHandler(
        'accessibilityAction',
        this.onAccessibilityAction,
      ),
      onAccessibilityTap: this.gatedAccessibilityHandler(
        'accessibilityTap',
        this.onAccessibilityTap,
      ),
      onMagicTap: this.gatedAccessibilityHandler('magicTap', this.onMagicTap),
      onAccessibilityEscape: this.gatedAccessibilityHandler(
        'accessibilityEscape',
        this.onAccessibilityEscape,
      ),
      onLoadStart: this.onLoadStart,
      onLoad: this.onLoad,
      onLoadEnd: this.onLoadEnd,
      onError: this.onError,
      onProgress: this.onProgress,
      onPartialLoad: this.onPartialLoad,
    };
  }

  // Bridges the non-reactive @Input fields into the reactive graph so imageProps below can be a
  // memoized computed(). Signal inputs would make this unnecessary, but `input()` is visible only
  // to the AOT compiler and this package's unit suite runs on JIT - see the
  // `angular-adapter-change-detection` skill, §6. `signal()`/`computed()` are plain runtime APIs
  // and need no compiler support, which is what makes this bridge possible at all.
  //
  // ImageBase is deliberately UNdecorated, so the ngOnChanges that bumps this lives on each
  // platform @Component instead of here.
  //
  // Every dependency of the bag below is an @Input, which Angular always routes through
  // ngOnChanges. State assigned OUTSIDE that path needs its OWN signal - never widen this one to
  // "bump on everything", which silently un-memoizes the bag. The platform anchor style is exactly
  // such a dependency and carries its own signal.
  protected readonly inputsRevision = signal(0);

  protected bumpInputsRevision(): void {
    this.inputsRevision.update(revision => revision + 1);
  }

  // A getter would rebuild the bag on every refresh, failing `[symbioteHostProps]`'s reference
  // check and re-pushing every key through Renderer2 -> routeProp for nothing. computed() returns
  // the SAME object until a tracked dependency changes, so the input setter skips the whole spread.
  //
  // A computed FIELD cannot be overridden by a subclass accessor the way a getter can, so the
  // platform components override buildImageProps() below and this stays the single memoization
  // point for every platform.
  readonly imageProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    return this.buildImageProps();
  });

  protected buildImageProps(): Record<string, unknown> {
    return resolveImageProps(this.imageInputProps);
  }
}
