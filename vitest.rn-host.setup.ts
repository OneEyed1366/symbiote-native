// The engine forwards RN's device modules through `setReactNativeHost`, which `bootstrapHost` calls
// on a device. A test gets the REAL upstream modules, so it runs RN's behavior

import { setReactNativeHost } from './core/engine/src/react-native-host';

// A path that ends in a platform name is the file RN's own `Platform.select` would have picked:
// BackHandler and ToastAndroid are Android-only behavior, Settings is iOS-only
const RN_MODULES: Record<string, string> = {
  Dimensions: 'react-native/Libraries/Utilities/Dimensions',
  PixelRatio: 'react-native/Libraries/Utilities/PixelRatio',
  I18nManager: 'react-native/Libraries/ReactNative/I18nManager',
  Appearance: 'react-native/Libraries/Utilities/Appearance',
  AppState: 'react-native/Libraries/AppState/AppState',
  Settings: 'react-native/Libraries/Settings/Settings.ios',
  BackHandler: 'react-native/Libraries/Utilities/BackHandler.android',
  Alert: 'react-native/Libraries/Alert/Alert',
  Linking: 'react-native/Libraries/Linking/Linking',
  Vibration: 'react-native/Libraries/Vibration/Vibration',
  Share: 'react-native/Libraries/Share/Share',
  ActionSheetIOS: 'react-native/Libraries/ActionSheetIOS/ActionSheetIOS',
  PermissionsAndroid:
    'react-native/Libraries/PermissionsAndroid/PermissionsAndroid',
  InteractionManager: 'react-native/Libraries/Interaction/InteractionManager',
  LayoutAnimation: 'react-native/Libraries/LayoutAnimation/LayoutAnimation',
  DevSettings: 'react-native/Libraries/Utilities/DevSettings',
  Systrace: 'react-native/Libraries/Performance/Systrace',
  DeviceEventEmitter:
    'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter',
  NativeEventEmitter: 'react-native/Libraries/EventEmitter/NativeEventEmitter',
  ToastAndroid:
    'react-native/Libraries/Components/ToastAndroid/ToastAndroid.android',
};

// `Appearance` has named exports only, the rest default-export the module
async function load(path: string): Promise<object> {
  const loaded = await import(/* @vite-ignore */ path);
  return 'default' in loaded ? loaded.default : loaded;
}

const entries = await Promise.all(
  Object.entries(RN_MODULES).map(
    async ([name, path]) => [name, await load(path)] as const,
  ),
);
setReactNativeHost(Object.fromEntries(entries));
