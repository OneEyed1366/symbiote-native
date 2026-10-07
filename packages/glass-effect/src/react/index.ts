// @symbiote-native/glass-effect/react: компоненты `GlassView` и `GlassContainer` поверх общего ядра

export { GlassContainer, GlassView } from './glass-effect';
export type {
  IGlassContainerReactProps as IGlassContainerProps,
  IGlassViewReactProps as IGlassViewProps,
} from './glass-effect';
export {
  GLASS_EFFECT_MODULE_NAME,
  glassContainerName,
  glassViewName,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type IGlassColorScheme,
  type IGlassEffectStyleConfig,
  type IGlassStyle,
} from '../core';
