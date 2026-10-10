// StatusBar on Android: the shared declarative component with the engine's imperative statics
// attached to the function object, plus the `currentHeight` getter
//
// Metro picks this file on an Android host

import {
  statusBarImperative,
  statusBarCurrentHeight,
} from '@symbiote-native/engine';
import { StatusBarComponent, type IStatusBarComponent } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

const StatusBarAndroid = Object.assign(StatusBarComponent, statusBarImperative);

// A getter, not a value, so nothing touches native at import time
Object.defineProperty(StatusBarAndroid, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

export const StatusBar: IStatusBarComponent = StatusBarAndroid;
