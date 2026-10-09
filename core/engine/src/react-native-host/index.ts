// RN's own singletons (`UIManager`, `NativeModules`, `LogBox`, ...) sit on its Paper interop and
// dev tooling, so the engine forwards to the `react-native` module the app hands over at bootstrap

import type * as ReactNative from 'react-native';
import { invariant } from '../invariant';
import type { IDevSettings } from '../dev-settings';
import type { ILayoutAnimationConfig } from '../layout-animation/types';
import type { ISymbioteEvent } from '../node-types';

type IReactNative = typeof ReactNative;

let host: object | undefined;

export function setReactNativeHost(reactNative: object): void {
  host = reactNative;
}

// A getter on `react-native` loads its module on first read, which is why a member is read per call
function member(name: string): unknown {
  invariant(
    host !== undefined,
    'react-native is not wired: call `registerApp` or `bootstrapHost` first',
  );
  return Reflect.get(host, name);
}

// RN defines some modules as a class with statics (`Dimensions`, `PixelRatio`)
function memberObject(name: string): object {
  const value = member(name);
  invariant(
    (typeof value === 'object' || typeof value === 'function') &&
      value !== null,
    `react-native has no \`${name}\` module`,
  );
  return value;
}

// A Proxy rather than a method list: these modules also answer names RN adds per platform or per
// view manager
function hostObject<T extends object>(name: string): T {
  return new Proxy<T>(Object.create(null), {
    get(_target, key) {
      const real = memberObject(name);
      const value: unknown = Reflect.get(real, key);
      // Runs with `this` = the real module, yet a spy's `.mock` still reads through
      return typeof value === 'function'
        ? new Proxy(value, {
            apply: (fn, _this, args) => Reflect.apply(fn, real, args),
          })
        : value;
    },
    has: (_target, key) => key in memberObject(name),
    // Writes land on the real module, so a test spy or `I18nManager.isRTL = true` reaches RN's own
    set: (_target, key, value) => Reflect.set(memberObject(name), key, value),
    defineProperty: (_target, key, descriptor) =>
      Reflect.defineProperty(memberObject(name), key, descriptor),
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        memberObject(name),
        key,
      );
      return descriptor && { ...descriptor, configurable: true };
    },
  });
}

// The result is whatever RN's function returns, typed per export by the declarations below
// RN's `Pressability` class is not on the `react-native` index, so it has a loader of its own
export type IPressabilityHandlers = Record<
  string,
  (event: ISymbioteEvent) => unknown
>;

export type IPressability = {
  configure(config: object): void;
  reset(): void;
  getEventHandlers(): IPressabilityHandlers;
};

export type IPressabilityClass = new (config: object) => IPressability;

let pressabilityLoader: (() => IPressabilityClass) | undefined;
let pressability: IPressabilityClass | undefined;

// A loader, not the class: reading it loads RN's `Pressability`, which only `usePressability` needs
export function setPressabilityLoader(loader: () => IPressabilityClass): void {
  pressabilityLoader = loader;
  pressability = undefined;
}

export function loadPressability(): IPressabilityClass {
  invariant(
    pressabilityLoader !== undefined,
    'Pressability is not wired: call `registerApp` or `bootstrapHost` first',
  );
  pressability ??= pressabilityLoader();
  return pressability;
}

function callMember(name: string, args: unknown[]) {
  const value = member(name);
  invariant(typeof value === 'function', `react-native has no \`${name}\``);
  return Reflect.apply(value, undefined, args);
}

export const UIManager = hostObject<IReactNative['UIManager']>('UIManager');
export const NativeModules =
  hostObject<IReactNative['NativeModules']>('NativeModules');
// RN ships no types for the networking module
export const Networking = hostObject<Record<string, unknown>>('Networking');
export const LogBox = hostObject<IReactNative['LogBox']>('LogBox');
export const DevMenu = hostObject<IReactNative['DevMenu']>('DevMenu');
export const NativeComponentRegistry = hostObject<
  IReactNative['NativeComponentRegistry']
>('NativeComponentRegistry');
export const PushNotificationIOS = hostObject<
  IReactNative['PushNotificationIOS']
>('PushNotificationIOS');
export const Touchable = hostObject<IReactNative['Touchable']>('Touchable');
export const Dimensions = hostObject<IReactNative['Dimensions']>('Dimensions');
export const PixelRatio = hostObject<IReactNative['PixelRatio']>('PixelRatio');
export const I18nManager =
  hostObject<IReactNative['I18nManager']>('I18nManager');
export const Appearance = hostObject<IReactNative['Appearance']>('Appearance');
export const AppState = hostObject<IReactNative['AppState']>('AppState');
export const Settings = hostObject<IReactNative['Settings']>('Settings');
export const BackHandler =
  hostObject<IReactNative['BackHandler']>('BackHandler');
export const Linking = hostObject<IReactNative['Linking']>('Linking');
export const Alert = hostObject<IReactNative['Alert']>('Alert');
export const Share = hostObject<IReactNative['Share']>('Share');
export const Vibration = hostObject<IReactNative['Vibration']>('Vibration');
export const ToastAndroid =
  hostObject<IReactNative['ToastAndroid']>('ToastAndroid');
export const ActionSheetIOS =
  hostObject<IReactNative['ActionSheetIOS']>('ActionSheetIOS');
export const PermissionsAndroid =
  hostObject<IReactNative['PermissionsAndroid']>('PermissionsAndroid');
// RN's typings miss `checkConfig` and `setEnabled` and demand a `duration` that its code defaults
type ILayoutAnimationHost = Omit<
  IReactNative['LayoutAnimation'],
  'configChecker' | 'configureNext'
> & {
  configureNext(
    config: ILayoutAnimationConfig,
    onAnimationDidEnd?: () => void,
    onAnimationDidFail?: () => void,
  ): void;
  checkConfig(...args: unknown[]): void;
  setEnabled(enabled: boolean): void;
};
export const DevSettings = hostObject<IDevSettings>('DevSettings');
export const Systrace = hostObject<IReactNative['Systrace']>('Systrace');
export const LayoutAnimation =
  hostObject<ILayoutAnimationHost>('LayoutAnimation');
export const InteractionManager =
  hostObject<IReactNative['InteractionManager']>('InteractionManager');
export const DeviceEventEmitter =
  hostObject<IReactNative['DeviceEventEmitter']>('DeviceEventEmitter');

// RN's class, built with the native module whose observe counters it pings
export function createNativeEventEmitter(
  nativeModule?: object,
): InstanceType<IReactNative['NativeEventEmitter']> {
  const emitterClass = member('NativeEventEmitter');
  invariant(
    typeof emitterClass === 'function',
    'react-native has no `NativeEventEmitter`',
  );
  return Reflect.construct(emitterClass, [nativeModule]);
}

// The native name RN registers a ViewConfig for, which every adapter takes as an element type
export const requireNativeComponent: IReactNative['requireNativeComponent'] = (
  ...args
) => callMember('requireNativeComponent', args);
export const codegenNativeComponent: IReactNative['codegenNativeComponent'] = (
  ...args
) => callMember('codegenNativeComponent', args);
export const codegenNativeCommands: IReactNative['codegenNativeCommands'] = (
  ...args
) => callMember('codegenNativeCommands', args);
export const registerCallableModule: IReactNative['registerCallableModule'] = (
  ...args
) => callMember('registerCallableModule', args);
