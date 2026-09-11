// The `<safe-area-view>` tag's prop surface. The tag is matched by `SafeAreaViewElement`
// (`../elements`) and commits a single `SafeAreaView` native view whose host insets its children to
// the safe area; there is no JS-side translation to do, so the wrapper that used to fold
// aria/role and forward a host bag was deleted 2026-09-10 — the engine's own aria fold and the
// renderer's `id` -> `nativeID` alias cover both, on every path.
//
// The type stays for a component forwarding a bag, and because `IAngularSafeAreaViewProps` is
// public API. Mirrors React's ISafeAreaViewProps minus children, which Angular takes via
// `<ng-content>`.

import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export interface IAngularSafeAreaViewProps
  extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // `id` — accepted here and folded to `nativeID` by the renderer, matching upstream, whose
  // SafeAreaView takes the full ViewProps surface.
  id?: string;
  onLayout?: (event: ISymbioteEvent) => void;
}
