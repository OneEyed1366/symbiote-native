// Android Fabric component names. Metro picks this file on an Android host.
// Each name is the ViewManager's REACT_CLASS in react-native/ReactAndroid/.../views/**.
// device-verify-pending: source-confirmed from RN's Android ViewManagers, proven on a
// real host by the absence of a "Can't find ViewManager '<name>'" red box.

import {
  buildDescriptors,
  makeDescriptorFor,
  type ISymbioteIntrinsic,
} from './shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './shared';

const ANDROID_NAMES: Readonly<Record<ISymbioteIntrinsic, string>> = {
  'symbiote-view': 'RCTView',
  'symbiote-pressable': 'RCTView',
  'symbiote-text': 'RCTText',
  'symbiote-image': 'RCTImageView',
  'symbiote-scroll-view': 'RCTScrollView',
  // RN's VScrollContentViewNativeComponent is `Platform.OS === 'android' ? View : …`,
  // so a vertical scroll's content is a plain RCTView on Android, not RCTScrollContentView.
  'symbiote-scroll-content': 'RCTView',
  // Horizontal scroll on Android is its own ViewManager; RCTScrollView is vertical-only and
  // ignores `horizontal`. RN routes it to AndroidHorizontalScrollView with a dedicated content
  // view (HScrollViewNativeComponents.js: `Platform.OS === 'android' ? AndroidHorizontal… : …`).
  'symbiote-horizontal-scroll-view': 'AndroidHorizontalScrollView',
  'symbiote-horizontal-scroll-content': 'AndroidHorizontalScrollContentView',
  // Android has one text-input ViewManager for both single- and multiline.
  'symbiote-text-input': 'AndroidTextInput',
  'symbiote-text-input-multiline': 'AndroidTextInput',
  // The component path's pair — same native views, a tag the behavior registry does not
  // carry. See `shared.ts` for why the wrapper may not share the lowered tag.
  'symbiote-text-input-managed': 'AndroidTextInput',
  'symbiote-text-input-multiline-managed': 'AndroidTextInput',
  'symbiote-switch': 'AndroidSwitch',
  // The wrapper's tag — same native view, a tag the behavior registry does not carry. See
  // `shared.ts` for why the wrapper may not share the lowered tag.
  'symbiote-switch-managed': 'AndroidSwitch',
  'symbiote-activity-indicator': 'AndroidProgressBar',
  // KNOWN DIVERGENCE FROM REACT NATIVE, and it is in our favour — recorded 2026-09-01 because it
  // was arrived at by accident, not decided. Upstream `SafeAreaView.js` is
  // `Platform.select({ ios: RCTSafeAreaViewNativeComponent, default: View })`, so RN's own JS
  // renders a plain View on Android and applies NO insets. `RCTSafeAreaView` does exist and is
  // registered (`ReactSafeAreaViewManager.REACT_CLASS`, wired in `MainReactPackage.kt:149`) and
  // does real window-inset math — so we inset where RN does not, and an app ported from RN gets
  // different Android layout with nothing to explain why.
  //
  // This table's rule is "the name is the ViewManager's REACT_CLASS", and by that rule the entry is
  // correct. What nobody checked is whether RN's JS ROUTES there. Left as-is deliberately: insetting
  // is the better behaviour and RN has deprecated its own component in favour of
  // react-native-safe-area-context. Invisible to every audit we have, because both of our paths
  // agree with each other and only disagree with RN — the boundary
  // `.claude/rules/adapter-parity-audit.md` states about itself.
  'symbiote-safe-area-view': 'RCTSafeAreaView',
  'symbiote-modal': 'RCTModalHostView',
  'symbiote-refresh-control': 'AndroidSwipeRefreshLayout',
  // iOS-only primitive; RN ships no Android InputAccessoryView. Degrade to a plain
  // container so an iOS-targeted usage doesn't red-box on Android.
  'symbiote-input-accessory-view': 'RCTView',
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(ANDROID_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
