// The prop shape shared by every Touchable* wrapper (TouchableOpacity/Highlight/
// WithoutFeedback) — the Svelte twin of Vue's `ITouchableBaseProps`
// (adapters/vue/src/components/touchable.ts) and React's
// (adapters/react/src/components/touchable/index.ts). Lives in its own top-level file, not
// inside one of the `touchable-*/` folders: each wrapper is its own `.svelte` file/folder (a
// Svelte component can only default-export one component per file, unlike React's/Vue's single
// `touchable.ts` module holding all three), so the shared base needs a home none of them owns.
import type { Snippet } from 'svelte';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IPressTimingProps } from '@symbiote-native/components';
import type { IPressableProps } from './pressable/pressable-props';
import type { ISvelteClassValue } from '../class-value';

// Touchable* children are plain (never a function of press state) — the feedback IS the state
// visualization, so the wrapper never needs to re-expose `pressed` to its own children.
export type ITouchableBaseProps = Omit<
  IPressableProps,
  'style' | 'class' | 'children'
> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
    class?: ISvelteClassValue;
    children?: Snippet;
  };
