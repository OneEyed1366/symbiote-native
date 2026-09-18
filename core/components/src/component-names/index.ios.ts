// iOS Fabric component names. Metro picks this file on an iOS host; it is also the base
// (component-names.ts re-exports it) for headless tsx / tsc / web fallback.
// Fabric names are the codegen spec's registered name (the new-arch name), not the legacy
// paperComponentName (RCTSwitch, …).

import { ANCHOR_COMPONENT } from '@symbiote-native/engine';

import {
  buildDescriptors,
  makeDescriptorFor,
  type ISymbioteIntrinsic,
} from './shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './shared';

const IOS_NAMES: Readonly<Record<ISymbioteIntrinsic, string>> = {
  view: 'RCTView',
  pressable: 'RCTView',
  'touchable-opacity': 'RCTView',
  // NOT a view name — TNF commits nothing at all. See `shared.ts`. Platform-invariant, unlike
  // every other entry here: RN's TNF renders no view on either platform, it only stops CLONING a
  // background off Android (TouchableNativeFeedback.js:402).
  'touchable-native-feedback': ANCHOR_COMPONENT,
  'touchable-without-feedback': ANCHOR_COMPONENT,
  'touchable-highlight': 'RCTView',
  button: 'RCTView',
  text: 'RCTText',
  image: 'RCTImageView',
  'image-background': 'RCTView',
  'scroll-view': 'RCTScrollView',
  'scroll-content': 'RCTScrollContentView',
  // iOS uses one scroll view for both axes; horizontal is RCTScrollView with the
  // `horizontal` prop set, so these resolve identically to the vertical pair.
  'horizontal-scroll-view': 'RCTScrollView',
  'horizontal-scroll-content': 'RCTScrollContentView',
  'text-input': 'RCTSinglelineTextInputView',
  'text-input-multiline': 'RCTMultilineTextInputView',
  switch: 'Switch',
  'activity-indicator': 'RCTView',
  'activity-indicator-spinner': 'ActivityIndicatorView',
  'safe-area-view': 'SafeAreaView',
  modal: 'ModalHostView',
  'refresh-control': 'PullToRefreshView',
  'sticky-header': 'RCTView',
  'input-accessory-view': 'RCTInputAccessoryView',
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(IOS_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
