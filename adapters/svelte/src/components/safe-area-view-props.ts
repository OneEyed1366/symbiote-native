// `ISafeAreaViewProps`'s canonical home — see `view-props.ts`'s header comment for why this
// type lives in a plain `.ts` file rather than being re-exported straight out of
// `SafeAreaView.svelte`. No shared core/components layer exists for SafeAreaView (confirmed by
// inspecting the barrel) — React's and Vue's versions are both small, adapter-only wrappers with
// no JS-side translation, so this mirrors them directly.
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
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
  // `id` — accepted here and folded to `nativeID` by the shared plan (`ID_ALIAS` on the spec
  // entry). The two must move together: the alias without this prop folds a key no spelling
  // accepts, and this prop without the alias sends Fabric a raw `id` key it does not declare.
  id?: string;
  class?: ISvelteClassValue;
  onLayout?: (event: ISymbioteEvent) => void;
  children?: Snippet;
}
