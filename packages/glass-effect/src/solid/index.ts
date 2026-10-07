// @symbiote-native/glass-effect/solid: компоненты `GlassView` и `GlassContainer` поверх общего ядра

export { GlassContainer, GlassView } from './glass-effect';
export type {
  IGlassContainerSolidProps as IGlassContainerProps,
  IGlassViewSolidProps as IGlassViewProps,
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
