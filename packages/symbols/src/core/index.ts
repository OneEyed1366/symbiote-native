export {
  SYMBOL_MODULE_NAME,
  ensureSymbolRegistered,
  loadSymbolFont,
  renderSymbolView,
  symbolFontOf,
  symbolViewName,
  unstable_getMaterialSymbolSourceAsync,
  watchSymbolFont,
} from './symbols';
export { androidSymbolToString } from './android';
export type { IAndroidSymbol, IAndroidSymbolWeight } from './android';
export type {
  IAnimationEffect,
  IAnimationSpec,
  IAnimationType,
  IContentMode,
  ISymbolName,
  ISymbolScale,
  ISymbolType,
  ISymbolViewProps,
  ISymbolWeight,
  IVariableAnimationSpec,
} from './symbol-types';
export type { SFSymbol } from 'sf-symbols-typescript';
