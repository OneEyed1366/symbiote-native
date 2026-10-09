// Narrows the untyped `Animated.Image` input bag into the props `renderImage` takes
import {
  renderImage,
  resolveAccessibilityProps,
  type IImageSourceProp,
  type IResizeMode,
} from '@symbiote-native/components';
import {
  isBoolean,
  isNumber,
  isProcessableColor,
  isString,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';

type IGuard = (value: unknown) => boolean;

function isAny(): boolean {
  return true;
}

// Input key -> the guard its value must pass. A union, object or handler is checked by Angular's
// template type check, so it gets `isAny` and goes through as it came
const PASSTHROUGH_GUARDS: Readonly<Record<string, IGuard>> = {
  resizeMethod: isAny,
  resizeMultiplier: isNumber,
  blurRadius: isNumber,
  capInsets: isAny,
  fadeDuration: isNumber,
  progressiveRenderingEnabled: isBoolean,
  testID: isString,
  nativeID: isString,
  accessible: isBoolean,
  accessibilityLabel: isString,
  accessibilityHint: isString,
  accessibilityRole: isAny,
  accessibilityState: isAny,
  accessibilityValue: isAny,
  accessibilityActions: isAny,
  accessibilityLabelledBy: isAny,
  importantForAccessibility: isAny,
  accessibilityLiveRegion: isAny,
  screenReaderFocusable: isBoolean,
  accessibilityViewIsModal: isBoolean,
  accessibilityElementsHidden: isBoolean,
  accessibilityIgnoresInvertColors: isBoolean,
  accessibilityLanguage: isString,
  accessibilityRespondsToUserInteraction: isBoolean,
  accessibilityShowsLargeContentViewer: isBoolean,
  accessibilityLargeContentTitle: isString,
  role: isAny,
  ariaLabel: isString,
  ariaLabelledBy: isString,
  ariaLive: isAny,
  ariaHidden: isBoolean,
  ariaBusy: isBoolean,
  ariaChecked: isAny,
  ariaDisabled: isBoolean,
  ariaExpanded: isBoolean,
  ariaSelected: isBoolean,
  ariaModal: isBoolean,
  ariaValueMax: isNumber,
  ariaValueMin: isNumber,
  ariaValueNow: isNumber,
  ariaValueText: isString,
  onAccessibilityAction: isAny,
  onAccessibilityTap: isAny,
  onMagicTap: isAny,
  onAccessibilityEscape: isAny,
  onLoadStart: isAny,
  onLoad: isAny,
  onLoadEnd: isAny,
  onError: isAny,
  onProgress: isAny,
  onPartialLoad: isAny,
};

// The name a template binds -> the `aria-*` prop RN spells
const ARIA_PROP_NAMES: Readonly<Record<string, string>> = {
  ariaLabel: 'aria-label',
  ariaLabelledBy: 'aria-labelledby',
  ariaLive: 'aria-live',
  ariaHidden: 'aria-hidden',
  ariaBusy: 'aria-busy',
  ariaChecked: 'aria-checked',
  ariaDisabled: 'aria-disabled',
  ariaExpanded: 'aria-expanded',
  ariaSelected: 'aria-selected',
  ariaModal: 'aria-modal',
  ariaValueMax: 'aria-valuemax',
  ariaValueMin: 'aria-valuemin',
  ariaValueNow: 'aria-valuenow',
  ariaValueText: 'aria-valuetext',
};

const RESIZE_MODES = [
  'cover',
  'contain',
  'stretch',
  'repeat',
  'center',
  'none',
] as const satisfies readonly IResizeMode[];

function narrowTo<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
): T | undefined {
  return guard(value) ? value : undefined;
}

function isSource(value: unknown): value is IImageSourceProp {
  return (
    typeof value === 'number' || (typeof value === 'object' && value !== null)
  );
}

function isStyle(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

function isCrossOrigin(
  value: unknown,
): value is 'anonymous' | 'use-credentials' {
  return value === 'anonymous' || value === 'use-credentials';
}

export function isImageEventCallback(
  value: unknown,
): value is (event: ISymbioteEvent) => void {
  return typeof value === 'function';
}

// An animated bag may carry the RN `aria-*` spelling instead of the name a template binds
function inputValue(input: Record<string, unknown>, key: string): unknown {
  const rnName = ARIA_PROP_NAMES[key];
  return input[key] ?? (rnName === undefined ? undefined : input[rnName]);
}

function passthroughOf(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const passthrough: Record<string, unknown> = {};
  for (const [key, guard] of Object.entries(PASSTHROUGH_GUARDS)) {
    const value = inputValue(input, key);
    passthrough[ARIA_PROP_NAMES[key] ?? key] = guard(value) ? value : undefined;
  }
  return passthrough;
}

export function resolveImageProps(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return renderImage({
    source: narrowTo(input['source'], isSource),
    defaultSource: narrowTo(input['defaultSource'], isSource),
    loadingIndicatorSource: narrowTo(input['loadingIndicatorSource'], isSource),
    style: narrowTo(input['style'], isStyle),
    resizeMode: RESIZE_MODES.find(mode => mode === input['resizeMode']),
    tintColor: narrowTo(input['tintColor'], isProcessableColor),
    src: narrowTo(input['src'], isString),
    srcSet: narrowTo(input['srcSet'], isString),
    alt: narrowTo(input['alt'], isString),
    width: narrowTo(input['width'], isNumber),
    height: narrowTo(input['height'], isNumber),
    crossOrigin: narrowTo(input['crossOrigin'], isCrossOrigin),
    referrerPolicy: narrowTo(input['referrerPolicy'], isString),
    passthrough: resolveAccessibilityProps(passthroughOf(input)),
  }).props;
}
