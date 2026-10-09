// StatusBar on iOS: the shared component with the engine's statics attached, like RN
// `currentHeight` is Android-only, so it is absent here

import { statusBarImperative } from '@symbiote-native/engine';
import { StatusBarComponent, type IStatusBarComponent } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

export const StatusBar: IStatusBarComponent = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);
