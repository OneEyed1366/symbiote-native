// `ISafeAreaViewProps`'s canonical home — see `view-props.ts`'s header comment for why this
// type lives in a plain `.ts` file rather than being re-exported straight out of
// `SafeAreaView.svelte`. No shared core/components layer exists for SafeAreaView (confirmed by
// inspecting the barrel) — React's and Vue's versions are both small, adapter-only wrappers with
// no JS-side translation, so this mirrors them directly.
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // `id` — accepted here and folded to `nativeID` by the shared plan, matching upstream, whose
  // SafeAreaView takes the full ViewProps surface. Added 2026-09-01 with `ID_ALIAS` on the spec
  // entry, deliberately as ONE change: the alias without this prop would make lowering fold a key
  // no spelling of the component accepts, and this prop without the alias would send a raw `id` to
  // Fabric, which declares no such key on any of these views.
  id?: string;
  class?: ISvelteClassValue;
  onLayout?: (event: ISymbioteEvent) => void;
  children?: Snippet;
}
