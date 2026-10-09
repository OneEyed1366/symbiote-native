import type { ComponentType } from 'react';
import type {
  IImageProps,
  ITextInputProps,
  ITextProps,
  IViewProps,
} from '@symbiote-native/react';
import Upstream from 'react-native-reanimated';
import { AnimatedFlatList } from './animated-flat-list';
import { AnimatedScrollView } from './animated-scroll-view';
import type { IAnimatedHostProps } from './animated-host-props';

export type { IAnimatedHostProps };

// A host tag is what `createElement` takes as a component, which the type of a string cannot say
function isComponentOf<Props>(
  _tag: string,
): _tag is string & ComponentType<Props> {
  return true;
}

function animatedTag<Props extends { style?: unknown }>(
  tag: string,
): ComponentType<IAnimatedHostProps<Props>> {
  if (!isComponentOf<IAnimatedHostProps<Props>>(tag)) {
    throw new Error('unreachable');
  }
  return tag;
}

export const View = animatedTag<IViewProps>('view');
export const Text = animatedTag<ITextProps>('text');
export const Image = animatedTag<IImageProps>('image');
export const ScrollView = AnimatedScrollView;
export const FlatList = AnimatedFlatList;
export const TextInput = animatedTag<ITextInputProps>('text-input');

// There is no wrapper to make: every host node takes an animated style, so the component is its own
export function createAnimatedComponent<Component>(
  component: Component,
): Component {
  return component;
}

// The CSS-only twin: the engine seam claims a node's CSS, so this is the same identity
export const createCSSAnimatedComponent = createAnimatedComponent;

const { addWhitelistedNativeProps, addWhitelistedUIProps } = Upstream;

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent,
  addWhitelistedNativeProps,
  addWhitelistedUIProps,
};

export default Animated;
