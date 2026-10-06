// Ядро `GlassView` и `GlassContainer`, порт expo-glass-effect, нативное только на iOS
import {
  Platform,
  requireNativeModule,
  requireNativeViewManager,
} from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDescriptor,
  IResponderProps,
} from '@symbiote-native/components';
import { defineExpoNativeViews } from '@symbiote-native/engine';
import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export const GLASS_EFFECT_MODULE_NAME = 'ExpoGlassEffect';
const GLASS_VIEW_NAME = 'GlassView';
const GLASS_CONTAINER_NAME = 'GlassContainer';

export type IGlassStyle = 'clear' | 'regular' | 'none';

export type IGlassEffectStyleConfig = {
  /** The glass effect style to apply */
  style: IGlassStyle;
  /**
   * Whether to animate the style change
   * @default false
   */
  animate?: boolean;
  /** Duration of the animation in seconds, the system default when omitted */
  animationDuration?: number;
};

export type IGlassColorScheme = 'auto' | 'light' | 'dark';

type IViewSurface = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

export type IGlassViewProps = IViewSurface & {
  /**
   * A style name or a config object that controls the animation
   * @default 'regular'
   */
  glassEffectStyle?: IGlassStyle | IGlassEffectStyleConfig;
  tintColor?: IColorValue;
  /**
   * @default false
   */
  isInteractive?: boolean;
  /**
   * Overrides the system appearance when the app has its own theme toggle
   * @default 'auto'
   */
  colorScheme?: IGlassColorScheme;
};

export type IGlassContainerProps = IViewSurface & {
  /** The distance at which glass elements start affecting each other */
  spacing?: number;
};

// Эти ключи имеют смысл только у нативного view, у обычного View их быть не должно
const GLASS_VIEW_KEYS: ReadonlySet<string> = new Set<keyof IGlassViewProps>([
  'glassEffectStyle',
  'tintColor',
  'isInteractive',
  'colorScheme',
]);
const GLASS_CONTAINER_KEYS: ReadonlySet<string> = new Set<
  keyof IGlassContainerProps
>(['spacing']);

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const views = defineExpoNativeViews(
  requireNativeViewManager,
  GLASS_EFFECT_MODULE_NAME,
  { glass: GLASS_VIEW_NAME, container: GLASS_CONTAINER_NAME },
);

export const glassViewName = views.glass.name;
export const glassContainerName = views.container.name;
export const ensureGlassViewRegistered = views.glass.ensureRegistered;
export const ensureGlassContainerRegistered = views.container.ensureRegistered;

function runsOnIos(): boolean {
  return Platform.select({ ios: true, default: false });
}

function withoutKeys(
  props: object,
  keys: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !keys.has(key)),
  );
}

// `object`, а не тип пропсов: Vue и Angular отдают нетипизированный набор атрибутов
export function renderGlassView(props: object): IDescriptor {
  if (!runsOnIos()) return el('view', withoutKeys(props, GLASS_VIEW_KEYS));
  if (!ensureGlassViewRegistered()) {
    console.warn('GlassView is not available on this platform');
    return el('view', withoutKeys(props, GLASS_VIEW_KEYS));
  }
  return el(glassViewName(), { ...props });
}

export function renderGlassContainer(props: object): IDescriptor {
  if (!runsOnIos()) {
    return el('view', withoutKeys(props, GLASS_CONTAINER_KEYS));
  }
  if (!ensureGlassContainerRegistered()) {
    console.warn('GlassContainer is not available on this platform');
    return el('view', withoutKeys(props, GLASS_CONTAINER_KEYS));
  }
  return el(glassContainerName(), { ...props });
}

let isLiquidGlass: boolean | undefined;
let isGlassApi: boolean | undefined;

/**
 * Whether the app renders with the Liquid Glass design, component availability only
 * Accessibility settings can still limit the effect, see `AccessibilityInfo`
 * @platform ios
 */
export function isLiquidGlassAvailable(): boolean {
  if (!runsOnIos()) return false;
  isLiquidGlass ??= !!Reflect.get(
    requireNativeModule(GLASS_EFFECT_MODULE_NAME),
    'isLiquidGlassAvailable',
  );
  return isLiquidGlass;
}

/**
 * Whether the Liquid Glass API exists at runtime, some iOS 26 betas lack it and crash
 * Check before using `GlassView` and `GlassContainer`
 * @platform ios
 */
export function isGlassEffectAPIAvailable(): boolean {
  if (!runsOnIos()) return false;
  isGlassApi ??= !!Reflect.get(
    requireNativeModule(GLASS_EFFECT_MODULE_NAME),
    'isGlassEffectAPIAvailable',
  );
  return isGlassApi;
}
