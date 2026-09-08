// iOS Fabric component names. Metro picks this file on an iOS host; it is also the base
// (component-names.ts re-exports it) for headless tsx / tsc / web fallback.
// Fabric names are the codegen spec's registered name (the new-arch name), not the legacy
// paperComponentName (RCTSwitch, …).

import {
  buildDescriptors,
  makeDescriptorFor,
  type ISymbioteIntrinsic,
} from './shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './shared';

const IOS_NAMES: Readonly<Record<ISymbioteIntrinsic, string>> = {
  view: 'RCTView',
  pressable: 'RCTView',
  text: 'RCTText',
  image: 'RCTImageView',
  'scroll-view': 'RCTScrollView',
  'scroll-content': 'RCTScrollContentView',
  // iOS uses one scroll view for both axes; horizontal is RCTScrollView with the
  // `horizontal` prop set, so these resolve identically to the vertical pair.
  'horizontal-scroll-view': 'RCTScrollView',
  'horizontal-scroll-content': 'RCTScrollContentView',
  'text-input': 'RCTSinglelineTextInputView',
  'text-input-multiline': 'RCTMultilineTextInputView',
  // The component path's pair — same native views, a tag the behavior registry does not
  // carry. See `shared.ts` for why the wrapper may not share the lowered tag.
  'text-input-managed': 'RCTSinglelineTextInputView',
  'text-input-multiline-managed': 'RCTMultilineTextInputView',
  switch: 'Switch',
  // The wrapper's tag — same native view, a tag the behavior registry does not carry. See
  // `shared.ts` for why the wrapper may not share the lowered tag.
  'switch-managed': 'Switch',
  'activity-indicator': 'ActivityIndicatorView',
  'safe-area-view': 'SafeAreaView',
  modal: 'ModalHostView',
  'refresh-control': 'PullToRefreshView',
  'sticky-header': 'RCTView',
  'input-accessory-view': 'RCTInputAccessoryView',
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(IOS_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
