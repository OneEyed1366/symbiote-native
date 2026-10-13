import type { DefineComponent, Ref } from '@vue/runtime-core';
import type {
  IHostInstance,
  IImageProps,
  ITextInputProps,
  ITextProps,
  IViewProps,
} from '@symbiote-native/vue';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostBase } from '../core/animated-host-props';

// The props of a host tag, plus the animated style, the animated props and the animated ref
// A template ref takes a function or a ref, so the animated ref goes in as a function
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IAnimatedHostBase<Props> & {
    ref?: Ref<IHostInstance | null> | IAnimatedRef | string;
  };

// What Vue takes each animated host tag for
export type IAnimatedTags = {
  View: DefineComponent<IAnimatedHostProps<IViewProps>>;
  Text: DefineComponent<IAnimatedHostProps<ITextProps>>;
  Image: DefineComponent<IAnimatedHostProps<IImageProps>>;
  TextInput: DefineComponent<IAnimatedHostProps<ITextInputProps>>;
};
