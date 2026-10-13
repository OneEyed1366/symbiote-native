import type { ComponentType, Ref } from 'react';
import type {
  IHostInstance,
  IImageProps,
  ITextInputProps,
  ITextProps,
  IViewProps,
} from '@symbiote-native/react';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostBase } from '../core/animated-host-props';

// The props of a host tag, plus the animated style, the animated props and the animated ref
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IAnimatedHostBase<Props> & {
    ref?: Ref<IHostInstance> | IAnimatedRef;
  };

// What React takes each animated host tag for
export type IAnimatedTags = {
  View: ComponentType<IAnimatedHostProps<IViewProps>>;
  Text: ComponentType<IAnimatedHostProps<ITextProps>>;
  Image: ComponentType<IAnimatedHostProps<IImageProps>>;
  TextInput: ComponentType<IAnimatedHostProps<ITextInputProps>>;
};
