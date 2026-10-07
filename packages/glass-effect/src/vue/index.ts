// @symbiote-native/glass-effect/vue: компоненты `GlassView` и `GlassContainer` поверх общего ядра

export { GlassContainer, GlassView } from './glass-effect';
export type {
  IGlassContainerVueProps as IGlassContainerProps,
  IGlassViewVueProps as IGlassViewProps,
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
