// @symbiote-native/symbols/react: компонент `SymbolView` поверх общего ядра

export { SymbolView } from './symbol-view';
export type { ISymbolViewReactProps as ISymbolViewProps } from './symbol-view';
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
