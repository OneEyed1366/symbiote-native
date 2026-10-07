// Ядро `BlurView` и `BlurTargetView`, порт `BlurView.tsx` из expo-blur
import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDescriptor,
  IResponderProps,
} from '@symbiote-native/components';
import {
  defineExpoNativeViews,
  getNativeTag,
  isSymbioteNode,
  whenCommitted,
} from '@symbiote-native/engine';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export const BLUR_MODULE_NAME = 'ExpoBlur';
const BLUR_VIEW_NAME = 'ExpoBlurView';
const BLUR_TARGET_VIEW_NAME = 'ExpoBlurTargetView';

const BLUR_METHODS = [
  'none',
  'dimezisBlurView',
  'dimezisBlurViewSdk31Plus',
] as const;

/** Метод размытия на Android: `none` это полупрозрачный view, остальные нативный BlurView */
export type IBlurMethod = (typeof BLUR_METHODS)[number];

const DEFAULT_BLUR_METHOD: IBlurMethod = BLUR_METHODS[0];

export type IBlurTint =
  | 'light'
  | 'dark'
  | 'default'
  | 'extraLight'
  | 'regular'
  | 'prominent'
  | 'systemUltraThinMaterial'
  | 'systemThinMaterial'
  | 'systemMaterial'
  | 'systemThickMaterial'
  | 'systemChromeMaterial'
  | 'systemUltraThinMaterialLight'
  | 'systemThinMaterialLight'
  | 'systemMaterialLight'
  | 'systemThickMaterialLight'
  | 'systemChromeMaterialLight'
  | 'systemUltraThinMaterialDark'
  | 'systemThinMaterialDark'
  | 'systemMaterialDark'
  | 'systemThickMaterialDark'
  | 'systemChromeMaterialDark';

type IViewSurface = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

// `blurTarget` не здесь: у каждого адаптера свой тип ref
export type IBlurViewProps = IViewSurface & {
  /** @default 'default' */
  tint?: IBlurTint;
  /**
   * Сила размытия от 1 до 100
   * @default 50
   */
  intensity?: number;
  /**
   * Делитель силы размытия на Android
   * @default 4
   * @platform android
   */
  blurReductionFactor?: number;
  /**
   * @deprecated Use `blurMethod` instead
   * @platform android
   */
  experimentalBlurMethod?: IBlurMethod;
  /**
   * @default 'none'
   * @platform android
   */
  blurMethod?: IBlurMethod;
};

export type IBlurTargetViewProps = IViewSurface;

// Эти ключи разбираются здесь, остальное уходит на View как есть
const BLUR_KEYS: ReadonlySet<string> = new Set<keyof IBlurViewProps>([
  'tint',
  'intensity',
  'blurReductionFactor',
  'experimentalBlurMethod',
  'blurMethod',
]);

const ABSOLUTE_FILL = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const CONTAINER_STYLE = { backgroundColor: 'transparent' };

const DEPRECATED_METHOD_WARNING =
  'The `experimentalBlurMethod` prop has been depracated. Please use the `blurMethod` prop instead.';

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const views = defineExpoNativeViews(
  requireNativeViewManager,
  BLUR_MODULE_NAME,
  {
    blur: BLUR_VIEW_NAME,
    target: BLUR_TARGET_VIEW_NAME,
  },
);

export const blurViewName = views.blur.name;
export const blurTargetViewName = views.target.name;
export const ensureBlurRegistered = views.blur.ensureRegistered;
export const ensureBlurTargetRegistered = views.target.ensureRegistered;

function isBlurMethod(value: unknown): value is IBlurMethod {
  return BLUR_METHODS.some(method => method === value);
}

function blurMethodOf(props: object): IBlurMethod {
  const provided: unknown = Reflect.get(props, 'blurMethod');
  const deprecated: unknown = Reflect.get(props, 'experimentalBlurMethod');
  if (isBlurMethod(provided)) return provided;
  return isBlurMethod(deprecated) ? deprecated : DEFAULT_BLUR_METHOD;
}

/** Предупреждения из `componentDidMount` upstream, зовутся один раз при монтировании */
export function warnBlurProps(props: object, hasBlurTarget: boolean): void {
  const method = blurMethodOf(props);
  const isAndroidTarget = Platform.select({ android: true, default: false });
  if (isAndroidTarget && method !== DEFAULT_BLUR_METHOD && !hasBlurTarget) {
    console.warn(
      `You have selected the "${method}" blur method, but the \`blurTarget\` prop has not been configured. The blur view will fallback to "none" blur method to avoid errors. You can learn more about the new BlurView API at: https://docs.expo.dev/versions/latest/sdk/blur-view/`,
    );
  }
  if (Reflect.get(props, 'experimentalBlurMethod') != null) {
    console.warn(DEPRECATED_METHOD_WARNING);
  }
}

/**
 * Отдаёт нативный тег цели размытия после её коммита, у не-узла отдаёт `undefined`
 * Адаптер сам приводит свой ref к host-узлу, возвращённая функция отменяет ожидание
 */
export function watchBlurTarget(
  target: unknown,
  onId: (id: number | undefined) => void,
): () => void {
  if (!isSymbioteNode(target)) {
    onId(undefined);
    return () => {};
  }
  return whenCommitted(target, () => onId(getNativeTag(target)));
}

// `object`, а не тип пропсов: Vue и Angular отдают нетипизированный набор атрибутов
export function renderBlurView(
  props: object,
  blurTargetId: number | null | undefined,
): IDescriptor {
  const hostProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !BLUR_KEYS.has(key)),
  );
  const style = [CONTAINER_STYLE, Reflect.get(props, 'style')];
  if (!ensureBlurRegistered()) {
    console.warn('BlurView is not available on this platform');
    return el('view', { ...hostProps, style });
  }

  const tint: unknown = Reflect.get(props, 'tint');
  const intensity: unknown = Reflect.get(props, 'intensity');
  const reduction: unknown = Reflect.get(props, 'blurReductionFactor');
  const native = el(blurViewName(), {
    ...(blurTargetId === undefined ? {} : { blurTargetId }),
    tint: tint ?? 'default',
    intensity: intensity ?? 50,
    blurReductionFactor: reduction ?? 4,
    blurMethod: blurMethodOf(props),
    style: ABSOLUTE_FILL,
  });
  return el('view', { ...hostProps, style }, [native]);
}

// Нативная цель размытия есть только на Android, на iOS это обычный View
export function renderBlurTargetView(props: object): IDescriptor {
  const hostProps = { ...props };
  if (!Platform.select({ android: true, default: false })) {
    return el('view', hostProps);
  }
  if (!ensureBlurTargetRegistered()) {
    console.warn('BlurTargetView is not available on this platform');
    return el('view', hostProps);
  }
  return el(blurTargetViewName(), hostProps);
}
