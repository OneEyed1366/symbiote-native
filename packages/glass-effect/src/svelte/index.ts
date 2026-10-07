// @symbiote-native/glass-effect/svelte: компоненты `GlassView` и `GlassContainer` поверх общего ядра

export { default as GlassContainer } from './glass-container.svelte';
export { default as GlassView } from './glass-view.svelte';
export type {
  IGlassContainerSvelteProps as IGlassContainerProps,
  IGlassViewSvelteProps as IGlassViewProps,
} from './glass-props';
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
