// @symbiote-native/symbols/svelte: компонент `SymbolView` поверх общего ядра

export { default as SymbolView } from './symbol-view.svelte';
export type { ISymbolViewSvelteProps as ISymbolViewProps } from './symbol-props';
export {
  SYMBOL_MODULE_NAME,
  androidSymbolToString,
  symbolViewName,
  unstable_getMaterialSymbolSourceAsync,
  type IAndroidSymbol,
  type IAnimationSpec,
  type IContentMode,
  type ISymbolName,
  type ISymbolScale,
  type ISymbolType,
  type ISymbolWeight,
  type SFSymbol,
} from '../core';
