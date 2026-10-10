// Что нативный Animated-модуль умеет анимировать, как `NativeAnimatedAllowlist` в RN
// Флаги RN `useSharedAnimatedBackend` и `shouldUseAnimatedObjectForTransform` по умолчанию выкл

const COLOR_STYLES = [
  'backgroundColor',
  'borderBottomColor',
  'borderColor',
  'borderEndColor',
  'borderLeftColor',
  'borderRightColor',
  'borderStartColor',
  'borderTopColor',
  'color',
  'tintColor',
] as const;

const OTHER_STYLES = [
  'borderBottomEndRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderBottomStartRadius',
  'borderEndEndRadius',
  'borderEndStartRadius',
  'borderRadius',
  'borderTopEndRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderTopStartRadius',
  'borderStartEndRadius',
  'borderStartStartRadius',
  'elevation',
  'opacity',
  'filter',
  'transform',
  'zIndex',
  'shadowOpacity',
  'shadowRadius',
  'scaleX',
  'scaleY',
  'translateX',
  'translateY',
] as const;

const TRANSFORMS = [
  'translateX',
  'translateY',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'perspective',
  'skewX',
  'skewY',
] as const;

const INTERPOLATION_PARAMS = [
  'inputRange',
  'outputRange',
  'extrapolate',
  'extrapolateRight',
  'extrapolateLeft',
] as const;

export type INativeColorStyle = (typeof COLOR_STYLES)[number];
export type INativeStyle = INativeColorStyle | (typeof OTHER_STYLES)[number];
export type INativeTransform = (typeof TRANSFORMS)[number];
export type INativeInterpolationParam = (typeof INTERPOLATION_PARAMS)[number];

const supportedColorStyles = new Set<string>(COLOR_STYLES);
const supportedStyles = new Set<string>([...COLOR_STYLES, ...OTHER_STYLES]);
const supportedTransforms = new Set<string>(TRANSFORMS);
const supportedInterpolationParams = new Set<string>(INTERPOLATION_PARAMS);

export function allowInterpolationParam(param: string): void {
  supportedInterpolationParams.add(param);
}

export function allowStyleProp(prop: string): void {
  supportedStyles.add(prop);
}

export function allowTransformProp(prop: string): void {
  supportedTransforms.add(prop);
}

export function isSupportedColorStyleProp(prop: string): boolean {
  return supportedColorStyles.has(prop);
}

export function isSupportedInterpolationParam(param: string): boolean {
  return supportedInterpolationParams.has(param);
}

export function isSupportedStyleProp(prop: string): boolean {
  return supportedStyles.has(prop);
}

export function isSupportedTransformProp(prop: string): boolean {
  return supportedTransforms.has(prop);
}
