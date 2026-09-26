// Android Fabric component names. Metro picks this file on an Android host.
// Each name is the ViewManager's REACT_CLASS in react-native/ReactAndroid/.../views/**.
// device-verify-pending: source-confirmed from RN's Android ViewManagers, proven on a
// real host by the absence of a "Can't find ViewManager '<name>'" red box.

import { ANCHOR_COMPONENT, VOID_COMPONENT } from '@symbiote-native/engine';

import {
  buildDescriptors,
  makeDescriptorFor,
  type ISymbioteIntrinsic,
} from './shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './shared';

const ANDROID_NAMES: Readonly<Record<ISymbioteIntrinsic, string>> = {
  view: 'RCTView',
  pressable: 'RCTView',
  'touchable-opacity': 'RCTView',
  // NOT a view name — TNF commits nothing at all, on either platform. See `shared.ts`.
  'touchable-native-feedback': ANCHOR_COMPONENT,
  'touchable-without-feedback': ANCHOR_COMPONENT,
  'touchable-highlight': 'RCTView',
  button: 'RCTView',
  text: 'RCTText',
  image: 'RCTImageView',
  'image-background': 'RCTView',
  'scroll-view': 'RCTScrollView',
  // RN's VScrollContentViewNativeComponent is `Platform.OS === 'android' ? View : …`,
  // so a vertical scroll's content is a plain RCTView on Android, not RCTScrollContentView.
  'scroll-content': 'RCTView',
  // Horizontal scroll on Android is its own ViewManager; RCTScrollView is vertical-only and
  // ignores `horizontal`. RN routes it to AndroidHorizontalScrollView with a dedicated content
  // view (HScrollViewNativeComponents.js: `Platform.OS === 'android' ? AndroidHorizontal… : …`).
  'horizontal-scroll-view': 'AndroidHorizontalScrollView',
  'horizontal-scroll-content': 'AndroidHorizontalScrollContentView',
  // Android has one text-input ViewManager for both single- and multiline.
  'text-input': 'AndroidTextInput',
  'text-input-multiline': 'AndroidTextInput',
  switch: 'AndroidSwitch',
  'activity-indicator': 'RCTView',
  'activity-indicator-spinner': 'AndroidProgressBar',
  // DELIBERATE DIVERGENCE FROM RN: `SafeAreaView.js` is a plain View on Android, with no insets.
  // `RCTSafeAreaView` applies the window insets there too (`ReactSafeAreaViewManager`), so one
  // screen is safe on both platforms.
  'safe-area-view': 'RCTSafeAreaView',
  modal: 'RCTModalHostView',
  'refresh-control': 'AndroidSwipeRefreshLayout',
  'sticky-header': 'RCTView',
  // `InputAccessoryView.js` on Android does `console.warn(...); return null` — the WHOLE
  // component, children included, renders NOTHING. `VOID_COMPONENT` matches vendor exactly: no
  // node, no children, on this platform only.
  'input-accessory-view': VOID_COMPONENT,
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(ANDROID_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
