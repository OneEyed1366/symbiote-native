import type { Component, Ref } from 'solid-js';
import type {
  IHostInstance,
  IImageProps,
  ITextInputProps,
  ITextProps,
  IViewProps,
} from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostBase } from '../core/animated-host-props';

// The props of a host tag, plus the animated style, the animated props and the animated ref
// A Solid ref takes a callback, so the animated ref goes in as the function it is
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IAnimatedHostBase<Props> & {
    ref?: Ref<IHostInstance> | IAnimatedRef;
    children?: JSX.Element;
  };

// What Solid takes each animated host tag for
export type IAnimatedTags = {
  View: Component<IAnimatedHostProps<IViewProps>>;
  Text: Component<IAnimatedHostProps<ITextProps>>;
  Image: Component<IAnimatedHostProps<IImageProps>>;
  TextInput: Component<IAnimatedHostProps<ITextInputProps>>;
};
