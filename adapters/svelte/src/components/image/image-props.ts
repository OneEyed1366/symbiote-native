// `IImageProps`'s canonical home. The shared @symbiote-native/components base (source/src/srcSet/
// resizeMode/tintColor/blurRadius/capInsets/alt/width/height/load events + accessibility/aria) is
// already framework-agnostic — no children, no ref, no render callback — so it is reused VERBATIM
// (no Svelte-specific field beyond `class`), per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>,
// mirroring switch-props.ts's own verbatim-reuse precedent.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { IImageProps as IImageBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type IImageProps = IImageBaseProps & { class?: ISvelteClassValue };
