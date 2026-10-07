// @symbiote-native/blur/react: компоненты `BlurView` и `BlurTargetView` поверх общего ядра

export { BlurTargetView, BlurView } from './blur';
export type {
  IBlurTargetViewReactProps as IBlurTargetViewProps,
  IBlurViewReactProps as IBlurViewProps,
} from './blur';
export {
  BLUR_MODULE_NAME,
  blurTargetViewName,
  blurViewName,
  type IBlurMethod,
  type IBlurTint,
} from '../core';
