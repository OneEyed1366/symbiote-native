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
  'symbiote-view': 'RCTView',
  'symbiote-pressable': 'RCTView',
  'symbiote-text': 'RCTText',
  'symbiote-image': 'RCTImageView',
  'symbiote-scroll-view': 'RCTScrollView',
  'symbiote-scroll-content': 'RCTScrollContentView',
  // iOS uses one scroll view for both axes; horizontal is RCTScrollView with the
  // `horizontal` prop set, so these resolve identically to the vertical pair.
  'symbiote-horizontal-scroll-view': 'RCTScrollView',
  'symbiote-horizontal-scroll-content': 'RCTScrollContentView',
  'symbiote-text-input': 'RCTSinglelineTextInputView',
  'symbiote-text-input-multiline': 'RCTMultilineTextInputView',
  // The component path's pair — same native views, a tag the behavior registry does not
  // carry. See `shared.ts` for why the wrapper may not share the lowered tag.
  'symbiote-text-input-managed': 'RCTSinglelineTextInputView',
  'symbiote-text-input-multiline-managed': 'RCTMultilineTextInputView',
  'symbiote-switch': 'Switch',
  // The wrapper's tag — same native view, a tag the behavior registry does not carry. See
  // `shared.ts` for why the wrapper may not share the lowered tag.
  'symbiote-switch-managed': 'Switch',
  'symbiote-activity-indicator': 'ActivityIndicatorView',
  'symbiote-safe-area-view': 'SafeAreaView',
  'symbiote-modal': 'ModalHostView',
  'symbiote-refresh-control': 'PullToRefreshView',
  'symbiote-input-accessory-view': 'RCTInputAccessoryView',
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(IOS_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
