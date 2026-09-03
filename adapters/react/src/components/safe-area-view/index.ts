// SafeAreaView primitive. A plain view whose native side insets its children to
// the safe area (notch, rounded corners, system bars). There is no JS-side
// translation; RN just renders the native RCTSafeAreaView and lets the host do
// the inset math, so this maps style + children straight onto the intrinsic.

import { createElement, type FC, type ReactNode } from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // `id` — accepted here and folded to `nativeID` by the shared plan, matching upstream, whose
  // SafeAreaView takes the full ViewProps surface. Added 2026-09-01 with `ID_ALIAS` on the spec
  // entry, deliberately as ONE change: the alias without this prop would make lowering fold a key
  // no spelling of the component accepts, and this prop without the alias would send a raw `id`
  // to Fabric, which declares no such key on any of these views.
  id?: string;
  // Not destructured below, so it lands in ...accessibilityRest and forwards onto the intrinsic
  // like any other passthrough prop — resolves through the shared style registry.
  className?: string;
  children?: ReactNode;
  onLayout?: (event: ISymbioteEvent) => void;
}

export const SafeAreaView: FC<ISafeAreaViewProps> = rawProps => {
  // Owns its host element (symbiote-safe-area-view), so it folds aria/role here;
  // the resolved accessibility* surface rides the node via `...accessibilityRest`.
  const props = resolveAccessibilityProps(rawProps);
  const { style, children, onLayout, ...accessibilityRest } = props;

  dlog('SafeAreaView -> SafeAreaView');

  const nodeProps: Record<string, unknown> = { ...accessibilityRest, style };
  if (onLayout !== undefined) nodeProps.onLayout = onLayout;

  return createElement('symbiote-safe-area-view', nodeProps, children);
};
