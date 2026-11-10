import type { Component, Snippet } from 'svelte';
import type {
  IImageProps,
  ITextInputProps,
  ITextProps,
  IViewProps,
} from '@symbiote-native/svelte';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostBase } from '../core/animated-host-props';

// The props of a host tag, plus the animated style, the animated props and the animated ref
// A ref is a plain prop in Svelte, which the component calls with the node
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IAnimatedHostBase<Props> & {
    ref?: IAnimatedRef | ((node: unknown) => unknown);
    children?: Snippet;
  };

// What Svelte takes each animated host tag for
export type IAnimatedTags = {
  View: Component<IAnimatedHostProps<IViewProps>>;
  Text: Component<IAnimatedHostProps<ITextProps>>;
  Image: Component<IAnimatedHostProps<IImageProps>>;
  TextInput: Component<IAnimatedHostProps<ITextInputProps>>;
};
